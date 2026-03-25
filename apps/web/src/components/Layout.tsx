import { NavLink } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { DevicePanel as DevicesSlideOver } from "./DevicePanel";
import { ActivityFeed } from "./ActivityFeed";
import { useDevicePanel, openDevicePanel } from "../hooks/useDevicePanel";
import { useWindowWidth } from "../hooks/useWindowWidth";
import { useWs } from "../contexts/use-ws";
import { emitMeshEvent, getEvents, subscribeEvents } from "../lib/event-store";
import type { AetherMessage } from "@aether/types";

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

function deviceIcon(name: string, platform: string): string {
  if (platform === "web") return "🌐";
  const n = name.toLowerCase();
  if (n.includes("iphone") || n.includes("ipad") || n.includes("android")) return "📱";
  if (n.includes("mac") || n.includes(".local")) return "💻";
  if (n.includes("windows") || n.includes("win")) return "🖥️";
  return "💻";
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export function Layout({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [pendingClipboard, setPendingClipboard] = useState<string | null>(null);
  const devicesOpen = useDevicePanel();

  const lastSeenRef = useRef(Number(sessionStorage.getItem("aether-bell-seen-at") ?? 0));
  const [unread, setUnread] = useState(() =>
    getEvents().filter((e) => e.timestamp > lastSeenRef.current).length
  );
  const width = useWindowWidth();
  const mobile = width < 768;

  const { connected, devices: allDevices, myDeviceId, deviceName, setDeviceName, subscribe, latency } = useWs();
  const devices = allDevices.filter((d) => d.id !== myDeviceId);

  // Settings toggles — read/write from same key as Settings page
  const [clipSync, setClipSync] = useState(() => {
    try { return JSON.parse(localStorage.getItem("aether-settings") ?? "{}").clipboardSync ?? true; }
    catch { return true; }
  });
  const [autoAccept, setAutoAccept] = useState(() => {
    try { return JSON.parse(localStorage.getItem("aether-settings") ?? "{}").autoAccept ?? true; }
    catch { return true; }
  });

  function patchSetting(key: string, value: boolean) {
    try {
      const s = JSON.parse(localStorage.getItem("aether-settings") ?? "{}");
      localStorage.setItem("aether-settings", JSON.stringify({ ...s, [key]: value }));
    } catch { return true; }
  }

  // Inline device rename
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(deviceName);
  useEffect(() => { setDraftName(deviceName); }, [deviceName]);

  // Push WS events into the event store (which bridges to activity-bus for the bell)
  useEffect(() => {
    return subscribe((msg: AetherMessage) => {
      if (msg.type === "clipboard") {
        const senderId = msg.senderId ?? msg.from;
        try {
          const clipDevices = JSON.parse(localStorage.getItem("aether-clip-devices") ?? "{}");
          if (clipDevices[senderId] === false) return;
        } catch { /* ignore */ }
        emitMeshEvent("clipboard:received", {
          deviceName: msg.from,
          meta: { clipboardPreview: msg.data.slice(0, 80) },
        });
        // On desktop: attempt silent write, no banner regardless of outcome.
        // On mobile: writeText() requires a user gesture, so show a tap-to-copy banner.
        if (mobile) {
          navigator.clipboard.writeText(msg.data).catch(() => {
            setPendingClipboard(msg.data);
          });
        } else {
          navigator.clipboard.writeText(msg.data).catch(() => {});
        }
      } else if (msg.type === "file-start") {
        emitMeshEvent("file:receiving", {
          meta: { fileName: (msg as { name: string }).name },
        });
      }
      // file-end: emitted from assembleAndDownload with the real filename
    });
  }, [subscribe]);

  // Recompute unread count from persistent store whenever a new event arrives
  useEffect(() => {
    return subscribeEvents(() => {
      setUnread(getEvents().filter((e) => e.timestamp > lastSeenRef.current).length);
    });
  }, []);

  // ⌘K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function openBell() {
    setBellOpen((v) => !v);
    setAvatarOpen(false);
    lastSeenRef.current = Date.now();
    sessionStorage.setItem("aether-bell-seen-at", String(lastSeenRef.current));
    setUnread(0);
  }
  function openAvatar() {
    setAvatarOpen((v) => !v);
    setBellOpen(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          height: 60,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(14,14,15,0.85)",
          backdropFilter: "blur(20px)",
        }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--primary)", marginRight: 40, letterSpacing: "-0.3px" }}>
          Aether
        </span>

        <div style={{ display: "flex", gap: mobile ? 0 : 4, flex: 1 }}>
          {[
            { to: "/", label: "Dashboard" },
            { to: "/clipboard", label: "Portal" },
            { to: "/history", label: "History" },
            { to: "/settings", label: "Settings" },
          ].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                padding: mobile ? "6px 8px" : "6px 14px",
                borderRadius: 8,
                fontSize: mobile ? 12 : 14,
                fontFamily: "var(--font-ui)",
                fontWeight: isActive ? 500 : 400,
                color: isActive ? "var(--on-surface)" : "var(--on-surface-variant)",
                textDecoration: "none",
                transition: "color 0.15s",
                whiteSpace: "nowrap",
                position: "relative",
              })}
            >
              {({ isActive }) => (
                <>
                  {label}
                  <span style={{
                    position: "absolute", bottom: 0, left: "50%",
                    width: "70%", height: 2, background: "var(--primary)", borderRadius: 1,
                    transform: isActive ? "translateX(-50%) scaleX(1)" : "translateX(-50%) scaleX(0)",
                    transformOrigin: "center",
                    transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
                    display: "block",
                  }} />
                </>
              )}
            </NavLink>
          ))}
        </div>

        {!mobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Search */}
            <button
              onClick={() => setPaletteOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 12px",
                background: "var(--surface-high)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 8,
                color: "var(--on-surface-variant)",
                fontSize: 12, fontFamily: "var(--font-ui)", cursor: "pointer",
                width: 200, justifyContent: "space-between",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <SearchIcon />
                <span>Search commands...</span>
              </span>
              <kbd style={{ padding: "1px 5px", background: "var(--surface-highest, var(--surface-low))", borderRadius: 4, fontSize: 10, color: "var(--on-surface-muted)", fontFamily: "var(--font-ui)" }}>⌘K</kbd>
            </button>

            {/* Devices */}
            <button
              onClick={openDevicePanel}
              title="Connected devices"
              style={{
                ...iconBtn,
                background: devicesOpen ? "var(--surface-high)" : "transparent",
                color: devicesOpen ? "var(--on-surface)" : "var(--on-surface-variant)",
              }}
            >
              <DevicesIcon />
            </button>

            {/* Bell */}
            <div style={{ position: "relative" }}>
              <button
                onClick={openBell}
                style={{
                  ...iconBtn,
                  background: bellOpen ? "var(--surface-high)" : "transparent",
                  color: bellOpen ? "var(--on-surface)" : "var(--on-surface-variant)",
                }}
              >
                <BellIcon />
                {unread > 0 && !bellOpen && (
                  <span style={{
                    position: "absolute", top: 5, right: 5,
                    width: 16, height: 16, borderRadius: "50%",
                    background: "var(--primary)", color: "#0e0e0f",
                    fontSize: 9, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--font-ui)",
                  }}>
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            </div>

            {/* Avatar */}
            <div style={{ position: "relative" }}>
              <button
                onClick={openAvatar}
                style={{
                  ...iconBtn,
                  background: "var(--surface-high)",
                  borderRadius: "50%",
                  position: "relative",
                  outline: avatarOpen ? "2px solid var(--primary)" : "none",
                  outlineOffset: 2,
                }}
              >
                <UserIcon />
                {/* Online dot */}
                <span style={{
                  position: "absolute", bottom: 5, right: 5,
                  width: 7, height: 7, borderRadius: "50%",
                  background: connected ? "#22c55e" : "#ef4444",
                  boxShadow: connected ? "0 0 5px rgba(34,197,94,0.7)" : "none",
                  border: "1.5px solid var(--bg)",
                }} />
              </button>
              {avatarOpen && (
                <DevicePanel
                  deviceName={deviceName}
                  draftName={draftName}
                  setDraftName={setDraftName}
                  editingName={editingName}
                  setEditingName={setEditingName}
                  onSaveName={() => { setDeviceName(draftName); setEditingName(false); }}
                  connected={connected}
                  devices={devices}
                  latency={latency}
                  clipSync={clipSync}
                  autoAccept={autoAccept}
                  onClipSync={(v) => { setClipSync(v); patchSetting("clipboardSync", v); }}
                  onAutoAccept={(v) => { setAutoAccept(v); patchSetting("autoAccept", v); }}
                  onClose={() => setAvatarOpen(false)}
                />
              )}
            </div>
          </div>
        )}
      </nav>

      <main style={{ flex: 1 }}>{children}</main>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {devicesOpen && <DevicesSlideOver />}
      {bellOpen && <ActivityFeed onClose={() => setBellOpen(false)} />}

      {pendingClipboard !== null && (
        <div
          style={{
            position: "fixed",
            bottom: 80,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 400,
            background: "var(--surface-high)",
            border: "1px solid rgba(133,173,255,0.3)",
            borderRadius: 16,
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            maxWidth: "calc(100vw - 32px)",
            width: "max-content",
          }}
        >
          <span style={{ fontSize: 20 }}>📋</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--on-surface)", marginBottom: 2 }}>
              Clipboard received
            </div>
            <div style={{ fontSize: 11, color: "var(--on-surface-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
              {pendingClipboard.slice(0, 60)}{pendingClipboard.length > 60 ? "…" : ""}
            </div>
          </div>
          <button
            onClick={() => {
              const text = pendingClipboard;
              setPendingClipboard(null);
              navigator.clipboard.writeText(text).catch(() => {});
            }}
            style={{
              padding: "8px 16px",
              background: "var(--primary)",
              border: "none",
              borderRadius: 10,
              color: "#0e0e0f",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              flexShrink: 0,
            }}
          >
            Copy
          </button>
          <button
            onClick={() => setPendingClipboard(null)}
            style={{
              background: "none",
              border: "none",
              color: "var(--on-surface-muted)",
              fontSize: 20,
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Device Panel ────────────────────────────────────────────────────────────

function DevicePanel({
  deviceName, draftName, setDraftName, editingName, setEditingName, onSaveName,
  connected, devices, latency,
  clipSync, autoAccept, onClipSync, onAutoAccept,
  onClose,
}: {
  deviceName: string;
  draftName: string;
  setDraftName: (v: string) => void;
  editingName: boolean;
  setEditingName: (v: boolean) => void;
  onSaveName: () => void;
  connected: boolean;
  devices: { id: string; name: string; platform: string; latencyMs?: number }[];
  latency: number | null;
  clipSync: boolean;
  autoAccept: boolean;
  onClipSync: (v: boolean) => void;
  onAutoAccept: (v: boolean) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div ref={ref} style={{ ...panelStyle, minWidth: 240 }}>
      {/* Identity */}
      <div style={{ padding: "14px 14px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          {editingName ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSaveName(); if (e.key === "Escape") setEditingName(false); }}
              style={{
                flex: 1, background: "var(--surface-high)", border: "1px solid rgba(133,173,255,0.3)",
                borderRadius: 6, padding: "4px 8px", color: "var(--on-surface)",
                fontSize: 14, fontWeight: 600, fontFamily: "var(--font-ui)", outline: "none",
              }}
            />
          ) : (
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--on-surface)", flex: 1, fontFamily: "var(--font-display)" }}>
              {deviceName}
            </span>
          )}
          <button
            onClick={() => editingName ? onSaveName() : setEditingName(true)}
            style={{ fontSize: 11, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 600, padding: "2px 6px" }}
          >
            {editingName ? "Save" : "Edit"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "#22c55e" : "#ef4444", display: "inline-block", boxShadow: connected ? "0 0 5px rgba(34,197,94,0.6)" : "none" }} />
          <span style={{ fontSize: 11, color: "var(--on-surface-muted)" }}>
            {connected ? `Online · ${devices.length} device${devices.length !== 1 ? "s" : ""} connected` : "Offline"}
            {latency !== null && ` · ${latency}ms`}
          </span>
        </div>
      </div>

      <div style={divider} />

      {/* Toggles */}
      <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
        <PanelToggle label="Clipboard Sync" value={clipSync} onChange={onClipSync} />
        <PanelToggle label="Auto Accept" value={autoAccept} onChange={onAutoAccept} />
      </div>

      {/* Connected devices */}
      {devices.length > 0 && (
        <>
          <div style={divider} />
          <div style={{ padding: "8px 14px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "var(--on-surface-muted)", marginBottom: 8 }}>
              CONNECTED
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {devices.map((d) => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{deviceIcon(d.name, d.platform)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.name}
                    </div>
                  </div>
                  {d.latencyMs !== undefined && (
                    <span style={{ fontSize: 10, color: d.latencyMs < 20 ? "#22c55e" : d.latencyMs < 80 ? "var(--primary)" : "var(--error)", fontWeight: 600 }}>
                      {d.latencyMs}ms
                    </span>
                  )}
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", flexShrink: 0 }} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PanelToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 0", cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 12, color: value ? "var(--on-surface)" : "var(--on-surface-muted)", fontFamily: "var(--font-ui)" }}>
        {label}
      </span>
      <div style={{
        width: 36, height: 20, borderRadius: 10,
        background: value ? "var(--primary)" : "var(--surface-highest)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 2, left: value ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </div>
    </div>
  );
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 10px)",
  right: 0,
  zIndex: 300,
  background: "var(--surface-high)",
  borderRadius: 14,
  minWidth: 280,
  maxHeight: 480,
  overflowY: "auto",
  boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07)",
  animation: "toast-in 0.15s ease forwards",
};

const divider: React.CSSProperties = {
  height: 1,
  background: "rgba(255,255,255,0.05)",
  margin: "2px 0",
};

const iconBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--on-surface-variant)",
  borderRadius: 8,
  position: "relative",
  transition: "background 0.15s, color 0.15s",
};

// ─── Icons ───────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function DevicesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
