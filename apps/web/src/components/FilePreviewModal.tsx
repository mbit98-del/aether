import { useEffect, useRef, useState } from "react";

const AUTO_SAVE_SECS = 8;

type Props = {
  name: string;
  size: number;
  mimeType: string;
  url: string;
  senderName: string;
  encrypted: boolean;
  trusted: boolean;
  onSave: () => void;
  onDismiss: () => void;
};

export function FilePreviewModal({ name, size, mimeType, url, senderName, encrypted, trusted, onSave, onDismiss }: Props) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(AUTO_SAVE_SECS);

  const onSaveRef = useRef(onSave);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  const isImage = mimeType.startsWith("image/");
  const isText =
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml";

  useEffect(() => {
    if (!isText) return;
    fetch(url)
      .then((r) => r.text())
      .then((t) => setTextContent(t.slice(0, 2000)))
      .catch(() => setTextContent(""));
  }, [url, isText]);

  // Auto-save countdown
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(tick);
          onSaveRef.current();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Enter") { e.preventDefault(); onSaveRef.current(); }
      if (e.key === "Escape") onDismissRef.current();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: "var(--surface-low)",
          borderRadius: 24,
          overflow: "hidden",
          boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "28px 28px 20px" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--primary)",
              marginBottom: 10,
            }}
          >
            INCOMING FILE
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--on-surface)",
                  lineHeight: 1.3,
                  marginBottom: 4,
                }}
                title={name}
              >
                {truncateName(name)}
              </div>
              <div style={{ fontSize: 11, color: "var(--on-surface-muted)" }}>
                {friendlyMime(mimeType)}&nbsp;&middot;&nbsp;{formatBytes(size)}
              </div>
              {/* Badges */}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {encrypted && (
                  <span style={badgeStyle("#22c55e")}>🔒 Encrypted</span>
                )}
                {trusted ? (
                  <span style={badgeStyle("var(--primary)", "rgba(133,173,255,0.12)", "rgba(133,173,255,0.2)")}>
                    ✓ Trusted device
                  </span>
                ) : (
                  <span style={badgeStyle("#f59e0b", "rgba(245,158,11,0.12)", "rgba(245,158,11,0.2)")}>
                    ⚠ Unknown sender
                  </span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: "var(--on-surface-muted)", letterSpacing: "0.06em", marginBottom: 2 }}>
                FROM
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--on-surface)" }}>{senderName}</div>
            </div>
          </div>
        </div>

        {/* Preview area */}
        <div style={{ padding: "0 28px 20px" }}>
          {isImage ? (
            <div
              style={{
                background: "var(--surface-high)",
                borderRadius: 14,
                padding: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src={url}
                alt={name}
                style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain", display: "block", borderRadius: 8 }}
              />
            </div>
          ) : isText ? (
            <div
              style={{
                background: "var(--surface-high)",
                borderRadius: 14,
                padding: "14px 16px",
                maxHeight: 200,
                overflowY: "auto",
                fontFamily: "monospace",
                fontSize: 12,
                color: "var(--on-surface)",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {textContent === null ? (
                <span style={{ color: "var(--on-surface-muted)", fontStyle: "italic" }}>Loading preview…</span>
              ) : textContent === "" ? (
                <span style={{ color: "var(--on-surface-muted)", fontStyle: "italic" }}>Empty file</span>
              ) : (
                <>
                  {textContent}
                  {textContent.length >= 2000 && (
                    <span style={{ color: "var(--on-surface-muted)", fontStyle: "italic" }}>{"\n"}…truncated</span>
                  )}
                </>
              )}
            </div>
          ) : (
            <div
              style={{
                background: "var(--surface-high)",
                borderRadius: 14,
                height: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: "rgba(133,173,255,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FileTypeIcon mimeType={mimeType} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--on-surface)" }}>
                  {fileTypeLabel(mimeType)}
                </div>
                <div style={{ fontSize: 11, color: "var(--on-surface-muted)", marginTop: 2 }}>
                  {formatBytes(size)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: "0 28px 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 10 }}>
            <button
              onClick={onSave}
              style={{
                padding: "13px",
                background: "var(--primary)",
                border: "none",
                borderRadius: 12,
                color: "#0e0e0f",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
              }}
            >
              Save to Downloads
            </button>
            <button
              onClick={onDismiss}
              style={{
                padding: "13px 20px",
                background: "var(--surface-high)",
                border: "none",
                borderRadius: 12,
                color: "var(--on-surface-variant)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                whiteSpace: "nowrap",
              }}
            >
              Dismiss
            </button>
          </div>
          {/* Auto-save countdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                flex: 1,
                height: 2,
                background: "var(--surface-highest)",
                borderRadius: 1,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(countdown / AUTO_SAVE_SECS) * 100}%`,
                  background: "var(--primary)",
                  borderRadius: 1,
                  transition: "width 1s linear",
                }}
              />
            </div>
            <span style={{ fontSize: 11, color: "var(--on-surface-muted)", flexShrink: 0 }}>
              Saving in {countdown}s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function badgeStyle(
  color: string,
  bg = `${color}1f`,
  border = `${color}33`,
): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.04em",
    padding: "2px 7px",
    borderRadius: 6,
    background: bg,
    color,
    border: `1px solid ${border}`,
  };
}

function truncateName(name: string, maxLen = 28): string {
  if (name.length <= maxLen) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const base = dot > 0 ? name.slice(0, dot) : name;
  const keep = maxLen - ext.length - 1;
  if (keep <= 4) return `…${ext}`;
  const half = Math.floor(keep / 2);
  return `${base.slice(0, half)}…${base.slice(-(keep - half))}${ext}`;
}

function friendlyMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "JPEG image",
    "image/png": "PNG image",
    "image/gif": "GIF image",
    "image/webp": "WebP image",
    "image/svg+xml": "SVG image",
    "image/heic": "HEIC image",
    "text/plain": "Text file",
    "text/html": "HTML file",
    "text/css": "CSS file",
    "text/csv": "CSV file",
    "application/json": "JSON file",
    "application/xml": "XML file",
    "application/pdf": "PDF document",
    "application/zip": "ZIP archive",
    "application/x-tar": "TAR archive",
    "video/mp4": "MP4 video",
    "video/quicktime": "QuickTime video",
    "video/webm": "WebM video",
    "audio/mpeg": "MP3 audio",
    "audio/wav": "WAV audio",
    "audio/ogg": "OGG audio",
  };
  if (map[mimeType]) return map[mimeType];
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType.startsWith("text/")) return "Text file";
  return mimeType;
}

function fileTypeLabel(mimeType: string): string {
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType === "application/pdf") return "PDF Document";
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("rar") || mimeType.includes("7z"))
    return "Archive";
  if (mimeType.includes("word") || mimeType.includes("document")) return "Document";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "Spreadsheet";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "Presentation";
  return "File";
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  const c = "var(--primary)";
  if (mimeType.startsWith("video/")) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    );
  }
  if (mimeType.startsWith("audio/")) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    );
  }
  if (mimeType === "application/pdf") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    );
  }
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("rar")) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
