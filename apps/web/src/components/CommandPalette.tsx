import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWs } from "../contexts/use-ws";
import type { ClipboardMessage } from "@aether/types";

type CommandItem = {
  id: string;
  label: string;
  sub: string;
  group: "navigate" | "devices" | "clipboard";
  action: () => void;
};

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [clipContent, setClipContent] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { devices, myDeviceId, send } = useWs();

  // Read current clipboard content on open — only on copy/focus events to avoid Firefox paste prompt
  useEffect(() => {
    const onCopy = () => setTimeout(() => navigator.clipboard.readText().then(setClipContent).catch(() => {}), 0);
    document.addEventListener("copy", onCopy);
    window.addEventListener("focus", () => navigator.clipboard.readText().then(setClipContent).catch(() => {}));
    return () => document.removeEventListener("copy", onCopy);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function close() { onClose(); }

  function exec(item: CommandItem) {
    item.action();
    close();
  }

  const navItems: CommandItem[] = [
    { id: "nav-dashboard",  label: "Go to Dashboard",  sub: "Navigate",  group: "navigate", action: () => navigate("/") },
    { id: "nav-clipboard",  label: "Go to Portal",     sub: "Navigate",  group: "navigate", action: () => navigate("/clipboard") },
    { id: "nav-history",    label: "Go to History",    sub: "Navigate",  group: "navigate", action: () => navigate("/history") },
    { id: "nav-settings",   label: "Go to Settings",   sub: "Navigate",  group: "navigate", action: () => navigate("/settings") },
  ];

  const deviceItems: CommandItem[] = devices
    .filter((d) => d.id !== myDeviceId)
    .map((d) => ({
      id: `device-${d.id}`,
      label: `Send clipboard to ${d.name}`,
      sub: `LAN${d.latencyMs !== undefined ? ` · ${d.latencyMs}ms` : ""}`,
      group: "devices" as const,
      action: () => {
        if (!clipContent) return;
        const msg: ClipboardMessage = {
          type: "clipboard",
          data: clipContent,
          from: myDeviceId ?? "web",
          timestamp: Date.now(),
          to: d.id,
        };
        send(msg);
      },
    }));

  const clipItems: CommandItem[] = clipContent
    ? [
        {
          id: "clipboard-apply",
          label: "Copy",
          sub: `${clipContent.slice(0, 40)}${clipContent.length > 40 ? "…" : ""}`,
          group: "clipboard" as const,
          action: () => navigator.clipboard.writeText(clipContent),
        },
      ]
    : [];

  const allItems = [...navItems, ...deviceItems, ...clipItems];

  const filtered = query
    ? allItems.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.sub.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  // Clamp selection when list shrinks
  const clampedSelected = Math.min(selected, Math.max(0, filtered.length - 1));

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); return; }
      if (e.key === "Enter") {
        const item = filtered[clampedSelected];
        if (item) exec(item);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, clampedSelected]);

  // Group the filtered items for rendering
  const groups: { label: string; key: CommandItem["group"]; items: CommandItem[] }[] = [
    { label: "NAVIGATE", key: "navigate", items: filtered.filter((i) => i.group === "navigate") },
    { label: "DEVICES",  key: "devices",  items: filtered.filter((i) => i.group === "devices") },
    { label: "CLIPBOARD", key: "clipboard", items: filtered.filter((i) => i.group === "clipboard") },
  ].filter((g) => g.items.length > 0);

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 580,
          maxWidth: "calc(100vw - 32px)",
          background: "var(--surface-low)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 40px 80px rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 18px",
            gap: 12,
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            placeholder="Search commands and devices..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--on-surface)",
              fontSize: 15,
              fontFamily: "var(--font-ui)",
            }}
          />
          <kbd style={kbdStyle}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: "auto", padding: "6px 0" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "24px 18px", fontSize: 13, color: "var(--on-surface-muted)", textAlign: "center" }}>
              No results for "{query}"
            </div>
          )}
          {groups.map((group) => (
            <div key={group.key}>
              <div style={{ padding: "6px 18px 3px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--on-surface-muted)" }}>
                {group.label}
              </div>
              {group.items.map((item) => {
                const globalIndex = filtered.indexOf(item);
                const isSelected = globalIndex === clampedSelected;
                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setSelected(globalIndex)}
                    onClick={() => exec(item)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "9px 18px",
                      background: isSelected ? "var(--surface-high)" : "transparent",
                      cursor: "pointer",
                      transition: "background 0.08s",
                    }}
                  >
                    <div style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: isSelected ? "var(--primary-container)" : "var(--surface-high)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <GroupIcon group={item.group} active={isSelected} />
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--on-surface)" }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: "var(--on-surface-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.sub}</div>
                    </div>
                    {isSelected && (
                      <kbd style={kbdStyle}>↵</kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "10px 18px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {[
            { key: "↑↓", action: "Navigate" },
            { key: "↵",  action: "Run" },
            { key: "ESC", action: "Close" },
          ].map(({ key, action }) => (
            <span key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <kbd style={kbdStyle}>{key}</kbd>
              <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>{action}</span>
            </span>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "var(--on-surface-muted)" }}>
            {devices.filter((d) => d.id !== myDeviceId).length} device{devices.filter((d) => d.id !== myDeviceId).length !== 1 ? "s" : ""} online
          </span>
        </div>
      </div>
    </div>
  );
}

function GroupIcon({ group, active }: { group: CommandItem["group"]; active: boolean }) {
  const color = active ? "var(--primary)" : "var(--on-surface-variant)";
  if (group === "navigate") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    );
  }
  if (group === "devices") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M1 21h22" />
      </svg>
    );
  }
  // clipboard
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--on-surface-muted)" strokeWidth="1.5">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

const kbdStyle: React.CSSProperties = {
  padding: "2px 6px",
  background: "var(--surface-high)",
  borderRadius: 5,
  fontSize: 10,
  color: "var(--on-surface-variant)",
  fontFamily: "var(--font-ui)",
  flexShrink: 0,
};
