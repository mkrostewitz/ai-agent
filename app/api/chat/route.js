// Import necessary libraries and components
import {ChatMessageHistory} from "langchain/stores/message/in_memory";
import {HumanMessage, AIMessage} from "@langchain/core/messages";
import {Ollama} from "@langchain/ollama";
import {OllamaEmbeddings} from "@langchain/ollama";
import {MongoClient} from "mongodb";

// Create a chat history to store messages
const mainChatMessageHistory = new ChatMessageHistory();

// Define the main function that handles POST requests

export async function POST(req) {
  let client;
  try {
    // Get the user's question from the request

    const {question} = await req.json();
    const {MONGODB_URI, MONGODB_DB, MONGODB_COLLECTION, OLLAMA_BASE_URL} =
      process.env;

    if (!question) {
      return new Response(
        JSON.stringify({error: "Missing `question` in request body."}),
        {
          status: 400,
          headers: {"Content-Type": "application/json"},
        }
      );
    }

    if (!MONGODB_URI || !MONGODB_DB || !MONGODB_COLLECTION) {
      return new Response(
        JSON.stringify({
          error:
            "Missing MongoDB config. Set MONGODB_URI, MONGODB_DB, MONGODB_COLLECTION.",
        }),
        {
          status: 500,
          headers: {"Content-Type": "application/json"},
        }
      );
    }

    // Connect to Mongo and build retriever
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);
    const collection = db.collection(MONGODB_COLLECTION);

    const embeddings = new OllamaEmbeddings({
      model: "nomic-embed-text",
      baseUrl: OLLAMA_BASE_URL || "http://localhost:11434",
    });

    // Manual retrieval: embed the question, score against stored vectors, and pick top hits
    const queryEmbedding = await embeddings.embedQuery(question);

    const cursor = collection.find({});
    const allDocs = await cursor.toArray();

    const cosineSimilarity = (a, b) => {
      const dot = a.reduce((sum, val, idx) => sum + val * (b[idx] || 0), 0);
      const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
      const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
      if (!normA || !normB) return 0;
      return dot / (normA * normB);
    };

    const scored = allDocs
      .map((doc) => ({
        doc,
        score: cosineSimilarity(doc.embedding || [], queryEmbedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const context = scored
      .map(({doc}) => {
        const page = doc.loc?.pageNumber || doc.metadata?.loc?.pageNumber;
        return `- (p.${page ?? "?"}) ${doc.text || doc.pageContent || ""}`;
      })
      .join("\n");

    const trimmedContext =
      context.length > 1500 ? context.slice(0, 1500) : context;

    console.log(
      "RAG: chunks=",
      scored.length,
      "contextChars=",
      context.length,
      "trimmedChars=",
      trimmedContext.length
    );

    // Set up the AI model (Ollama) with specific configurations
    const model = new Ollama({
      model: "phi3:mini",
      baseUrl: OLLAMA_BASE_URL || "http://localhost:11434",
      stream: true,
      temperature: 0.2,
      maxTokens: 2000,
    });

    const prompt = `You are a replica of me, Mathias Krostewitz answering questions about Mathias Krostewitz using the supplied CV context. 
- Use only the provided context; if the answer is not there, say you don't know.
- Respond in 1-2 sentences, natural wording, no bullet lists.

Context:
${trimmedContext || "No relevant context found."}

Question: ${question}
Answer:`;

    // Add the user's question to the chat history
    await mainChatMessageHistory.addMessage(new HumanMessage(question));
    // Create a stream to handle the AI's response
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = "";
        let buffer = "";
        let lastWord = "";
        const genStart = Date.now();
        // Process the AI's response in chunks

        for await (const chunk of await model.stream(prompt)) {
          fullResponse += chunk;
          buffer += chunk;
          // Send everything up to the last whitespace to avoid splitting words
          const boundaryMatch = buffer.match(/[\s\S]*\s/);
          if (boundaryMatch && boundaryMatch[0].length > 0) {
            const complete = boundaryMatch[0];
            const wordCount = complete
              .trim()
              .split(/\s+/)
              .filter(Boolean).length;
            // Throttle sends: only flush when we have at least ~6 words
            if (wordCount >= 6) {
              controller.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({
                    text: complete,
                  })
                )
              );
              buffer = buffer.slice(complete.length);
            }
          } else {
            // If there's no whitespace for a long time (very long token), flush to avoid stalling
            if (buffer.length > 200) {
              controller.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({
                    text: buffer,
                  })
                )
              );
              buffer = "";
            }
          }
        }
        // Send any remaining content

        if (buffer) {
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({
                text: buffer,
                lastWord: lastWord,
                isLast: true,
              })
            )
          );
        }
        // Add the AI's full response to the chat history
        await mainChatMessageHistory.addMessage(new AIMessage(fullResponse));
        const genMs = Date.now() - genStart;
        console.log(
          "Generation finished: ms=",
          genMs,
          "chars=",
          fullResponse.length
        );
        controller.close();
      },
    });
    // Return the stream as the response

    return new Response(stream, {
      headers: {"Content-Type": "application/json"},
    });
  } catch (error) {
    // Handle any errors and return an error response

    console.error(error);
    return new Response(JSON.stringify({error: error.message}), {
      status: 500,
      headers: {"Content-Type": "application/json"},
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
}
