import { useEffect, useRef, useState } from "react";

type Device = {
  name: string;
  type: "LAN" | "P2P";
  latency: string;
  icon: "laptop" | "phone" | "tablet";
};

const RECENT: Device[] = [
  { name: "Studio Display Studio", type: "LAN", latency: "2ms latency", icon: "laptop" },
];

const NEARBY: Device[] = [
  { name: "iPhone 15 Pro", type: "P2P", latency: "12ms latency", icon: "phone" },
  { name: "iPad Air", type: "LAN", latency: "4ms latency", icon: "tablet" },
];

export function QuickSendPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const allDevices = [...RECENT, ...NEARBY];
  const filtered = query
    ? allDevices.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
    : allDevices;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600,
          background: "var(--surface-low)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 40px 80px rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "16px 20px",
            gap: 12,
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search devices or actions..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--on-surface)",
              fontSize: 16,
              fontFamily: "var(--font-ui)",
            }}
          />
          <kbd
            style={{
              padding: "3px 8px",
              background: "var(--surface-high)",
              borderRadius: 6,
              fontSize: 11,
              color: "var(--on-surface-variant)",
              fontFamily: "var(--font-ui)",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div style={{ padding: "8px 0" }}>
          {!query && (
            <>
              <Section label="RECENT" />
              {RECENT.map((d, i) => (
                <DeviceRow
                  key={d.name}
                  device={d}
                  isSelected={selected === i}
                  onHover={() => setSelected(i)}
                />
              ))}
              <Section label="NEARBY" />
              {NEARBY.map((d, i) => (
                <DeviceRow
                  key={d.name}
                  device={d}
                  isSelected={selected === RECENT.length + i}
                  onHover={() => setSelected(RECENT.length + i)}
                />
              ))}
            </>
          )}
          {query &&
            filtered.map((d, i) => (
              <DeviceRow
                key={d.name}
                device={d}
                isSelected={selected === i}
                onHover={() => setSelected(i)}
              />
            ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "12px 20px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {[
            { key: "TAB", action: "Navigate" },
            { key: "↵", action: "Send File" },
            { key: "⌘K", action: "Actions" },
          ].map(({ key, action }) => (
            <span key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <kbd
                style={{
                  padding: "2px 6px",
                  background: "var(--surface-high)",
                  borderRadius: 4,
                  fontSize: 10,
                  color: "var(--on-surface-variant)",
                  fontFamily: "var(--font-ui)",
                }}
              >
                {key}
              </kbd>
              <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>{action}</span>
            </span>
          ))}
          <div style={{ flex: 1 }} />
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "var(--primary)",
              fontWeight: 500,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)", display: "inline-block" }} />
            ACTIVE NODE
          </span>
        </div>
      </div>
    </div>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "6px 20px 4px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        color: "var(--on-surface-muted)",
      }}
    >
      {label}
    </div>
  );
}

function DeviceRow({
  device,
  isSelected,
  onHover,
}: {
  device: Device;
  isSelected: boolean;
  onHover: () => void;
}) {
  return (
    <div
      onMouseEnter={onHover}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 20px",
        background: isSelected ? "var(--surface-high)" : "transparent",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: isSelected ? "var(--primary-container)" : "var(--surface-high)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <LaptopIcon color={isSelected ? "var(--primary)" : "var(--on-surface-variant)"} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--on-surface)" }}>{device.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <TypeBadge type={device.type} />
          <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>{device.latency}</span>
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: "LAN" | "P2P" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 6px",
        borderRadius: 4,
        background: "rgba(133,173,255,0.15)",
        fontSize: 10,
        fontWeight: 600,
        color: "var(--primary)",
        letterSpacing: "0.04em",
      }}
    >
      {type === "LAN" ? <WifiIcon /> : <BluetoothIcon />}
      {type}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--on-surface-muted)" strokeWidth="1.5">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function LaptopIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M1 21h22" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  );
}

function BluetoothIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
    </svg>
  );
}
