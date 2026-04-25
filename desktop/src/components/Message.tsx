interface MessageProps {
  role: "user" | "assistant";
  content: string;
}

export default function Message({ role, content }: MessageProps) {
  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          role === "user"
            ? "bg-[var(--accent)] text-black"
            : "bg-[var(--bg-elevated)] text-primary"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
