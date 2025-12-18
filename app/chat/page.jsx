"use client";
import React, {useState, useRef, useEffect} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {Prism as SyntaxHighlighter} from "react-syntax-highlighter";
import {vscDarkPlus} from "react-syntax-highlighter/dist/esm/styles/prism";
import {motion, AnimatePresence} from "framer-motion";
import {FiSend, FiUser, FiCpu} from "react-icons/fi";

// Default chat options for quick start
const defaultOptions = [
  "Tell me about the latest AI advancements",
  "Explain quantum computing",
  "What are the best practices in cybersecurity?",
  "How does blockchain technology work?",
];

// Markdown component to render formatted text
const Markdown = ({content}) => {
  // Normalize spacing and recover list/line breaks for better Markdown rendering
  const processedContent = content
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\\*/g, "*") // Unescape asterisks
    .replace(/\\"/g, '"') // Unescape quotation marks
    .replace(/##""##/g, "") // Remove ##""## artifacts
    .replace(/""\s*([^:]+):\*\*/g, '**"$1:"**') // Handle ""Text:** pattern
    .replace(/""([^"]+)""/g, '"$1"') // Handle double quotes
    .replace(/(\w+:)"/g, '$1"') // Fix quotes after colons
    .replace(/\*\*"([^"]+)"\*\*/g, '**"$1"**') // Ensure quotes inside bold text
    // Insert line breaks before list-style markers so markdown lists render
    .replace(/([^\n])(\s*)([-•]\s)/g, "$1\n$3")
    .replace(/([^\n])(\s*)(\d+\.\s)/g, "$1\n$3")
    // Clean up excessive blank lines
    .replace(/\n{3,}/g, "\n\n");

  return (
    <ReactMarkdown
      className="prose mt-1 w-full break-words prose-p:leading-relaxed py-3 px-3 mark-down"
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({node, ...props}) => (
          <a {...props} style={{color: "#27afcf", fontWeight: "bold"}} />
        ),
        code({node, inline, className, children, ...props}) {
          const match = /language-(\w+)/.exec(className || "");
          return !inline && match ? (
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={match[1]}
              PreTag="div"
              {...props}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        // Add a custom paragraph renderer to preserve line breaks
        p: ({children}) => <p className="whitespace-pre-line">{children}</p>,
        ul: ({children}) => (
          <ul className="list-disc pl-6 space-y-1 whitespace-normal">
            {children}
          </ul>
        ),
        ol: ({children}) => (
          <ol className="list-decimal pl-6 space-y-1 whitespace-normal">
            {children}
          </ol>
        ),
        li: ({children}) => <li className="leading-relaxed">{children}</li>,
        strong: ({children}) => (
          <strong className="font-bold">{children}</strong>
        ),
        blockquote: ({children}) => (
          <blockquote className="border-l-4 border-gray-500 pl-4 py-2 my-2 italic bg-gray-800 rounded">
            {children}
          </blockquote>
        ),
      }}
    >
      {processedContent}
    </ReactMarkdown>
  );
};

// Main ChatStream component
const ChatStream = () => {
  // State variables for managing chat
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatStarted, setChatStarted] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingQueueRef = useRef([]);
  const chatContainerRef = useRef(null);

  // Scroll to bottom of chat when new messages are added
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("question submitted:", question);
    await startChat(question);
  };

  // Start or continue the chat
  const startChat = async (initialQuestion) => {
    // Update state and prepare for chat
    setChatStarted(true);
    setQuestion("");
    setIsThinking(true);

    setMessages((prev) => [
      ...prev,
      {type: "user", content: initialQuestion},
      {type: "ai", content: ""},
    ]);

    console.log("messages after user input:", messages);

    try {
      // Send request to chat API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({question: initialQuestion}),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle the streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let lastWord = "";
      let receivedFirstChunk = false;

      // Read the stream chunk by chunk
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const {text, lastWord: newLastWord, isLast} = JSON.parse(chunk);

        // Remove duplicated trailing words between chunks before we start typing
        let shouldPrefixSpace = false;
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage?.type === "ai") {
            const trimmed = lastMessage.content.trimEnd();
            if (lastWord && trimmed.endsWith(lastWord)) {
              lastMessage.content = trimmed
                .slice(0, -lastWord.length)
                .trimEnd();
            }
            shouldPrefixSpace = lastMessage.content.length > 0;
          }
          return newMessages;
        });

        // Queue up text for the typewriter effect
        if (text) {
          const textToType = `${shouldPrefixSpace ? " " : ""}${text}`;
          typingQueueRef.current.push(...textToType);
          if (!isTyping) {
            setIsTyping(true);
          }
        }

        if (!receivedFirstChunk) {
          setIsThinking(false);
          receivedFirstChunk = true;
        }

        lastWord = newLastWord;

        if (isLast) break;
      }
      setIsThinking(false);
    } catch (error) {
      // Handle errors
      console.error("Error in chat:", error);
      setMessages((prev) => [
        ...prev,
        {
          type: "error",
          content: "An error occurred while processing your request.",
        },
      ]);
      setIsThinking(false);
    }
  };

  // Typewriter effect: gradually drain the queue onto the latest AI message
  useEffect(() => {
    if (!isTyping) return;

    const interval = setInterval(() => {
      const nextChar = typingQueueRef.current.shift();

      if (!nextChar) {
        setIsTyping(false);
        clearInterval(interval);
        return;
      }

      setMessages((prev) => {
        const newMessages = [...prev];
        const lastIndex = newMessages.length - 1;
        if (newMessages[lastIndex]?.type === "ai") {
          newMessages[lastIndex] = {
            ...newMessages[lastIndex],
            content: newMessages[lastIndex].content + nextChar,
          };
        }
        return newMessages;
      });

      if (typingQueueRef.current.length === 0) {
        setIsTyping(false);
        clearInterval(interval);
      }
    }, 18);

    return () => clearInterval(interval);
  }, [isTyping]);

  const ThinkingIndicator = () => (
    <div className="flex items-center space-x-1">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{animationDelay: `${dot * 0.18}s`}}
        />
      ))}
    </div>
  );

  // Render the chat interface
  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-950 text-gray-100">
      <div className="w-full md:w-4/5 lg:w-3/5 flex flex-col h-screen">
        {/* Chat messages container */}
        <div
          ref={chatContainerRef}
          className="flex-grow p-6 overflow-y-auto space-y-6 custom-scrollbar"
        >
          <AnimatePresence>
            {/* Map through messages and display them */}
            {messages.map((message, index) => {
              const isLatestAI =
                message.type === "ai" && index === messages.length - 1;
              const showThinking = isLatestAI && isThinking && !message.content;

              return (
                <motion.div
                  key={index}
                  initial={{opacity: 0, y: 20}}
                  animate={{opacity: 1, y: 0}}
                  exit={{opacity: 0, y: -20}}
                  transition={{duration: 0.3}}
                  className={`flex ${
                    message.type === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <motion.div
                    whileHover={{scale: 1.02}}
                    className={`max-w-[80%] rounded-2xl shadow-lg ${
                      message.type === "user"
                        ? "bg-indigo-600 p-4"
                        : "bg-gray-800 p-4"
                    } flex items-start`}
                  >
                    <div className="mr-3 mt-1">
                      {message.type === "user" ? (
                        <FiUser className="text-xl" />
                      ) : (
                        <FiCpu className="text-xl" />
                      )}
                    </div>
                    <div>
                      {message.type === "user" ? (
                        <p className="text-sm whitespace-pre-wrap">
                          {message.content}
                        </p>
                      ) : showThinking ? (
                        <ThinkingIndicator />
                      ) : (
                        <Markdown content={message.content} />
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        {/* Chat input area */}
        <motion.div
          initial={{y: 50, opacity: 0}}
          animate={{y: 0, opacity: 1}}
          transition={{duration: 0.5}}
          className="p-6 bg-gray-900 rounded-t-3xl shadow-lg"
        >
          {/* Display default options if chat hasn't started */}
          {!chatStarted && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              {defaultOptions.map((option, index) => (
                <motion.button
                  key={index}
                  whileHover={{scale: 1.05}}
                  whileTap={{scale: 0.95}}
                  onClick={() => startChat(option)}
                  className="p-4 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors text-sm font-medium shadow-md"
                >
                  {option}
                </motion.button>
              ))}
            </div>
          )}
          {/* Chat input form */}
          <form onSubmit={handleSubmit} className="flex items-center">
            <motion.input
              whileFocus={{scale: 1.02}}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question"
              className="flex-grow p-4 rounded-l-xl bg-gray-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-gray-700 shadow-inner"
            />
            <motion.button
              whileHover={{scale: 1.05}}
              whileTap={{scale: 0.95}}
              type="submit"
              className="p-4 rounded-r-xl bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors shadow-md"
            >
              <FiSend className="text-xl" />
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default ChatStream;
