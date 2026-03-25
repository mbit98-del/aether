import { useEffect, useState } from "react";

type ToastItem = { id: number; message: string; icon?: string };

let _nextId = 0;
const listeners = new Set<(t: ToastItem) => void>();

export function toast(message: string, icon?: string) {
  const item: ToastItem = { id: ++_nextId, message, icon };
  listeners.forEach((fn) => fn(item));
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (item: ToastItem) => {
      setToasts((prev) => [...prev, item]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, 2500);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} className="toast-item">
          {t.icon && <span style={{ fontSize: 14 }}>{t.icon}</span>}
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--on-surface)" }}>
            {t.message}
          </span>
        </div>
      ))}
    </div>
  );
}
