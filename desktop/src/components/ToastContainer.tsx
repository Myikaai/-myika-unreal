import { useEffect, useState } from "react";
import { type AppError, onAppError } from "../lib/ipc";

interface Toast extends AppError {
  id: number;
}

let nextToastId = 0;

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onAppError((error) => {
      setToasts((prev) => [...prev, { ...error, id: nextToastId++ }]);
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const copyDetails = (toast: Toast) => {
    const text = `Error: ${toast.code}\n${toast.message}\n\nDetails:\n${toast.details}`;
    navigator.clipboard.writeText(text);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-red-900/90 border border-red-700 rounded-lg px-4 py-3 text-sm shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-mono text-red-300 text-xs mb-1">{toast.code}</div>
              <div className="text-red-100">{toast.message}</div>
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-red-400 hover:text-red-200 text-lg leading-none flex-shrink-0"
            >
              &#x2715;
            </button>
          </div>
          <div className="mt-2">
            <button
              onClick={() => copyDetails(toast)}
              className="text-xs px-2 py-1 border border-red-700 rounded text-red-300 hover:bg-red-800/50 transition-colors"
            >
              Copy details
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
