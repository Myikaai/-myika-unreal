import { useState } from "react";

export default function Chat() {
  const [input, setInput] = useState("");

  return (
    <div className="flex flex-col h-full">
      {/* Transcript */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-muted text-sm text-center mt-20">
          Connect to Unreal Engine and start chatting.
        </div>
      </div>

      {/* Composer */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Myika..."
            className="flex-1 bg-[var(--bg-elevated)] text-primary text-sm rounded px-3 py-2 border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none placeholder:text-muted"
          />
          <button className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded hover:opacity-90 transition-opacity">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
