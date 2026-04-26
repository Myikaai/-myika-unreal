import { useEffect, useRef, useState } from "react";
import { sendMessage, clearChat, onChatEvent, resolvePlan, type ChatEvent } from "../lib/ipc";
import PlanReview from "./PlanReview";
import Icon from "./Icon";

type ChatPhase = "idle" | "planning" | "awaiting_approval" | "executing" | "done";

interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "tool" | "plan";
  content: string;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  toolError?: boolean;
  isStreaming?: boolean;
  planSteps?: string[];
  planSummary?: string;
  planStatus?: "pending" | "approved" | "cancelled";
}

export default function Chat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatPhase, setChatPhase] = useState<ChatPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  const isLoading = chatPhase !== "idle";

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
          setChatPhase("idle");
          break;

        case "tool_call":
          // propose_plan is synthetic — PlanReview card is its visual representation
          if (event.name.endsWith("propose_plan")) break;
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

        case "tool_result": {
          const isError = event.result.startsWith("Error:") || event.result.startsWith("Tool proxy error:");
          setMessages((prev) => {
            const idx = [...prev].reverse().findIndex(
              (m) => m.role === "tool" && m.toolName === event.name
            );
            if (idx >= 0) {
              const realIdx = prev.length - 1 - idx;
              const updated = [...prev];
              updated[realIdx] = {
                ...updated[realIdx],
                content: isError ? `${event.name} failed` : `${event.name} completed`,
                toolResult: event.result,
                toolError: isError,
              };
              return updated;
            }
            return prev;
          });
          break;
        }

        case "plan_proposed":
          setChatPhase("awaiting_approval");
          setMessages((prev) => [
            ...prev,
            {
              id: nextId.current++,
              role: "plan",
              content: event.summary,
              planSteps: event.steps,
              planSummary: event.summary,
              planStatus: "pending",
            },
          ]);
          break;

        case "error":
          setError(event.message);
          setChatPhase("idle");
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
    setChatPhase("planning");

    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, role: "user", content: trimmed },
    ]);

    try {
      await sendMessage(trimmed);
    } catch (e) {
      setError(String(e));
      setChatPhase("idle");
    }
  };

  const handleApprove = async () => {
    setChatPhase("executing");
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.role === "plan" && m.planStatus === "pending");
      if (idx >= 0) {
        const realIdx = prev.length - 1 - idx;
        const updated = [...prev];
        updated[realIdx] = { ...updated[realIdx], planStatus: "approved" };
        return updated;
      }
      return prev;
    });
    try {
      await resolvePlan(true);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCancel = async () => {
    setChatPhase("planning"); // Claude still running, will respond to cancellation
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.role === "plan" && m.planStatus === "pending");
      if (idx >= 0) {
        const realIdx = prev.length - 1 - idx;
        const updated = [...prev];
        updated[realIdx] = { ...updated[realIdx], planStatus: "cancelled" };
        return updated;
      }
      return prev;
    });
    try {
      await resolvePlan(false);
    } catch (e) {
      setError(String(e));
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
      setChatPhase("idle");
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
              <ToolCard name={msg.toolName || ""} args={msg.toolArgs} content={msg.content} result={msg.toolResult} isError={msg.toolError} />
            ) : msg.role === "plan" ? (
              <div className="max-w-[80%] w-full">
                {msg.planStatus === "pending" ? (
                  <PlanReview
                    steps={msg.planSteps || []}
                    summary={msg.planSummary || ""}
                    onApprove={handleApprove}
                    onCancel={handleCancel}
                  />
                ) : (
                  <div className={`border rounded px-3 py-2 text-sm ${
                    msg.planStatus === "approved"
                      ? "border-[var(--color-border-accent)] bg-[var(--color-bg-accent-soft)] text-[var(--color-text-accent)]"
                      : "border-[var(--color-border-danger)] bg-[var(--color-bg-danger-soft)] text-[var(--color-text-danger)]"
                  }`}>
                    {msg.planStatus === "approved" ? "Plan approved — executing..." : "Plan cancelled"}
                  </div>
                )}
              </div>
            ) : (
              <div
                className={`max-w-[80%] px-3 py-2 rounded text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[var(--color-accent-default)] text-[var(--color-text-on-accent)]"
                    : "bg-[var(--color-bg-elevated)] text-primary"
                }`}
              >
                {msg.role === "assistant" && msg.isStreaming ? (
                  <StreamingText text={msg.content} />
                ) : (
                  msg.content
                )}
              </div>
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && chatPhase !== "awaiting_approval" && (
          <div className="flex justify-start">
            <div className="bg-[var(--color-bg-elevated)] text-secondary px-3 py-2 rounded text-sm">
              <span className="animate-pulse">
                {chatPhase === "executing" ? "Executing plan..." : "Thinking..."}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mb-1 px-3 py-2 bg-[var(--color-bg-danger-soft)] border border-[var(--color-border-danger)] rounded text-[var(--color-text-danger)] text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-[var(--color-danger-default)] hover:text-[var(--color-danger-hover)] ml-2 rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
          >
            <Icon name="deny" size={16} />
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="p-3 border-t border-[var(--color-border-subtle)]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Myika..."
            disabled={isLoading}
            className="flex-1 bg-[var(--color-bg-elevated)] text-primary text-sm rounded px-3 py-2 border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-border-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)] placeholder:text-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ transitionDuration: "var(--duration-fast)" }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-[var(--color-accent-default)] text-[var(--color-text-on-accent)] text-sm font-medium rounded hover:bg-[var(--color-accent-glow)] active:bg-[var(--color-accent-active)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
            style={{ transitionDuration: "var(--duration-fast)" }}
          >
            Send
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              disabled={isLoading}
              className="px-3 py-2 text-secondary hover:text-primary text-sm border border-[var(--color-border-default)] rounded hover:border-[var(--color-border-strong)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
              style={{ transitionDuration: "var(--duration-fast)" }}
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

function ToolCard({ name, args, content, result, isError }: { name: string; args?: string; content: string; result?: string; isError?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = !result && !isError;
  const chipStatus = isError ? "error" : isRunning ? "running" : "done";

  return (
    <div className="max-w-[80%]">
      {/* Chip header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`tool-chip tool-chip--${chipStatus} w-full text-left cursor-pointer hover:bg-[var(--color-bg-elevated)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]`}
        style={{ transitionDuration: "var(--duration-fast)", padding: "6px 8px" }}
      >
        <span className="tool-chip__dot" />
        <span className="relative z-[2] flex-1 truncate">{name}</span>
        <span className={`relative z-[2] text-xs ml-auto flex-shrink-0 ${isError ? "text-[var(--color-text-danger)]" : "text-secondary"}`}>
          {content}
        </span>
        {isRunning && (
          <>
            <div className="tool-chip__scanline" />
            <div className="tool-chip__progress" />
          </>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 py-2 border border-t-0 border-[var(--color-border-subtle)] rounded-b bg-[var(--color-bg-base)] text-xs font-mono">
          {args && (
            <pre className="text-secondary whitespace-pre-wrap overflow-x-auto mb-2">
              {(() => {
                try { return JSON.stringify(JSON.parse(args), null, 2); } catch { return args; }
              })()}
            </pre>
          )}
          {result && (
            <pre className={`whitespace-pre-wrap overflow-x-auto ${isError ? "text-[var(--color-text-danger)]" : "text-secondary"}`}>
              {(() => {
                try { return JSON.stringify(JSON.parse(result), null, 2); } catch { return result; }
              })()}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function StreamingText({ text }: { text: string }) {
  const words = text.split(" ");
  const total = words.length;

  return (
    <span>
      {words.map((word, i) => {
        const cls = i === total - 1
          ? "streaming-text__word--newest"
          : i === total - 2
            ? "streaming-text__word--recent"
            : "";
        return (
          <span key={i} className={cls}>
            {word}{" "}
          </span>
        );
      })}
      <span className="streaming-cursor" />
    </span>
  );
}
