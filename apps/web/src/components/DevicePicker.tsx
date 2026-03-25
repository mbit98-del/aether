import { useEffect, useRef, useState } from "react";
import type { DeviceInfo } from "@aether/types";

function deviceIcon(d: { platform: string; name: string }): string {
  if (d.platform === "web") return "🌐";
  const n = d.name.toLowerCase();
  if (n.includes("iphone") || n.includes("ipad") || n.includes("android")) return "📱";
  if (n.includes("mac") || n.includes(".local")) return "💻";
  if (n.includes("windows") || n.includes("win")) return "🖥️";
  if (n.includes("linux")) return "🖥️";
  return "💻";
}

type Props = {
  devices: DeviceInfo[];
  /** null = broadcast to all */
  onSelect: (deviceId: string | null) => void;
  onClose: () => void;
};

export function DevicePicker({ devices, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        zIndex: 300,
        background: "var(--surface-highest)",
        borderRadius: 12,
        padding: 6,
        minWidth: 210,
        boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07)",
        animation: "toast-in 0.15s ease forwards",
      }}
    >
      <div style={{ padding: "4px 10px 6px", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "var(--on-surface-muted)" }}>
        SEND TO
      </div>

      {devices.length > 1 && (
        <PickerRow
          icon="⊕"
          label="All devices"
          sub={`broadcast · ${devices.length} connected`}
          accent
          onClick={() => { onSelect(null); onClose(); }}
        />
      )}

      {devices.map((d) => (
        <PickerRow
          key={d.id}
          icon={deviceIcon(d)}
          label={d.name}
          sub={d.platform}
          onClick={() => { onSelect(d.id); onClose(); }}
        />
      ))}

      {devices.length === 0 && (
        <div style={{ padding: "8px 10px 4px", fontSize: 12, color: "var(--on-surface-muted)" }}>
          No devices connected
        </div>
      )}
    </div>
  );
}

function PickerRow({
  icon, label, sub, accent, onClick,
}: {
  icon: string;
  label: string;
  sub: string;
  accent?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: "none",
        background: hovered ? "rgba(133,173,255,0.1)" : "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
        textAlign: "left",
        transition: "background 0.1s",
      }}
    >
      <span style={{ fontSize: 15, width: 22, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: accent ? "var(--primary)" : "var(--on-surface)",
          fontFamily: "var(--font-ui)",
        }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: "var(--on-surface-muted)", marginTop: 1 }}>{sub}</div>
      </div>
    </button>
  );
}
