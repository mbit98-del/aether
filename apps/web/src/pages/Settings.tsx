import { useEffect, useState } from "react";
import { useWs } from "../contexts/use-ws";
import { useWindowWidth } from "../hooks/useWindowWidth";
import { getTrustedDevices, untrustDevice } from "../lib/trust-store";
import { clearHistory } from "../lib/history-store";

const SETTINGS_KEY = "aether-settings";
const LAST_SEEN_KEY = "aether-last-seen";

function loadLastSeen(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LAST_SEEN_KEY) ?? "{}"); }
  catch { return {}; }
}

function formatLastSeen(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"); } catch { return {}; }
}

export function Settings() {
  const { deviceName, setDeviceName: applyDeviceName, connected, devices } = useWs();
  const mobile = useWindowWidth() < 768;
  const saved = loadSettings();

  const [draftName, setDraftName] = useState(deviceName);

  const [connectedAt, setConnectedAt] = useState<number | null>(() => {
    const stored = sessionStorage.getItem("aether-connected-at");
    return stored ? Number(stored) : null;
  });
  const [uptime, setUptime] = useState("--");

  useEffect(() => {
    if (connected) {
      // Keep existing timestamp across reloads; only stamp on fresh connect
      if (!sessionStorage.getItem("aether-connected-at")) {
        const now = Date.now();
        sessionStorage.setItem("aether-connected-at", String(now));
        setConnectedAt(now);
      }
    } else {
      sessionStorage.removeItem("aether-connected-at");
      setConnectedAt(null);
      setUptime("--");
    }
  }, [connected]);

  useEffect(() => {
    if (!connectedAt) return;
    function tick() {
      const s = Math.floor((Date.now() - connectedAt!) / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      const d = Math.floor(h / 24);
      if (d > 0) setUptime(`${d}d ${String(h % 24).padStart(2, "0")}h ${String(m % 60).padStart(2, "0")}m`);
      else if (h > 0) setUptime(`${h}h ${String(m % 60).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`);
      else setUptime(`${m}m ${String(s % 60).padStart(2, "0")}s`);
    }
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [connectedAt]);
  const [lastSeen, setLastSeen] = useState<Record<string, number>>(loadLastSeen);

  useEffect(() => {
    if (devices.length === 0) return;
    setLastSeen((prev) => {
      const updated = { ...prev };
      for (const d of devices) {
        const key = d.stableId ?? d.id;
        updated[key] = Date.now();
      }
      localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(updated));
      return updated;
    });
  }, [devices]);

  const [clipboardSync, setClipboardSync] = useState(saved.clipboardSync ?? true);
  const [autoAccept, setAutoAccept] = useState(saved.autoAccept ?? true);
  const [offlineLAN, setOfflineLAN] = useState(saved.offlineLAN ?? false);
  const [saved_, setSaved_] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [trustedIds, setTrustedIds] = useState<Set<string>>(() => getTrustedDevices());

  function handleApply() {
    applyDeviceName(draftName);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ clipboardSync, autoAccept, offlineLAN }));
    setSaved_(true);
    setTimeout(() => setSaved_(false), 2000);
  }

  function handleReset() {
    if (!resetConfirm) {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 3000);
      return;
    }
    localStorage.removeItem("aether-trusted-devices");
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem("aether-device-name");
    clearHistory();
    window.location.reload();
  }

  function handleRevoke(id: string) {
    untrustDevice(id);
    setTrustedIds(getTrustedDevices());
  }

  return (
    <div style={{ padding: mobile ? "24px 16px" : "48px 40px", display: "flex", flexDirection: "column", maxWidth: 1400, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr auto", gap: mobile ? 24 : 40, alignItems: "start", marginBottom: 48 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--primary)", marginBottom: 8 }}>
                SYSTEM CONFIGURATION
              </div>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: mobile ? 36 : 56,
                  letterSpacing: "-2px",
                  color: "var(--on-surface)",
                  marginBottom: 12,
                  lineHeight: 1.05,
                }}
              >
                Device Settings
              </h1>
              <p style={{ fontSize: 15, color: "var(--on-surface-variant)", lineHeight: 1.5, maxWidth: 360 }}>
                Adjust your local network visibility and synchronization preferences for seamless file handling.
              </p>
            </div>

            {/* Connectivity panel */}
            <div
              style={{
                background: "var(--surface-low)",
                borderRadius: 16,
                padding: "24px",
                minWidth: 220,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--on-surface)", marginBottom: 4 }}>
                Connectivity
              </div>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)", marginBottom: 20 }}>
                Current throughput and discovery status.
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: "var(--on-surface-muted)", letterSpacing: "0.08em" }}>UPTIME</span>
                  <span style={{ fontSize: 13, color: "var(--primary)", fontWeight: 700 }}>{uptime}</span>
                </div>
                <div style={{ height: 2, background: "var(--surface-highest)", borderRadius: 1 }}>
                  <div style={{ width: "85%", height: "100%", background: "var(--primary)", borderRadius: 1 }} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "var(--on-surface-muted)", letterSpacing: "0.08em" }}>NODES ONLINE</span>
                <span style={{ fontSize: 13, color: connected ? "#22c55e" : "var(--error)", fontWeight: 600 }}>
                  {connected ? `${devices.length} connected` : "Offline"}
                </span>
              </div>
            </div>
          </div>

          {/* Network badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--primary)", display: "inline-block" }} />
            <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
              NETWORK: <strong style={{ color: "var(--primary)" }}>LAN OPTIMIZED</strong>
            </span>
          </div>

          {/* Identity section */}
          <Section icon="✏️" title="Identity">
            <div>
              <div style={{ fontSize: 10, color: "var(--on-surface-muted)", letterSpacing: "0.08em", marginBottom: 10 }}>DEVICE NAME</div>
              {/* Padded box instead of underline — no border rule */}
              <div style={{ background: "var(--surface-high)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--on-surface)",
                    fontSize: 22,
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    width: "100%",
                  }}
                />
              </div>
              <div style={{ fontSize: 13, color: "var(--on-surface-variant)", fontStyle: "italic" }}>
                This name will be visible to other trusted nodes on your local network.
              </div>
            </div>
          </Section>

          {/* Sync & Privacy section */}
          <Section icon="🔌" title="Synchronization & Privacy">
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr 1fr", gap: mobile ? 24 : 32 }}>
              <ToggleItem
                label="Clipboard Sync"
                description="Automatically share copied text and images across all trusted devices."
                value={clipboardSync}
                onChange={setClipboardSync}
              />
              <ToggleItem
                label="Auto Accept"
                description="Instantly allow file transfers from devices previously marked as trusted."
                value={autoAccept}
                onChange={setAutoAccept}
              />
              <ToggleItem
                label="Offline LAN Mode"
                description="Disable internet relays and only allow discovery on local Wi-Fi or Ethernet."
                value={offlineLAN}
                onChange={setOfflineLAN}
              />
            </div>
          </Section>

          {/* Trusted Devices section */}
          <Section icon="🔐" title="Trusted Devices">
            {trustedIds.size === 0 ? (
              <div style={{ fontSize: 13, color: "var(--on-surface-muted)", fontStyle: "italic" }}>
                No trusted devices yet. Approve a file transfer from a new device to add it here.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...trustedIds].map((id) => {
                  const knownDevice = devices.find((d) => d.id === id || d.stableId === id);
                  const displayName = knownDevice?.name ?? `device-${id.slice(0, 8)}`;
                  const isOnline = !!knownDevice;
                  const lastSeenTs = lastSeen[id] ?? null;
                  const latency = knownDevice?.latencyMs ?? null;
                  return (
                    <div
                      key={id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        background: "var(--surface-high)",
                        borderRadius: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: isOnline ? "rgba(133,173,255,0.15)" : "var(--surface-highest)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, color: isOnline ? "var(--primary)" : "var(--on-surface-muted)" }}>
                          {displayName.slice(0, 1).toUpperCase()}
                        </span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--on-surface)" }}>{displayName}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, color: isOnline ? "#22c55e" : "var(--on-surface-muted)" }}>
                            {isOnline ? "● online" : "○ offline"}
                          </span>
                          {lastSeenTs && (
                            <span style={{ fontSize: 10, color: "var(--on-surface-muted)" }}>
                              · last seen {formatLastSeen(lastSeenTs)}
                            </span>
                          )}
                          {latency !== null && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: "1px 6px",
                                borderRadius: 4,
                                background: latency < 20 ? "rgba(34,197,94,0.12)" : latency < 80 ? "rgba(133,173,255,0.12)" : "rgba(255,113,108,0.12)",
                                color: latency < 20 ? "#22c55e" : latency < 80 ? "var(--primary)" : "var(--error)",
                              }}
                            >
                              {latency}ms
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRevoke(id)}
                        style={{
                          padding: "6px 14px",
                          background: "rgba(255,113,108,0.1)",
                          border: "none",
                          borderRadius: 8,
                          color: "var(--error)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "var(--font-ui)",
                          flexShrink: 0,
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Bottom row */}
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 24, marginTop: 8 }}>
            {/* System Maintenance — tonal shift instead of border */}
            <div
              style={{
                background: "rgba(255,113,108,0.06)",
                borderRadius: 16,
                padding: 24,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--on-surface)" }}>
                  System Maintenance
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.5, marginBottom: 20 }}>
                Clear all local caches and reset node identification keys. This will disconnect all currently paired devices.
              </p>
              <button
                onClick={handleReset}
                style={{
                  padding: "10px 20px",
                  background: resetConfirm ? "rgba(255,113,108,0.25)" : "rgba(255,113,108,0.12)",
                  border: "none",
                  borderRadius: 10,
                  color: "var(--error)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                  transition: "background 0.2s",
                }}
              >
                {resetConfirm ? "Confirm — this cannot be undone" : "Reset Node Configuration"}
              </button>
            </div>

            {/* Connected Peers */}
            <div style={{ background: "var(--surface-low)", borderRadius: 16, padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--on-surface)" }}>
                  Connected Peers
                </span>
                <span
                  style={{
                    padding: "3px 10px",
                    background: "rgba(133,173,255,0.15)",
                    borderRadius: 12,
                    fontSize: 11,
                    color: "var(--primary)",
                    fontWeight: 600,
                  }}
                >
                  {devices.length} ONLINE
                </span>
              </div>
              {devices.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--on-surface-muted)", paddingBottom: 8 }}>
                  No peers connected.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                  {devices.map((d) => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: d.platform === "agent" ? "rgba(133,173,255,0.2)" : "rgba(250,176,255,0.2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, color: d.platform === "agent" ? "var(--primary)" : "var(--tertiary)" }}>
                          {d.name.slice(0, 1).toUpperCase()}
                        </span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--on-surface)" }}>{d.name}</div>
                        <div style={{ fontSize: 10, color: "var(--on-surface-muted)" }}>{d.platform}</div>
                      </div>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

      <div style={{ flex: 1 }} />

      {/* Footer — negative space only, no border */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 48,
        }}
      >
        {!mobile && (
          <span style={{ fontSize: 12, color: "var(--on-surface-muted)" }}>
            Aether Core v2.4.0
          </span>
        )}
        <div style={{ display: "flex", gap: 12, width: mobile ? "100%" : "auto" }}>
          <button
            onClick={handleApply}
            style={{
              padding: "12px 28px",
              flex: mobile ? 1 : undefined,
              background: saved_ ? "#22c55e" : "var(--primary)",
              border: "none",
              borderRadius: 12,
              color: "#0e0e0f",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              transition: "background 0.2s",
            }}
          >
            {saved_ ? "Saved!" : "Apply Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--on-surface)" }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function ToggleItem({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--on-surface)" }}>{label}</span>
        <Toggle value={value} onChange={onChange} />
      </div>
      <p style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>{description}</p>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        background: value ? "var(--primary)" : "var(--surface-highest)",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: value ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );
}
