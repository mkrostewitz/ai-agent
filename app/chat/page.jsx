"use client";
import React, {useState, useRef, useEffect} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {Prism as SyntaxHighlighter} from "react-syntax-highlighter";
import {vscDarkPlus} from "react-syntax-highlighter/dist/esm/styles/prism";
import {motion, AnimatePresence} from "framer-motion";
import {FiSend, FiUser, FiCpu} from "react-icons/fi";
import {useI18n} from "../i18n/useI18n";

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
  const [defaultOptions, setDefaultOptions] = useState([]);
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(true);
  const {t, i18n, lang, supportedLocales, fallbackLocale} = useI18n();
  const typingQueueRef = useRef([]);
  const chatContainerRef = useRef(null);

  // Scroll to bottom of chat when new messages are added
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const controller = new AbortController();
    const loadDefaultQuestions = async () => {
      setIsLoadingDefaults(true);
      try {
        const locale = encodeURIComponent(lang || fallbackLocale);
        const res = await fetch(`/api/default-questions?locale=${locale}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch defaults: ${res.status}`);
        }
        const data = await res.json();
        const questions = Array.isArray(data?.questions)
          ? data.questions
              .map((q) => (typeof q === "string" ? q.trim() : ""))
              .filter(Boolean)
          : [];
        setDefaultOptions(questions.length ? questions : []);
      } catch (err) {
        console.error("Failed to load default questions:", err);
        setDefaultOptions([]);
      } finally {
        setIsLoadingDefaults(false);
      }
    };

    loadDefaultQuestions();
    return () => controller.abort();
  }, [lang, fallbackLocale]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("question submitted:", question);
    await startChat(question);
  };

  // Start or continue the chat (uses /api/agents/chat/stream SSE)
  const startChat = async (initialQuestion) => {
    setChatStarted(true);
    setQuestion("");
    setIsThinking(true);

    // Build payload messages (include prior turns + current user question)
    const payloadMessages = [...messages, {type: "user", content: initialQuestion}]
      .filter((m) => m.type === "user" || m.type === "ai")
      .map((m) => ({
        role: m.type === "ai" ? "assistant" : "user",
        content: m.content,
      }));

    // Optimistically add user + empty AI message to UI
    setMessages((prev) => [
      ...prev,
      {type: "user", content: initialQuestion},
      {type: "ai", content: ""},
    ]);

    try {
      const response = await fetch("/api/agents/chat/stream", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({messages: payloadMessages}),
      });

      if (!response.ok) {
        // Try to read non-stream JSON fallback
        const data = await response.json().catch(() => ({}));
        const reply =
          data?.choices?.[0]?.message?.content ||
          data?.data?.choices?.[0]?.message?.content ||
          data?.message ||
          "An error occurred while processing your request.";
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (updated[lastIndex]?.type === "ai") {
            updated[lastIndex] = {...updated[lastIndex], content: reply};
          }
          return updated;
        });
        setIsThinking(false);
        return;
      }

      const reader = response.body?.getReader?.();
      if (!reader) {
        setIsThinking(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let receivedFirstChunk = false;
      let streamDone = false;

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        parts.forEach((part) => {
          const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) return;
          const payload = dataLine.replace(/^data:\s*/, "");
          if (payload === "[DONE]") {
            streamDone = true;
            return;
          }
          let delta = "";
          try {
            const parsed = JSON.parse(payload);
            delta =
              parsed?.choices?.[0]?.delta?.content ||
              parsed?.choices?.[0]?.message?.content ||
              "";
          } catch {
            delta = payload;
          }
          if (delta) {
            typingQueueRef.current.push(...delta);
            if (!isTyping) setIsTyping(true);
            if (!receivedFirstChunk) {
              setIsThinking(false);
              receivedFirstChunk = true;
            }
          }
        });
        if (streamDone) break;
      }
      setIsThinking(false);
    } catch (error) {
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
                    } flex items-center`}
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
              {isLoadingDefaults ? (
                <div className="col-span-2 text-center text-sm text-gray-400">
                  {t("chat.loadingSuggestions")}
                </div>
              ) : defaultOptions.length > 0 ? (
                defaultOptions.map((option, index) => (
                  <motion.button
                    key={`${option}-${index}`}
                    whileHover={{scale: 1.05}}
                    whileTap={{scale: 0.95}}
                    onClick={() => startChat(option)}
                    className="p-4 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors text-sm font-medium shadow-md"
                  >
                    {option}
                  </motion.button>
                ))
              ) : (
                <div className="col-span-2 text-center text-sm text-gray-400">
                  {t("chat.noSuggestions")}
                </div>
              )}
            </div>
          )}
          {/* Chat input form */}
          <form onSubmit={handleSubmit} className="flex items-center">
            <motion.input
              whileFocus={{scale: 1.02}}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t("chat.placeholder")}
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
