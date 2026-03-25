import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useWs } from "../contexts/use-ws";
import { useWindowWidth } from "../hooks/useWindowWidth";
import { notify } from "../lib/notify";
import { toast } from "../components/Toast";
import { emitMeshEvent } from "../lib/event-store";
import { DevicePicker } from "../components/DevicePicker";
import type { ClipboardMessage } from "@aether/types";


type ClipboardEntry = {
  id: string;
  content: string;
  from: string;
  timestamp: number;
  type: "text" | "image";
};

type ServerInfo = {
  ips: string[];
  wsPort: number;
  webPort: number;
};

const MAX_HISTORY = 50;

export function Portal() {
  const [history, setHistory] = useState<ClipboardEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("aether-clipboard-history") ?? "[]"); }
    catch { return []; }
  });
  const [lastContent, setLastContent] = useState("");
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(() => {
    try { return JSON.parse(localStorage.getItem("aether-clipboard-autosync") ?? "false"); }
    catch { return false; }
  });
  const autoSyncRef = useRef(autoSync);
  useEffect(() => { autoSyncRef.current = autoSync; }, [autoSync]);

  // Persist history to localStorage
  useEffect(() => {
    localStorage.setItem("aether-clipboard-history", JSON.stringify(history.slice(0, MAX_HISTORY)));
  }, [history]);

  // Persist auto-sync preference
  useEffect(() => {
    localStorage.setItem("aether-clipboard-autosync", JSON.stringify(autoSync));
  }, [autoSync]);

  // Fetch server LAN IPs for QR code
  useEffect(() => {
    fetch('/api/info')
      .then((r) => r.json())
      .then(setServerInfo)
      .catch(() => {});
  }, []);

  const { connected, send, subscribe, devices: allDevices, myDeviceId } = useWs();
  const devices = allDevices.filter((d) => d.id !== myDeviceId);
  const mobile = useWindowWidth() < 768;

  const addEntry = useCallback((entry: ClipboardEntry) => {
    setHistory((prev) => {
      if (prev[0]?.content === entry.content) return prev; // deduplicate
      return [entry, ...prev].slice(0, MAX_HISTORY);
    });
  }, []);

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type !== "clipboard") return;
      const senderId = ("senderId" in msg ? msg.senderId : undefined) as string | undefined;
      const entry: ClipboardEntry = {
        id: crypto.randomUUID(),
        content: msg.data,
        from: senderId ?? msg.from,
        timestamp: msg.timestamp,
        type: "text",
      };
      addEntry(entry);
      setLastContent(msg.data);
      notify(`Clipboard from ${msg.from}`, msg.data.slice(0, 80));
    });
  }, [subscribe, addEntry]);

  // Local helpers need stable refs (lint rule: no hoist-before-declare)
  const applyRef = useRef<() => void>(() => {});

  // Read local clipboard and optionally auto-sync.
  // Uses events instead of polling — polling triggers Firefox's paste permission dialog on every tick.
  useEffect(() => {
    let last = "";

    async function tryRead() {
      try {
        const clipSync = (() => { try { return JSON.parse(localStorage.getItem("aether-settings") ?? "{}").clipboardSync ?? true; } catch { return true; } })();
        if (!clipSync) return;
        const text = await navigator.clipboard.readText();
        if (text && text !== last) {
          last = text;
          setLastContent(text);
          if (autoSyncRef.current && sendRef.current) {
            sendRef.current({
              type: "clipboard",
              data: text,
              from: "web",
              timestamp: new Date().getTime(),
            } as ClipboardMessage);
            addEntry({
              id: crypto.randomUUID(),
              content: text,
              from: "local",
              timestamp: new Date().getTime(),
              type: "text",
            });
          }
        }
      } catch {
        // permission not granted — silent
      }
    }

    // Fires when user copies on this page — clipboard is updated by the time handler runs
    const onCopy = () => setTimeout(tryRead, 0);
    // Fires when user switches back to this tab (may have copied from another app)
    const onVisible = () => { if (document.visibilityState === "visible") tryRead(); };

    document.addEventListener("copy", onCopy);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tryRead);

    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tryRead);
    };
  }, [addEntry]);

  function formatSentTo() {
    if (devices.length === 0) return "no devices";
    if (devices.length === 1) return devices[0].name;
    if (devices.length === 2) return `${devices[0].name} + ${devices[1].name}`;
    return `${devices[0].name} + ${devices.length - 1} more`;
  }

  function pushToAll() {
    if (!lastContent || !connected) return;
    send({
      type: "clipboard",
      data: lastContent,
      from: "web",
      timestamp: new Date().getTime(),
    } as ClipboardMessage);
    setSent(true);
    const label = formatSentTo();
    toast(`Sent to ${label}`, "✓");
    emitMeshEvent("clipboard:sent", { deviceName: label });
    setTimeout(() => setSent(false), 2500);
  }

  function deleteEntry(id: string) {
    setHistory((prev) => prev.filter((e) => e.id !== id));
  }

  function clearHistory() {
    setHistory([]);
  }

  function deviceName(from: string) {
    if (from === "local") return "This device";
    const d = allDevices.find((d) => d.id === from || d.stableId === from);
    return d?.name ?? from;
  }

  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  function resendEntry(content: string) {
    if (!connected) return;
    send({
      type: "clipboard",
      data: content,
      from: "web",
      timestamp: new Date().getTime(),
    } as ClipboardMessage);
    setSent(true);
    toast(`Sent to ${formatSentTo()}`, "✓");
    setTimeout(() => setSent(false), 2500);
  }

  const [sent, setSent] = useState(false);
  const [sendPickerOpen, setSendPickerOpen] = useState(false);
  const [sentDevices, setSentDevices] = useState<Set<string>>(new Set());

  function sendToDevice(deviceId: string, name: string) {
    if (!lastContent || !connected) return;
    send({
      type: "clipboard",
      data: lastContent,
      from: "web",
      to: deviceId,
      timestamp: new Date().getTime(),
    } as ClipboardMessage);
    setSentDevices((prev) => new Set([...prev, deviceId]));
    toast(`Sent to ${name}`, "✓");
    emitMeshEvent("clipboard:sent", { deviceId: deviceId, deviceName: name });
    setTimeout(() => {
      setSentDevices((prev) => { const n = new Set(prev); n.delete(deviceId); return n; });
    }, 2000);
  }
  const [applied, setApplied] = useState(false);
  const applyTimeoutRef = useRef<number | null>(null);
  const lastApplyOpRef = useRef<number>(0);

  function clearApplyTimeout() {
    if (applyTimeoutRef.current !== null) {
      clearTimeout(applyTimeoutRef.current);
      applyTimeoutRef.current = null;
    }
  }

  // Avoid "setState in effect" lint: derive applied state from content
  const appliedUi = applied && !!lastContent;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        applyRef.current();
      }
    }
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearApplyTimeout();
    };
  }, []);

  function applyToClipboard() {
    if (!lastContent) return;
    lastApplyOpRef.current += 1;
    const opId = lastApplyOpRef.current;
    navigator.clipboard.writeText(lastContent)
      .then(() => {
        if (lastApplyOpRef.current !== opId) return;
        setApplied((prev) => (prev ? prev : true));
        toast("Copied to clipboard", "✓");
        clearApplyTimeout();
        applyTimeoutRef.current = window.setTimeout(() => { applyTimeoutRef.current = null; setApplied(false); }, 1500);
      })
      .catch(() => {
        console.error("[clipboard] write failed — permissions or HTTPS required");
      });
  }

  useEffect(() => {
    applyRef.current = applyToClipboard;
  }, [applyToClipboard]);

  async function copyEntry(content: string, id: string) {
    await navigator.clipboard.writeText(content);
    setCopied(id);
    toast("Copied", "✓");
    setTimeout(() => setCopied(null), 1500);
  }

  // QR points to the HTTP web app URL — Android opens it in browser
  const qrValue = serverInfo?.ips[0]
    ? `https://${serverInfo.ips[0]}:${serverInfo.webPort}`
    : `https://${window.location.hostname}:${serverInfo?.webPort ?? 5173}`;

  return (
    <div style={{ padding: mobile ? "24px 16px" : "48px 40px", maxWidth: 1300, margin: "0 auto" }}>
      {/* Hero */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--primary)", marginBottom: 12 }}>
          DEVICE SYNC
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
          Portal
        </h1>
        <p style={{ fontSize: 15, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
          Sync files & clipboard across devices
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1.3fr 1fr", gap: 24 }}>
        {/* Live Sync panel */}
        <div style={{ background: "var(--surface-low)", borderRadius: 20, padding: 24, minWidth: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: connected ? "#22c55e" : "#ef4444",
                display: "inline-block",
                boxShadow: connected ? "0 0 6px rgba(34,197,94,0.7)" : "none",
              }}
            />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "var(--on-surface-muted)" }}>
              {connected ? "LIVE SYNC ACTIVE" : "DISCONNECTED"}
            </span>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: "var(--on-surface-muted)", letterSpacing: "0.08em", marginBottom: 10 }}>
              LAST COPIED ITEM
            </div>
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 15,
                color: "var(--on-surface)",
                fontWeight: 500,
                wordBreak: "break-all",
                overflowWrap: "break-word",
                lineHeight: 1.5,
                minHeight: 48,
                maxHeight: 120,
                overflowY: "auto",
                padding: "12px 14px",
                background: "var(--surface-high)",
                borderRadius: 10,
              }}
            >
              {lastContent || (
                <span style={{ color: "var(--on-surface-muted)", fontStyle: "italic" }}>
                  Nothing copied yet
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={applyToClipboard}
              disabled={!lastContent}
              className={appliedUi ? "btn-success" : ""}
              style={{
                flex: 1,
                padding: "11px 16px",
                background: applied ? "rgba(34,197,94,0.15)" : "var(--surface-high)",
                border: "none",
                borderRadius: 10,
                color: applied ? "#22c55e" : lastContent ? "var(--on-surface)" : "var(--on-surface-muted)",
                fontSize: 13,
                fontWeight: 700,
                cursor: lastContent ? "pointer" : "not-allowed",
                fontFamily: "var(--font-ui)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "background 0.15s, color 0.15s, transform 0.1s",
              }}
            >
              {appliedUi ? "✓ Copied" : "Copy"}
            </button>
            <div style={{ flex: 1, position: "relative" }}>
              <button
                onClick={() => setSendPickerOpen((v) => !v)}
                disabled={!connected || !lastContent}
                className={sent ? "btn-success" : ""}
                style={{
                  width: "100%",
                  padding: "11px 16px",
                  background: sent ? "rgba(34,197,94,0.15)" : connected && lastContent ? "var(--primary)" : "var(--surface-high)",
                  border: "none",
                  borderRadius: 10,
                  color: sent ? "#22c55e" : connected && lastContent ? "#0e0e0f" : "var(--on-surface-muted)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: connected && lastContent ? "pointer" : "not-allowed",
                  fontFamily: "var(--font-ui)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "background 0.15s, color 0.15s, transform 0.1s",
                }}
              >
                {sent
                  ? `✓ Sent to ${formatSentTo()}`
                  : <>
                      <span style={{ fontSize: 11 }}>⟩</span>
                      Send
                      <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
                    </>
                }
              </button>
              {sendPickerOpen && (
                <DevicePicker
                  devices={devices}
                  onSelect={(id) => {
                    if (id === null) pushToAll();
                    else { const d = devices.find((x) => x.id === id); sendToDevice(id, d?.name ?? id); }
                    setSendPickerOpen(false);
                  }}
                  onClose={() => setSendPickerOpen(false)}
                />
              )}
            </div>
            <button
              onClick={() => setLastContent("")}
              disabled={!lastContent}
              style={{
                width: 40,
                height: 40,
                background: "var(--surface-high)",
                border: "none",
                borderRadius: 10,
                color: "var(--on-surface-muted)",
                cursor: lastContent ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TrashIcon />
            </button>
          </div>

          {/* Connected devices — clickable to send individually */}
          {devices.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", boxShadow: "0 0 5px rgba(34,197,94,0.6)", flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", color: "var(--on-surface-muted)" }}>
                  SEND TO
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {devices.slice(0, 6).map((d) => (
                  <DeviceChip
                    key={d.id}
                    device={d}
                    sent={sentDevices.has(d.id)}
                    disabled={!lastContent}
                    onClick={() => sendToDevice(d.id, d.name)}
                  />
                ))}
                {devices.length > 6 && (
                  <span style={{ fontSize: 11, color: "var(--on-surface-muted)", alignSelf: "center" }}>+{devices.length - 6} more</span>
                )}
              </div>
            </div>
          )}

          {/* Auto-sync toggle */}
          <div
            style={{
              marginTop: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              background: "var(--surface-high)",
              borderRadius: 10,
            }}
          >
            <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--on-surface)" }}>Auto-sync clipboard</div>
                <div style={{ fontSize: 10, color: "var(--on-surface-muted)", marginTop: 2 }}>
                Sync local copies to your devices automatically
                </div>
              </div>
            <button
              onClick={() => setAutoSync((v: boolean) => !v)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: autoSync ? "var(--primary)" : "var(--surface-highest)",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: autoSync ? 23 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--on-surface)" }}>
                  History <span style={{ fontSize: 11, color: "var(--on-surface-muted)", fontWeight: 400 }}>({history.length})</span>
                </div>
                <button
                  onClick={clearHistory}
                  style={{ fontSize: 11, color: "var(--on-surface-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-ui)" }}
                >
                  Clear all
                </button>
              </div>
              <div style={{ maxHeight: 400, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 6 }}>
                {history.map((entry) => {
                  const isExpanded = expandedEntry === entry.id;
                  return (
                    <div
                      key={entry.id}
                      style={{
                        background: "var(--surface-high)",
                        borderRadius: 10,
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                    >
                      {/* Collapsed row */}
                      <div
                        onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            background: entry.from === "local" ? "rgba(133,173,255,0.12)" : "rgba(250,176,255,0.12)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <TextIcon size={11} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                          <div style={{ fontSize: 12, color: "var(--on-surface)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {entry.content}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--on-surface-muted)", marginTop: 2 }}>
                            {deviceName(entry.from)} · {formatTime(entry.timestamp)}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyEntry(entry.content, entry.id); }}
                            style={{ fontSize: 10, color: copied === entry.id ? "#22c55e" : "var(--on-surface-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 600, minWidth: 40 }}
                          >
                            {copied === entry.id ? "Copied" : "Copy"}
                          </button>
                          <span style={{ fontSize: 10, color: "var(--on-surface-muted)", opacity: 0.4, transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>
                            v
                          </span>
                        </div>
                      </div>

                      {/* Expanded preview */}
                      {isExpanded && (
                        <div style={{ padding: "0 12px 12px 12px" }}>
                          <div
                            style={{
                              padding: "10px 12px",
                              background: "var(--surface-highest)",
                              borderRadius: 8,
                              fontSize: 12,
                              color: "var(--on-surface)",
                              lineHeight: 1.6,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                              maxHeight: 160,
                              overflowY: "auto",
                              marginBottom: 10,
                              fontFamily: "monospace",
                            }}
                          >
                            {entry.content}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); resendEntry(entry.content); }}
                              disabled={!connected}
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                background: connected ? "var(--primary)" : "var(--surface-highest)",
                                border: "none",
                                borderRadius: 8,
                                color: connected ? "#0e0e0f" : "var(--on-surface-muted)",
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: connected ? "pointer" : "not-allowed",
                                fontFamily: "var(--font-ui)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 5,
                              }}
                            >
                              <span style={{ fontSize: 10 }}>&#10148;</span> Send to All
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); copyEntry(entry.content, entry.id); }}
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                background: "var(--surface-highest)",
                                border: "none",
                                borderRadius: 8,
                                color: copied === entry.id ? "#22c55e" : "var(--on-surface)",
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                                fontFamily: "var(--font-ui)",
                              }}
                            >
                              {copied === entry.id ? "Copied" : "Copy"}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); setExpandedEntry(null); }}
                              style={{
                                width: 34,
                                height: 34,
                                background: "var(--surface-highest)",
                                border: "none",
                                borderRadius: 8,
                                color: "var(--on-surface-muted)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Connect + Status */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ background: "var(--surface-low)", borderRadius: 20, padding: 28, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--on-surface)", marginBottom: 6, textAlign: "center" }}>
            Add Device
          </div>
          <div style={{ fontSize: 11, color: "var(--on-surface-muted)", letterSpacing: "0.08em", marginBottom: 28, textAlign: "center" }}>
            SCAN TO CONNECT
          </div>

          {/* QR code */}
          <div
            style={{
              padding: 20,
              background: "#fff",
              borderRadius: 16,
              marginBottom: 20,
              border: "3px solid rgba(133,173,255,0.3)",
            }}
          >
            <QRCodeSVG
              value={qrValue}
              size={180}
              bgColor="#ffffff"
              fgColor="#0e0e0f"
              level="M"
            />
          </div>

          <p style={{ fontSize: 12, color: "var(--on-surface-variant)", textAlign: "center", lineHeight: 1.6, marginBottom: 20, maxWidth: 220 }}>
            Scan this code to connect another device on your local network.
          </p>

          <div style={{ fontSize: 11, color: "var(--on-surface-muted)", background: "var(--surface-high)", padding: "6px 14px", borderRadius: 8, fontFamily: "monospace", marginBottom: 16, wordBreak: "break-all", textAlign: "center" }}>
            {qrValue}
          </div>

          {serverInfo && serverInfo.ips.length > 1 && (
            <div style={{ width: "100%" }}>
              <div style={{ fontSize: 10, color: "var(--on-surface-muted)", letterSpacing: "0.08em", marginBottom: 8, textAlign: "center" }}>
                OTHER INTERFACES
              </div>
              {serverInfo.ips.slice(1).map((ip) => (
                <div
                  key={ip}
                  style={{
                    fontSize: 11,
                    color: "var(--on-surface-variant)",
                    textAlign: "center",
                    fontFamily: "monospace",
                    marginBottom: 4,
                  }}
                >
                  http://{ip}:{serverInfo.webPort}
                </div>
              ))}
            </div>
          )}
        </div>

          {/* Sync Status */}
          <div style={{ background: "var(--surface-low)", borderRadius: 20, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--on-surface)", marginBottom: 20 }}>
              Sync Status
            </div>
            <StatRow label="ITEMS SYNCED" value={String(history.length)} />
            <StatRow label="DEVICES" value={devices.length === 1 ? "1 device connected" : `${devices.length} devices connected`} />
            <StatRow label="CONNECTION" value={connected ? "Active" : "Offline"} valueColor={connected ? "#22c55e" : "var(--error)"} />
            <StatRow label="SERVER" value={serverInfo?.ips[0] ?? "localhost"} />

            {devices.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {devices.slice(0, 6).map((d) => (
                  <div
                    key={d.id}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: "var(--surface-high)",
                      fontSize: 11,
                      color: "var(--on-surface-variant)",
                      fontFamily: "var(--font-ui)",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{deviceIcon(d)}</span>
                    {d.name}
                  </div>
                ))}
                {devices.length > 6 && (
                  <div style={{ padding: "6px 10px", borderRadius: 999, background: "var(--surface-high)", fontSize: 11, color: "var(--on-surface-muted)", fontFamily: "var(--font-ui)" }}>
                    +{devices.length - 6} more
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeviceChip({
  device,
  sent,
  disabled,
  onClick,
}: {
  device: { id: string; name: string; platform: string };
  sent: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const icon = deviceIcon(device);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "5px 10px",
        borderRadius: 8,
        border: sent ? "1px solid rgba(34,197,94,0.3)" : hovered && !disabled ? "1px solid rgba(133,173,255,0.3)" : "1px solid transparent",
        background: sent
          ? "rgba(34,197,94,0.1)"
          : hovered && !disabled
          ? "rgba(133,173,255,0.1)"
          : "var(--surface-high)",
        fontSize: 12,
        fontWeight: 600,
        color: sent ? "#22c55e" : hovered && !disabled ? "var(--primary)" : "var(--on-surface-variant)",
        fontFamily: "var(--font-ui)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        transition: "all 0.15s, transform 0.1s",
      }}
    >
      <span style={{ fontSize: 11 }}>{icon}</span>
      {device.name}
      <span
        style={{
          fontSize: 11,
          opacity: sent || hovered ? 1 : 0,
          transform: sent || hovered ? "translateX(0)" : "translateX(-4px)",
          transition: "opacity 0.15s, transform 0.15s",
          marginLeft: 1,
        }}
      >
        {sent ? "✓" : "→"}
      </span>
    </button>
  );
}

function deviceIcon(d: { platform: string; name: string }): string {
  if (d.platform === "web") return "🌐";
  const n = d.name.toLowerCase();
  if (n.includes("iphone") || n.includes("ipad")) return "📱";
  if (n.includes("android")) return "📱";
  if (n.includes("mac") || n.includes(".local")) return "💻";
  if (n.includes("windows") || n.includes("win")) return "🖥️";
  if (n.includes("linux")) return "🖥️";
  return "💻"; // agent default
}

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "var(--on-surface-muted)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: valueColor ?? "var(--on-surface)" }}>{value}</span>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function TextIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--on-surface-muted)" strokeWidth="1.5">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function formatTime(ts: number): string {
  const diff = new Date().getTime() - ts;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
