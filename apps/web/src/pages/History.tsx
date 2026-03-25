import { useState } from "react";
import { getHistory, addHistory, clearHistory, type HistoryEntry } from "../lib/history-store";
import { useWindowWidth } from "../hooks/useWindowWidth";
import { useWs } from "../contexts/use-ws";
import { toast } from "../components/Toast";
import type { FileStartMessage, FileChunkMessage, FileEndMessage } from "@aether/types";

const CHUNK_SIZE = 512 * 1024;

type Tab = "ALL" | "SENT" | "RECEIVED";
type TypeFilter = "all" | "images" | "files";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "heic", "avif"]);
function fileType(name: string): "image" | "file" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext) ? "image" : "file";
}

export function History() {
  const [tab, setTab] = useState<Tab>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [entries, setEntries] = useState<HistoryEntry[]>(() => getHistory());
  const mobile = useWindowWidth() < 768;
  const { connected, send, devices: allDevices, myDeviceId } = useWs();
  const devices = allDevices.filter((d) => d.id !== myDeviceId);

  async function sendFile(file: File, targetId?: string) {
    const transferId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    send({
      type: "file-start",
      transferId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      totalChunks,
      from: "web",
      timestamp: Date.now(),
      ...(targetId ? { to: targetId } : {}),
    } satisfies FileStartMessage);
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
      let binary = "";
      for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
      send({ type: "file-chunk", transferId, index: i, data: btoa(binary), from: "web", ...(targetId ? { to: targetId } : {}) } satisfies FileChunkMessage);
      await new Promise((r) => setTimeout(r, 0));
    }
    send({ type: "file-end", transferId, from: "web", ...(targetId ? { to: targetId } : {}) } satisfies FileEndMessage);
    addHistory({ name: file.name, size: file.size, direction: "SENT", timestamp: Date.now() });
    setEntries(getHistory());
    toast(`Sent ${file.name}`, "✓");
  }

  function handleResend(entry: HistoryEntry, targetId?: string) {
    if (!connected) { toast("Not connected", "✗"); return; }
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      for (const f of files) await sendFile(f, targetId);
    };
    input.click();
  }

  function handleClear() {
    clearHistory();
    setEntries([]);
  }

  const filtered = entries.filter((t) => {
    if (tab !== "ALL" && t.direction !== tab) return false;
    if (typeFilter === "images" && fileType(t.name) !== "image") return false;
    if (typeFilter === "files" && fileType(t.name) !== "file") return false;
    return true;
  });
  const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);

  return (
    <div style={{ padding: mobile ? "24px 16px" : "48px 40px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Hero */}
      <div
        style={{
          background: "var(--surface-low)",
          borderRadius: 24,
          padding: mobile ? "24px" : "40px",
          marginBottom: 32,
          display: "grid",
          gridTemplateColumns: mobile ? "1fr" : "1fr auto",
          alignItems: "start",
          gap: mobile ? 24 : 40,
        }}
      >
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--primary)", marginBottom: 12 }}>
            TRANSMISSION ARCHIVE
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: mobile ? 36 : 56,
              lineHeight: 1.05,
              letterSpacing: "-2px",
              color: "var(--on-surface)",
              marginBottom: 24,
            }}
          >
            Review every digital artifact shared through the Aether.
          </h1>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {(["ALL ACTIVITY", "SENT", "RECEIVED"] as const).map((t) => {
                const key: Tab = t === "ALL ACTIVITY" ? "ALL" : t;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(key)}
                    style={{
                      padding: "8px 20px",
                      borderRadius: 20,
                      border: "none",
                      background: tab === key ? "var(--primary)" : "var(--surface-high)",
                      color: tab === key ? "#0e0e0f" : "var(--on-surface-variant)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      letterSpacing: "0.04em",
                      fontFamily: "var(--font-ui)",
                      transition: "all 0.15s",
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["all", "images", "files"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 20,
                    border: "none",
                    background: typeFilter === f ? "rgba(133,173,255,0.15)" : "transparent",
                    color: typeFilter === f ? "var(--primary)" : "var(--on-surface-muted)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    letterSpacing: "0.06em",
                    fontFamily: "var(--font-ui)",
                    transition: "all 0.15s",
                  }}
                >
                  {f === "all" ? "ALL TYPES" : f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "var(--surface-high)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            <DatabaseIcon />
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, color: "var(--on-surface)" }}>
            {formatBytes(totalBytes)}
          </div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginBottom: 8 }}>Total Bandwidth Used</div>
          <div
            style={{
              width: 120,
              height: 2,
              background: "var(--surface-highest)",
              borderRadius: 1,
              margin: "0 auto",
            }}
          >
            <div style={{ width: "60%", height: "100%", background: "var(--primary)", borderRadius: 1 }} />
          </div>
        </div>
      </div>

      {/* Transfer list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--on-surface-muted)", fontSize: 14 }}>
          No transfers yet. Send or receive a file to see history here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {filtered.map((entry, i) => (
            <TransferRow key={entry.id} entry={entry} isLast={i === filtered.length - 1} mobile={mobile} devices={devices} onResend={handleResend} />
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <button
            onClick={handleClear}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--on-surface-muted)",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              letterSpacing: "0.06em",
            }}
          >
            CLEAR HISTORY
          </button>
        </div>
      )}
    </div>
  );
}

function TransferRow({
  entry, isLast, mobile, devices, onResend,
}: {
  entry: HistoryEntry;
  isLast: boolean;
  mobile: boolean;
  devices: import("@aether/types").DeviceInfo[];
  onResend: (entry: HistoryEntry, targetId?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
  const isVideo = ["mp4", "mov", "avi", "mkv", "webm"].includes(ext);
  const isSent = entry.direction === "SENT";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12,
        background: expanded ? "var(--surface-low)" : hovered ? "var(--surface-low)" : "transparent",
        borderBottom: isLast || expanded || hovered ? "none" : "1px solid rgba(255,255,255,0.04)",
        transition: "background 0.15s",
        overflow: "hidden",
      }}
    >
      {/* Clickable header row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "16px",
          cursor: "pointer",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: isSent ? "rgba(133,173,255,0.15)" : "rgba(250,176,255,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {isVideo ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--tertiary)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="10 8 16 12 10 16 10 8" fill="var(--tertiary)" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isSent ? "var(--primary)" : "var(--tertiary)"} strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          )}
        </div>

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--on-surface)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--on-surface-muted)" }}>
              {new Date(entry.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span style={{ padding: "2px 7px", background: "var(--surface-high)", borderRadius: 4, fontSize: 11, color: "var(--on-surface-variant)" }}>
              {formatBytes(entry.size)}
            </span>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: isSent ? "rgba(133,173,255,0.12)" : "rgba(250,176,255,0.12)", color: isSent ? "var(--primary)" : "var(--tertiary)" }}>
              {isSent ? "↑ Sent" : "↓ Received"}
            </span>
            {entry.from && (
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "var(--surface-high)", color: "var(--on-surface-variant)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10 }}>{guessDeviceIcon(entry.from)}</span>
                {entry.from}
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <span
          style={{
            fontSize: 11,
            color: "var(--on-surface-muted)",
            flexShrink: 0,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            display: "inline-block",
          }}
        >
          ▾
        </span>
      </div>

      {/* Expanded send panel */}
      {expanded && (
        <div
          style={{
            padding: "0 16px 16px 16px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            paddingTop: 14,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "var(--on-surface-muted)", marginBottom: 10 }}>
            SEND TO
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {devices.length > 1 && (
              <SendChip
                icon="⊕"
                label="All devices"
                accent
                onClick={() => { onResend(entry, undefined); setExpanded(false); }}
              />
            )}
            {devices.map((d) => (
              <SendChip
                key={d.id}
                icon={guessDeviceIcon(d.name)}
                label={d.name}
                onClick={() => { onResend(entry, d.id); setExpanded(false); }}
              />
            ))}
            {devices.length === 0 && (
              <span style={{ fontSize: 12, color: "var(--on-surface-muted)", fontStyle: "italic" }}>
                No devices connected
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SendChip({ icon, label, accent, onClick }: { icon: string; label: string; accent?: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "7px 13px",
        borderRadius: 8,
        border: hovered ? `1px solid ${accent ? "rgba(133,173,255,0.4)" : "rgba(255,255,255,0.1)"}` : "1px solid transparent",
        background: hovered
          ? accent ? "rgba(133,173,255,0.15)" : "var(--surface-highest)"
          : accent ? "rgba(133,173,255,0.08)" : "var(--surface-high)",
        color: accent ? "var(--primary)" : "var(--on-surface)",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "var(--font-ui)",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        transition: "all 0.12s, transform 0.1s",
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {label}
      <span style={{ fontSize: 11, opacity: 0.5 }}>↑</span>
    </button>
  );
}

function guessDeviceIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("iphone") || n.includes("ipad") || n.includes("android")) return "📱";
  if (n.includes("mac") || n.includes(".local")) return "💻";
  if (n.includes("windows") || n.includes("win")) return "🖥️";
  if (n.includes("firefox") || n.includes("chrome") || n.includes("safari") || n.includes("browser") || n.includes("web")) return "🌐";
  return "💻";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function DatabaseIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--tertiary)" strokeWidth="1.5">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}
