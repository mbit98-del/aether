import { useEffect, useMemo, useRef, useState } from "react";
import { useMeshEvents } from "../hooks/useMeshEvents";
import { clearEvents, formatEvent } from "../lib/event-store";
import { openDevicePanel } from "../hooks/useDevicePanel";
import type { MeshEvent, MeshEventKind } from "@aether/types";

type Tab = "all" | "transfers" | "clipboard" | "devices";

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

function dateLabel(ts: number): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(new Date(ts).setHours(0, 0, 0, 0)).getTime();
  if (day >= today) return "Today";
  if (day >= today - 86_400_000) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupEvents(events: MeshEvent[]): { label: string; events: MeshEvent[] }[] {
  const groups: { label: string; events: MeshEvent[] }[] = [];
  for (const e of events) {
    const label = dateLabel(e.timestamp);
    const last = groups[groups.length - 1];
    if (last?.label === label) { last.events.push(e); }
    else { groups.push({ label, events: [e] }); }
  }
  return groups;
}

function kindIcon(kind: MeshEventKind): string {
  switch (kind) {
    case "file:receiving":  return "📥";
    case "file:sent":       return "📤";
    case "file:received":   return "✅";
    case "file:cancelled":  return "✖️";
    case "clipboard:sent":  return "📋";
    case "clipboard:received": return "📋";
  }
}

export function ActivityFeed({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("all");
  const events = useMeshEvents();
  const panelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    switch (tab) {
      case "transfers": return events.filter((e) => e.kind.startsWith("file:"));
      case "clipboard": return events.filter((e) => e.kind.startsWith("clipboard:"));
      case "devices":   return [] as MeshEvent[];
      default:          return events;
    }
  }, [events, tab]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleClear() {
    clearEvents();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "all",       label: "All" },
    { id: "transfers", label: "Transfers" },
    { id: "clipboard", label: "Clipboard" },
    { id: "devices",   label: "Devices" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(0,0,0,0.5)",
          animation: "fade-in 0.18s ease forwards",
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{
          position: "fixed",
          outline: "none",
          top: 0,
          right: 0,
          bottom: 0,
          width: 360,
          zIndex: 201,
          background: "var(--surface-high)",
          borderLeft: "1px solid rgba(255,255,255,0.04)",
          boxShadow: "-12px 0 48px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          animation: "slide-in-right 0.24s cubic-bezier(0.32, 0.72, 0, 1) forwards",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 16px 0",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            position: "sticky",
            top: 0,
            background: "var(--surface-high)",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--on-surface)", fontFamily: "var(--font-display)" }}>
              Activity
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {events.length > 0 && (
                <button
                  onClick={handleClear}
                  style={{
                    fontSize: 11, color: "var(--on-surface-muted)", background: "none",
                    border: "none", cursor: "pointer", fontFamily: "var(--font-ui)", padding: "2px 6px",
                    borderRadius: 4, transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--on-surface)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--on-surface-muted)"; }}
                >
                  Clear
                </button>
              )}
              <button
                onClick={onClose}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--on-surface-muted)", width: 28, height: 28,
                  borderRadius: 8, fontSize: 14, display: "flex",
                  alignItems: "center", justifyContent: "center", transition: "background 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-highest)"; e.currentTarget.style.color = "var(--on-surface)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--on-surface-muted)"; }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2 }}>
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  padding: "6px 10px",
                  fontSize: 11,
                  fontFamily: "var(--font-ui)",
                  fontWeight: tab === id ? 600 : 400,
                  color: tab === id ? "var(--on-surface)" : "var(--on-surface-muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  borderBottom: `2px solid ${tab === id ? "var(--primary)" : "transparent"}`,
                  transition: "color 0.15s, border-color 0.15s",
                  marginBottom: -1,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Event list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--on-surface-muted)", marginBottom: 6 }}>
                {tab === "devices" ? "No device events yet" : "No activity yet"}
              </div>
              {tab !== "devices" && (
                <div style={{ fontSize: 11, color: "var(--on-surface-muted)", opacity: 0.6 }}>
                  Start by sending a file or copying something
                </div>
              )}
            </div>
          ) : (
            groupEvents(filtered).map(({ label, events: group }) => (
              <div key={label}>
                <div style={{
                  padding: "8px 16px 4px",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.07em",
                  color: "var(--on-surface-muted)",
                  fontFamily: "var(--font-ui)",
                }}>
                  {label}
                </div>
                {group.map((e) => (
                  <div
                    key={e.id}
                    onClick={() => {
                      if (e.deviceId) {
                        onClose();
                        openDevicePanel(e.deviceId);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 16px",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      cursor: e.deviceId ? "pointer" : "default",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(el) => { if (e.deviceId) el.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={(el) => { el.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 14, flexShrink: 0, width: 22, textAlign: "center" }}>
                      {kindIcon(e.kind)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--on-surface)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {formatEvent(e)}
                      </div>
                      {e.deviceName && (
                        <div style={{ fontSize: 10, color: "var(--on-surface-muted)", marginTop: 1 }}>
                          {e.deviceName}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: "var(--on-surface-muted)", flexShrink: 0 }}>
                      {relTime(e.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
