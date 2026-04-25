import { useEffect, useRef, useState } from "react";
import { sendMessage, clearChat, onChatEvent, type ChatEvent } from "../lib/ipc";

interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolArgs?: string;
  isStreaming?: boolean;
}

export default function Chat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Listen for chat events from backend
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    onChatEvent((event: ChatEvent) => {
      switch (event.type) {
        case "assistant_text":
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last?.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + event.text },
              ];
            }
            return [
              ...prev,
              { id: nextId.current++, role: "assistant", content: event.text, isStreaming: true },
            ];
          });
          break;

        case "assistant_done":
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last?.isStreaming) {
              return [...prev.slice(0, -1), { ...last, isStreaming: false }];
            }
            if (!last || last.role !== "assistant") {
              return [
                ...prev,
                { id: nextId.current++, role: "assistant", content: event.full_text },
              ];
            }
            return prev;
          });
          setIsLoading(false);
          break;

        case "tool_call":
          setMessages((prev) => [
            ...prev,
            {
              id: nextId.current++,
              role: "tool",
              content: `Calling ${event.name}...`,
              toolName: event.name,
              toolArgs: event.args,
            },
          ]);
          break;

        case "tool_result":
          setMessages((prev) => {
            // Update the last tool message for this tool
            const idx = [...prev].reverse().findIndex(
              (m) => m.role === "tool" && m.toolName === event.name
            );
            if (idx >= 0) {
              const realIdx = prev.length - 1 - idx;
              const updated = [...prev];
              updated[realIdx] = {
                ...updated[realIdx],
                content: `${event.name} completed`,
              };
              return updated;
            }
            return prev;
          });
          break;

        case "error":
          setError(event.message);
          setIsLoading(false);
          break;
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput("");
    setError(null);
    setIsLoading(true);

    // Add user message immediately
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, role: "user", content: trimmed },
    ]);

    try {
      await sendMessage(trimmed);
    } catch (e) {
      setError(String(e));
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = async () => {
    try {
      await clearChat();
      setMessages([]);
      setError(null);
    } catch (e) {
      console.error("Failed to clear chat:", e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-muted text-sm text-center mt-20">
            Connect to Unreal Engine and start chatting.
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "tool" ? (
              <ToolCard name={msg.toolName || ""} args={msg.toolArgs} content={msg.content} />
            ) : (
              <div
                className={`max-w-[80%] px-3 py-2 rounded text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[var(--accent)] text-black"
                    : "bg-[var(--bg-elevated)] text-primary"
                }`}
              >
                {msg.content}
                {msg.isStreaming && <span className="inline-block w-1.5 h-4 bg-[var(--accent)] ml-0.5 animate-pulse" />}
              </div>
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-[var(--bg-elevated)] text-muted px-3 py-2 rounded text-sm">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mb-1 px-3 py-2 bg-red-900/40 border border-red-700 rounded text-red-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-2">&#x2715;</button>
        </div>
      )}

      {/* Composer */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Myika..."
            disabled={isLoading}
            className="flex-1 bg-[var(--bg-elevated)] text-primary text-sm rounded px-3 py-2 border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none placeholder:text-muted disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Send
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              disabled={isLoading}
              className="px-3 py-2 text-muted hover:text-primary text-sm border border-[var(--border)] rounded disabled:opacity-50"
              title="Clear chat"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolCard({ name, args, content }: { name: string; args?: string; content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="max-w-[80%] border border-[var(--border)] rounded bg-[var(--bg-surface)] text-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-elevated)] transition-colors text-left"
      >
        <span className="text-xs text-muted">{expanded ? "▼" : "▶"}</span>
        <span className="font-mono text-[var(--accent)] text-xs">{name}</span>
        <span className="text-muted text-xs ml-auto">{content}</span>
      </button>
      {expanded && args && (
        <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--bg-base)]">
          <pre className="text-xs text-muted font-mono whitespace-pre-wrap overflow-x-auto">
            {(() => {
              try { return JSON.stringify(JSON.parse(args), null, 2); } catch { return args; }
            })()}
          </pre>
        </div>
      )}
    </div>
  );
}
