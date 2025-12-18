import {createStuffDocumentsChain} from "langchain/chains/combine_documents";
import {ChatPromptTemplate} from "@langchain/core/prompts";
import {ChatGoogleGenerativeAI} from "@langchain/google-genai";
import {StringOutputParser} from "@langchain/core/output_parsers";
import {OllamaEmbeddings} from "@langchain/ollama";
import {MongoClient} from "mongodb";
import {MongoDBAtlasVectorSearch} from "@langchain/mongodb";
import dotenv from "dotenv";

dotenv.config();

export async function GET(req) {
  let client;
  try {
    const {
      MONGODB_URI,
      MONGODB_DB,
      MONGODB_COLLECTION,
      MONGODB_INDEX,
      OLLAMA_BASE_URL,
      GOOGLE_API_KEY,
    } = process.env;

    if (!MONGODB_URI || !MONGODB_DB || !MONGODB_COLLECTION || !MONGODB_INDEX) {
      return Response.json(
        {
          error:
            "Missing Mongo config. Set MONGODB_URI, MONGODB_DB, MONGODB_COLLECTION, MONGODB_INDEX.",
        },
        {status: 500}
      );
    }
    if (!GOOGLE_API_KEY) {
      return Response.json(
        {error: "Missing GOOGLE_API_KEY for the chat model."},
        {status: 500}
      );
    }

    const url = new URL(req.url);
    const question = url.searchParams.get("q") || "What is task decomposition?";

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);
    const collection = db.collection(MONGODB_COLLECTION);

    const embeddings = new OllamaEmbeddings({
      model: "nomic-embed-text",
      baseUrl: OLLAMA_BASE_URL || "http://localhost:11434",
    });

    const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
      collection,
      indexName: MONGODB_INDEX,
      textKey: "text",
      embeddingKey: "embedding",
    });

    const retriever = vectorStore.asRetriever({
      k: 15,
    });

    const prompt = ChatPromptTemplate.fromMessages([
      [
        "human",
        `You are an assistant for question-answering tasks. 
                    Use the following pieces of retrieved context to answer the question. 
                    If you don't know the answer, just say that you don't know.
                    Use three sentences maximum and keep the answer concise.
                    Question: {question} 
                    Context: {context} 
                    Answer:`,
      ],
    ]);

    const model = new ChatGoogleGenerativeAI({
      model: "gemini-1.5-pro",
      maxOutputTokens: 2048,
      apiKey: GOOGLE_API_KEY,
    });

    const ragChain = await createStuffDocumentsChain({
      llm: model,
      prompt,
      outputParser: new StringOutputParser(),
    });

    const retrievedDocs = await retriever.invoke(question);

    let resutls = await ragChain.invoke({
      question,
      context: retrievedDocs,
    });

    return Response.json({retrievedDocs, resutls});
  } catch (error) {
    console.error(error);
    return Response.json({error: "Internal Server Error"}, {status: 500});
  } finally {
    if (client) {
      await client.close();
    }
  }
}
