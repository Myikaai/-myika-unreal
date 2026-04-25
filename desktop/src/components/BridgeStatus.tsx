export default function BridgeStatus() {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-red-500" />
      <span className="text-muted">Disconnected</span>
    </div>
  );
}
