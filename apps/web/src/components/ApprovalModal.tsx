type Props = {
  deviceName: string;
  fileName: string;
  onApprove: () => void;
  onAllowOnce: () => void;
  onReject: () => void;
};

export function ApprovalModal({ deviceName, fileName, onApprove, onAllowOnce, onReject }: Props) {
  return (
    <div
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
        animation: "fade-in 0.18s ease forwards",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--surface-low)",
          borderRadius: 24,
          padding: "40px 36px 32px",
          boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
          border: "1px solid rgba(255,255,255,0.05)",
          animation: "scale-in 0.2s ease forwards",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(250,176,255,0.12)",
            border: "1px solid rgba(250,176,255,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--tertiary)" strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--tertiary)", marginBottom: 8 }}>
          INCOMING TRANSFER REQUEST
        </div>

        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 26,
            color: "var(--on-surface)",
            letterSpacing: "-1px",
            marginBottom: 12,
          }}
        >
          Trust this device?
        </h2>

        <p style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, marginBottom: 8 }}>
          <strong style={{ color: "var(--on-surface)" }}>{deviceName}</strong> wants to send you a file:
        </p>

        <div
          style={{
            padding: "10px 14px",
            background: "var(--surface-high)",
            borderRadius: 10,
            marginBottom: 20,
            fontSize: 13,
            color: "var(--primary)",
            fontWeight: 500,
            fontFamily: "var(--font-ui)",
            wordBreak: "break-all",
          }}
        >
          {fileName}
        </div>

        <p style={{ fontSize: 12, color: "var(--on-surface-muted)", lineHeight: 1.5, marginBottom: 28 }}>
          "Allow &amp; Trust" lets this device send files without confirmation in future. "Allow once" accepts only this transfer.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <button
              onClick={onApprove}
              style={{
                width: "100%",
                padding: "13px",
                background: "var(--primary)",
                border: "none",
                borderRadius: 12,
                color: "#0e0e0f",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                transition: "opacity 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Allow &amp; Trust
            </button>
            <div style={{ fontSize: 11, color: "var(--on-surface-muted)", textAlign: "center", marginTop: 6 }}>
              This device will be remembered
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button
              onClick={onAllowOnce}
              style={{
                padding: "11px",
                background: "var(--surface-high)",
                border: "1px solid rgba(133,173,255,0.25)",
                borderRadius: 12,
                color: "var(--primary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                transition: "background 0.15s ease, border-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-highest)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-high)")}
            >
              Allow once
            </button>
            <button
              onClick={onReject}
              style={{
                padding: "11px",
                background: "var(--surface-high)",
                border: "1px solid rgba(255,113,108,0.3)",
                borderRadius: 12,
                color: "var(--error)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                transition: "background 0.15s ease, border-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-highest)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-high)")}
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
