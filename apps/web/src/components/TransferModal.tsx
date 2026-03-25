type Props = {
  fileName: string;
  totalBytes: number;
  sentBytes: number;
  bytesPerSec: number;
  targetCount: number;
  fileIndex: number;
  totalFiles: number;
  onCancel: () => void;
};

function formatSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${Math.round(bps / 1024)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

function formatEta(remainingBytes: number, bps: number): string {
  if (bps <= 0) return "—";
  const secs = Math.ceil(remainingBytes / bps);
  if (secs >= 60) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${secs}s`;
}

export function TransferModal({ fileName, totalBytes, sentBytes, bytesPerSec, targetCount, fileIndex, totalFiles, onCancel }: Props) {
  const progress = totalBytes > 0 ? Math.min(100, (sentBytes / totalBytes) * 100) : 0;
  const doneMB = sentBytes / 1024 / 1024;
  const totalMB = totalBytes / 1024 / 1024;

  return (
    <div
      data-testid="transfer-modal"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fade-in 0.18s ease forwards",
      }}
    >
      <div
        style={{
          width: 580,
          background: "var(--surface-low)",
          borderRadius: 24,
          padding: "48px 48px 36px",
          boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
          border: "1px solid rgba(255,255,255,0.05)",
          animation: "scale-in 0.2s ease forwards",
        }}
      >
        {/* Node animation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 40,
            marginBottom: 40,
          }}
        >
          <NodeCircle label="SOURCE NODE" active={false} />

          <div style={{ flex: 1, position: "relative", height: 2 }}>
            <div style={{ width: "100%", height: 2, background: "var(--surface-highest)", borderRadius: 1 }} />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: 2,
                width: `${progress}%`,
                background: "linear-gradient(to right, var(--primary-dim), var(--primary))",
                borderRadius: 1,
                transition: "width 0.3s ease",
              }}
            />
          </div>

          <NodeCircle label="RECEIVING NODE" active={true} />
        </div>

        {/* Status */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: progress >= 100 ? "#22c55e" : "var(--primary)",
                  display: "inline-block",
                  boxShadow: `0 0 8px rgba(${progress >= 100 ? "34,197,94" : "133,173,255"},0.8)`,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 28,
                  color: "var(--on-surface)",
                }}
              >
                {progress >= 100 ? "Sent!" : "Sending..."}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>
              {totalFiles > 1 && (
                <span style={{ color: "var(--primary)", fontWeight: 600, marginRight: 6 }}>
                  {fileIndex}/{totalFiles}
                </span>
              )}
              Syncing "{fileName}" to {targetCount} node{targetCount !== 1 ? "s" : ""}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 28,
                color: "var(--primary)",
                letterSpacing: "-1px",
              }}
            >
              {totalMB > 0 ? `${totalMB.toFixed(1)} MB` : "—"}
            </div>
            <div style={{ fontSize: 11, color: "var(--on-surface-variant)", letterSpacing: "0.06em" }}>
              TOTAL SIZE
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              width: "100%",
              height: 4,
              background: "var(--surface-highest)",
              borderRadius: 2,
              position: "relative",
            }}
          >
            <div
              className="progress-glow"
              style={{
                height: "100%",
                width: `${progress}%`,
                background: `linear-gradient(to right, var(--primary-dim), var(--primary))`,
                borderRadius: 2,
                position: "relative",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
              {doneMB.toFixed(1)} MB / {totalMB.toFixed(1)} MB
            </div>
            {bytesPerSec > 0 && progress < 100 && (
              <div style={{ fontSize: 11, color: "var(--on-surface-muted)", marginTop: 3 }}>
                {formatSpeed(bytesPerSec)}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>
              {Math.round(progress)}% PROCESSED
            </div>
            {bytesPerSec > 0 && progress < 100 && (
              <div style={{ fontSize: 11, color: "var(--on-surface-muted)", marginTop: 3 }}>
                ETA {formatEta(totalBytes - sentBytes, bytesPerSec)}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onCancel}
          style={{
            width: "100%",
            padding: "14px",
            background: "var(--surface-high)",
            border: "none",
            borderRadius: 12,
            color: "var(--on-surface-variant)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--font-ui)",
            transition: "background 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--surface-highest)";
            e.currentTarget.style.color = "var(--on-surface)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--surface-high)";
            e.currentTarget.style.color = "var(--on-surface-variant)";
          }}
        >
          {progress >= 100 ? "Close" : "Cancel Transfer"}
        </button>
      </div>
    </div>
  );
}

function NodeCircle({ label, active }: { label: string; active: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          border: `2px solid ${active ? "var(--primary)" : "var(--surface-highest)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-high)",
          boxShadow: active ? "0 0 20px rgba(133,173,255,0.2)" : "none",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke={active ? "var(--primary)" : "var(--on-surface-variant)"}
          strokeWidth="1.5"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M1 21h22" />
        </svg>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: active ? "var(--primary)" : "var(--on-surface-muted)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
