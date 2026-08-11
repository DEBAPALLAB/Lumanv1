"use client";

import { cn } from "@/lib/utils";
import { useChat } from "ai/react";
import { ArrowRightToLine, Bot, Copy, Loader2, Send, Sparkles, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "data";
  content: string;
  created_at?: string;
}

interface AIChatSidebarProps {
  noteId: string;
  isOpen: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
  width: number;
  setWidth: (width: number) => void;
}

export default function AIChatSidebar({ noteId, isOpen, onClose, onInsert, width, setWidth }: AIChatSidebarProps) {
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [selectedModel, setSelectedModel] = useState("stepfun/step-3.5-flash:free");

  const { messages, input, handleInputChange, handleSubmit, setMessages, isLoading, append } = useChat({
    api: "/api/chat",
    body: { noteId, model: selectedModel },
    onFinish: (message) => {
      console.log("[CHAT] Message finished:", message);
    },
    onError: (error) => {
      console.error("[CHAT ERROR]:", error);
      alert(`Chat error: ${error.message}`);
    },
  });

  // Listen for Slash Commands
  useEffect(() => {
    const handleTrigger = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        const { action, text } = detail;
        let prompt = "";
        if (action === "explain") {
          prompt = `Explain this text:\n\n"${text}"`;
        } else if (action === "fix") {
          prompt = `Fix grammar and spelling for this text:\n\n"${text}"`;
        }

        if (prompt) {
          append({
            role: "user",
            content: prompt,
          });
        }
      }
    };

    window.addEventListener("ai-chat-trigger", handleTrigger);
    return () => window.removeEventListener("ai-chat-trigger", handleTrigger);
  }, [append]);

  // Load chat history on mount or when noteId changes
  useEffect(() => {
    async function loadHistory() {
      try {
        console.log("[CHAT] Loading history for noteId:", noteId);
        setIsLoadingHistory(true);
        const res = await fetch(`/api/chat/${noteId}`);
        if (res.ok) {
          const data = await res.json();
          console.log("[CHAT] Loaded", data.length, "messages from history");
          // Map DB messages to AI SDK format if needed
          setMessages(
            data.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: m.created_at ? new Date(m.created_at) : undefined,
            })),
          );
        }
      } catch (error) {
        console.error("[CHAT] Failed to load chat history:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    }

    loadHistory();
  }, [noteId, setMessages]);

  // Resizing logic
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const startResizing = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault(); // Prevent text selection
  };

  useEffect(() => {
    const stopResizing = () => setIsResizing(false);

    const resize = (e: MouseEvent) => {
      if (isResizing) {
        // Calculate new width: Window width - mouse X position
        // We subtract from window width because sidebar is on the right
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 300 && newWidth < 800) {
          setWidth(newWidth);
        }
      }
    };

    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const models = [
    { id: "stepfun/step-3.5-flash:free", name: "Step 3.5 Flash (Free)" },
    { id: "arcee-ai/trinity-large-preview:free", name: "Trinity Large Preview (Free)" },
    { id: "qwen/qwen3-next-80b-a3b-instruct:free", name: "Qwen3 Next 80B (Free)" },
  ];

  return (
    <div
      ref={sidebarRef}
      style={{ width: isOpen ? width : 0 }}
      className={cn(
        "relative h-full bg-[#FDFBF7] border-l-[4px] border-black flex flex-col shadow-none select-none overflow-hidden z-30 shrink-0",
        isResizing ? "transition-none" : "transition-all duration-300 ease-out",
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      {/* Drag Handle */}
      <div
        onMouseDown={startResizing}
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/10 transition-colors z-50 group flex items-center justify-center -translate-x-1/2"
      >
        <div className="w-1 h-16 rounded-full bg-black group-hover:bg-[#FBBF24] transition-colors" />
      </div>

      {/* Header */}
      <div className="relative h-16 border-b-[4px] border-black bg-[#FBBF24] flex-shrink-0">
        <div className="flex items-center justify-between h-full px-4 text-black">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-black animate-pulse" />
            <div className="flex flex-col">
              <h2 className="font-black text-xs uppercase tracking-wider text-black">
                AI Assistant Terminal
              </h2>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="text-[9px] bg-white border-2 border-black rounded-md px-1.5 py-0.5 text-black font-black uppercase focus:ring-0 focus:outline-none cursor-pointer h-auto shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4 min-h-0 bg-[#FDFBF7] relative">
        {/* Vintage grid layer in side drawer */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:30px_30px] opacity-60 pointer-events-none" />

        {isLoadingHistory ? (
          <div className="flex items-center justify-center h-full relative z-10">
            <Loader2 className="h-6 w-6 animate-spin text-[#FBBF24]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-6 relative z-10">
            <div className="p-4 rounded-2xl border-[3px] border-black bg-[#FBBF24] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-bounce">
              <Bot className="h-8 w-8 text-black" />
            </div>
            <div className="space-y-2">
              <p className="font-black text-base uppercase tracking-wider text-stone-900">Start a conversation</p>
              <p className="text-xs font-bold uppercase text-stone-500 mt-1 max-w-[240px]">
                Ask Luman anything about your note, equations, or code.
              </p>
            </div>
            
            {/* Quick Badges in Empty State */}
            <div className="grid grid-cols-2 gap-2.5 pt-4 w-full max-w-[280px]">
              <button
                onClick={() => append({ role: "user", content: "Can you summarize the current note?" })}
                className="px-3 py-2 border-2 border-black rounded-xl bg-white hover:bg-stone-50 font-black text-[10px] uppercase text-stone-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 text-left"
              >
                ⚡ Summarize
              </button>
              <button
                onClick={() => append({ role: "user", content: "What are the key action items or todo items in this note?" })}
                className="px-3 py-2 border-2 border-black rounded-xl bg-white hover:bg-stone-50 font-black text-[10px] uppercase text-stone-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 text-left"
              >
                📋 Todo items
              </button>
            </div>
          </div>
        ) : (
          <div className="relative z-10 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {message.role === "assistant" && (
                  <div className="flex-shrink-0 mt-1">
                    <div className="p-2 border-2 border-black rounded-xl bg-[#FBBF24] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                      <Bot className="h-4 w-4 text-black" />
                    </div>
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-xs font-bold border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden",
                    message.role === "user"
                      ? "bg-[#F9A8D4] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      : "bg-white text-stone-900",
                  )}
                >
                  <ReactMarkdown
                    className={cn(
                      "prose prose-sm dark:prose-invert max-w-none break-words font-bold",
                      message.role === "user"
                        ? "prose-headings:text-black prose-p:text-black prose-strong:text-black prose-code:text-black prose-ul:text-black"
                        : "prose-headings:text-stone-900 prose-p:text-stone-900 prose-strong:text-stone-900 prose-code:text-stone-900 prose-ul:text-stone-900",
                    )}
                    components={{
                      code({ node, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || "");
                        const isInline = !match && !className;

                        if (isInline) {
                          return (
                            <code className="bg-stone-100 border border-stone-200 px-1 py-0.5 rounded font-mono text-[10px] text-black" {...props}>
                              {children}
                            </code>
                          );
                        }

                        return (
                          <div className="relative my-2 rounded-xl overflow-hidden border-2 border-black bg-stone-900 text-stone-100">
                            <div className="flex justify-between items-center px-3 py-1.5 bg-stone-900 border-b-2 border-black">
                              <span className="text-[10px] text-stone-400 font-mono uppercase font-black">{match?.[1] || "code"}</span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => onInsert(String(children).replace(/\n$/, ""))}
                                  className="p-1 hover:bg-stone-800 rounded transition-colors group flex items-center gap-1"
                                  title="Insert to editor"
                                >
                                  <ArrowRightToLine className="h-3 w-3 text-stone-400 group-hover:text-stone-100" />
                                  <span className="text-[9px] text-stone-400 group-hover:text-stone-100 uppercase font-black">
                                    Insert
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(String(children).replace(/\n$/, ""))}
                                  className="p-1 hover:bg-stone-800 rounded transition-colors group"
                                  title="Copy code"
                                >
                                  <Copy className="h-3 w-3 text-stone-400 group-hover:text-stone-100" />
                                </button>
                              </div>
                            </div>
                            <pre className="p-4 overflow-x-auto text-[10px] font-mono scrollbar-thin scrollbar-thumb-stone-700 scrollbar-track-transparent">
                              <code className={className} {...props}>
                                {children}
                              </code>
                            </pre>
                          </div>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>

                {message.role === "assistant" && (
                  <div className="flex flex-col gap-1 mt-1">
                    <button
                      onClick={() => onInsert(message.content)}
                      className="self-start text-[10px] text-stone-500 hover:text-black font-black uppercase flex items-center gap-1.5 px-2.5 py-1 rounded-lg border-2 border-black bg-white hover:bg-stone-50 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all shrink-0"
                    >
                      <ArrowRightToLine className="h-3 w-3" />
                      Insert
                    </button>
                  </div>
                )}

                {message.role === "user" && (
                  <div className="flex-shrink-0 mt-1">
                    <div className="p-2 border-2 border-black rounded-xl bg-[#FBBF24] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                      <User className="h-4 w-4 text-black" />
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Suggestion Quickchips dynamic toolbar */}
      {isOpen && messages.length > 0 && (
        <div className="px-4 py-2.5 bg-[#FDFBF7] flex gap-2 overflow-x-auto border-t-2 border-stone-200 scrollbar-none flex-shrink-0 relative z-10">
          <button
            onClick={() => append({ role: "user", content: "Please summarize our note." })}
            className="px-3 py-1.5 border-2 border-black rounded-full bg-white hover:bg-stone-50 font-black text-[9px] uppercase text-stone-700 shrink-0 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
          >
            ✨ SUMMARIZE
          </button>
          <button
            onClick={() => append({ role: "user", content: "What are the next action items or todo items in this note?" })}
            className="px-3 py-1.5 border-2 border-black rounded-full bg-white hover:bg-stone-50 font-black text-[9px] uppercase text-stone-700 shrink-0 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
          >
            📋 TODOS
          </button>
          <button
            onClick={() => append({ role: "user", content: "Check spelling and polish grammar in the note." })}
            className="px-3 py-1.5 border-2 border-black rounded-full bg-white hover:bg-stone-50 font-black text-[9px] uppercase text-stone-700 shrink-0 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
          >
            🚀 POLISH PROSE
          </button>
        </div>
      )}

      {/* Input Form */}
      <div className="p-4 border-t-4 border-black bg-stone-50 flex-shrink-0 relative z-10">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="ASK ME ANYTHING..."
            disabled={isLoading}
            className="flex-1 rounded-xl border-[3px] border-black bg-white px-4 py-2.5 text-xs font-black uppercase placeholder:text-stone-400 focus:outline-none focus:ring-0 disabled:opacity-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-2.5 rounded-full border-[3px] border-black bg-[#FBBF24] text-black hover:bg-[#FBBF24]/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all duration-200 flex items-center justify-center shrink-0"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : <Send className="h-4 w-4 text-black" />}
          </button>
        </form>
      </div>
    </div>
  );
}
