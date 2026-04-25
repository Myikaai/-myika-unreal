import { useEffect, useRef, useState } from "react";
import { sendMessage, clearChat, onChatEvent, resolvePlan, type ChatEvent } from "../lib/ipc";
import PlanReview from "./PlanReview";

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
                      ? "border-green-700 bg-green-900/20 text-green-400"
                      : "border-red-700 bg-red-900/20 text-red-400"
                  }`}>
                    {msg.planStatus === "approved" ? "Plan approved — executing..." : "Plan cancelled"}
                  </div>
                )}
              </div>
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

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && chatPhase !== "awaiting_approval" && (
          <div className="flex justify-start">
            <div className="bg-[var(--bg-elevated)] text-muted px-3 py-2 rounded text-sm">
              <span className="animate-pulse">
                {chatPhase === "executing" ? "Executing plan..." : "Thinking..."}
              </span>
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

function ToolCard({ name, args, content, result, isError }: { name: string; args?: string; content: string; result?: string; isError?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const borderClass = isError ? "border-red-700" : "border-[var(--border)]";
  const nameClass = isError ? "text-red-400" : "text-[var(--accent)]";
  const statusClass = isError ? "text-red-400" : "text-muted";

  return (
    <div className={`max-w-[80%] border ${borderClass} rounded bg-[var(--bg-surface)] text-sm overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-elevated)] transition-colors text-left"
      >
        <span className="text-xs text-muted">{expanded ? "▼" : "▶"}</span>
        <span className={`font-mono ${nameClass} text-xs`}>{name}</span>
        <span className={`${statusClass} text-xs ml-auto`}>{content}</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--bg-base)]">
          {args && (
            <pre className="text-xs text-muted font-mono whitespace-pre-wrap overflow-x-auto mb-2">
              {(() => {
                try { return JSON.stringify(JSON.parse(args), null, 2); } catch { return args; }
              })()}
            </pre>
          )}
          {result && (
            <pre className={`text-xs font-mono whitespace-pre-wrap overflow-x-auto ${isError ? "text-red-300" : "text-muted"}`}>
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
