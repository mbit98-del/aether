import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { ClipboardMessage, DeviceInfo } from "@aether/types";
import { useWs } from "../contexts/use-ws";
import { isTrusted, trustDevice, untrustDevice } from "../lib/trust-store";
import { useMeshEvents } from "../hooks/useMeshEvents";
import { formatEvent } from "../lib/event-store";
import { latencyTrend } from "../hooks/useLatencyHistory";
import { bridgeSendFiles } from "../lib/panel-bridge";

function platformIcon(name: string, platform: string): string {
  if (platform === "web") return "\u{1F310}";
  const n = name.toLowerCase();
  if (n.includes("iphone") || n.includes("ipad") || n.includes("android")) return "\u{1F4F1}";
  if (n.includes("mac") || n.includes(".local")) return "\u{1F4BB}";
  if (n.includes("windows") || n.includes("win")) return "\u{1F5A5}\uFE0F";
  return "\u{1F4BB}";
}

function latencyColor(ms: number): string {
  if (ms < 20) return "#22c55e";
  if (ms < 80) return "var(--primary)";
  return "var(--error)";
}

const CLIP_DEVICES_KEY = "aether-clip-devices";

function getClipEnabled(id: string): boolean {
  try { return JSON.parse(localStorage.getItem(CLIP_DEVICES_KEY) ?? "{}")[id] ?? true; }
  catch { return true; }
}

function setClipEnabled(id: string, v: boolean): void {
  try {
    const m = JSON.parse(localStorage.getItem(CLIP_DEVICES_KEY) ?? "{}");
    localStorage.setItem(CLIP_DEVICES_KEY, JSON.stringify({ ...m, [id]: v }));
  } catch { /* ignore */ }
}

export function DevicePanelCard({
  device,
  latencyHistory,
  index = 0,
  highlighted = false,
}: {
  device: DeviceInfo;
  latencyHistory: number[];
  index?: number;
  highlighted?: boolean;
}) {
  const { send, myDeviceId, connected } = useWs();
  const trustKey = device.stableId ?? device.id;
  const [trusted, setTrusted] = useState(() => isTrusted(trustKey));
  const [clipEnabled, setClipEnabledState] = useState(() => getClipEnabled(device.id));
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted) {
      cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [highlighted]);
  const recentEvents = useMeshEvents({ deviceId: device.id });
  const lastEvent = recentEvents[0];
  const trend = latencyTrend(latencyHistory);

  function handleSendClipboard() {
    if (!connected) return;
    navigator.clipboard
      .readText()
      .then((text) => {
        if (!text) return;
        send({
          type: "clipboard",
          data: text,
          from: myDeviceId ?? "web",
          to: device.id,
          timestamp: Date.now(),
        } satisfies ClipboardMessage);
        localStorage.setItem("aether-last-device", device.id);
      })
      .catch(() => {});
  }

  function handleSendFile() {
    if (!connected) return;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files.length) {
        bridgeSendFiles(files, device.id);
        localStorage.setItem("aether-last-device", device.id);
      }
    };
    input.click();
  }

  function handleClipToggle() {
    const next = !clipEnabled;
    setClipEnabled(device.id, next);
    setClipEnabledState(next);
  }

  function handleTrust() {
    trustDevice(trustKey);
    setTrusted(true);
  }

  function handleUntrust() {
    untrustDevice(trustKey);
    setTrusted(false);
  }

  return (
    <div
      ref={cardRef}
      className="device-card"
      style={{
        "--card-delay": `${index * 40}ms`,
        padding: "12px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "box-shadow 0.3s ease, background 0.3s ease",
        ...(highlighted && {
          background: "rgba(133,173,255,0.05)",
          boxShadow: "inset 0 0 0 1px rgba(133,173,255,0.25)",
        }),
      } as React.CSSProperties}
    >
      {/* Identity row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>
          {platformIcon(device.name, device.platform)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--on-surface)",
              fontFamily: "var(--font-display)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {device.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
            {device.latencyMs !== undefined && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: latencyColor(device.latencyMs),
                  fontFamily: "var(--font-ui)",
                  letterSpacing: "0.01em",
                }}
              >
                {device.latencyMs}ms
              </span>
            )}
            {trend === "improving" && (
              <span style={{ fontSize: 10, color: "#22c55e", lineHeight: 1 }} title="Latency improving">↓</span>
            )}
            {trend === "degrading" && (
              <span style={{ fontSize: 10, color: "var(--error)", lineHeight: 1 }} title="Latency degrading">↑</span>
            )}
            {trend === "stable" && (
              <span style={{ fontSize: 10, color: "var(--on-surface-muted)", lineHeight: 1 }} title="Latency stable">—</span>
            )}
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "var(--font-ui)",
                padding: "1px 6px",
                borderRadius: 4,
                background: trusted ? "rgba(133,173,255,0.12)" : "rgba(245,158,11,0.1)",
                color: trusted ? "var(--primary)" : "#f59e0b",
                letterSpacing: "0.02em",
              }}
            >
              {trusted ? "Trusted" : "Unknown"}
            </span>
          </div>
        </div>
      </div>

      {/* Last event */}
      {lastEvent && (
        <div
          style={{
            fontSize: 11,
            color: "var(--on-surface-variant)",
            fontFamily: "var(--font-ui)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {formatEvent(lastEvent, { deviceName: device.name })}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <ActionButton onClick={handleSendFile} disabled={!connected} label="Send File" />
        <ActionButton onClick={handleSendClipboard} disabled={!connected} label="Send Clipboard" />
        {trusted ? (
          <ActionButton onClick={handleUntrust} label="Revoke" danger />
        ) : (
          <ActionButton onClick={handleTrust} label="Trust" />
        )}
      </div>

      {/* Clipboard sync toggle */}
      <div
        onClick={handleClipToggle}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", paddingTop: 2 }}
      >
        <span style={{ fontSize: 11, color: clipEnabled ? "var(--on-surface-variant)" : "var(--on-surface-muted)", fontFamily: "var(--font-ui)" }}>
          Clipboard sync
        </span>
        <div style={{ width: 28, height: 16, borderRadius: 8, background: clipEnabled ? "var(--primary)" : "var(--surface-highest)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: 2, left: clipEnabled ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  disabled,
  danger,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="action-btn"
      style={{
        height: 26,
        padding: "0 10px",
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "var(--surface-highest, var(--surface-low))",
        color: danger
          ? "var(--error)"
          : disabled
          ? "var(--on-surface-muted)"
          : "var(--on-surface-variant)",
        fontSize: 11,
        fontFamily: "var(--font-ui)",
        fontWeight: 500,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {label}
    </button>
  );
}
