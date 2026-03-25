import { useEffect, useRef } from "react";
import { useWs } from "../contexts/use-ws";
import { closeDevicePanel, useHighlightedDevice } from "../hooks/useDevicePanel";
import { useLatencyHistory } from "../hooks/useLatencyHistory";
import { DevicePanelCard } from "./DevicePanelCard";

export function DevicePanel() {
  const { devices: allDevices, myDeviceId, connected } = useWs();
  const devices = allDevices.filter((d) => d.id !== myDeviceId);
  const getLatencyHistory = useLatencyHistory(allDevices);
  const highlightedDevice = useHighlightedDevice();
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus + scroll to top on open
  useEffect(() => {
    panelRef.current?.focus();
    panelRef.current?.scrollTo({ top: 0 });
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeDevicePanel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setTimeout(closeDevicePanel, 120)}
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
          overflowY: "auto",
          animation: "slide-in-right 0.24s cubic-bezier(0.32, 0.72, 0, 1) forwards",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: "var(--surface-high)",
            zIndex: 1,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--on-surface)",
                fontFamily: "var(--font-display)",
              }}
            >
              Devices
            </div>
            <div style={{ fontSize: 11, color: "var(--on-surface-muted)", marginTop: 1 }}>
              {connected
                ? `${devices.length} device${devices.length !== 1 ? "s" : ""} on mesh`
                : "Offline"}
            </div>
          </div>
          <button
            onClick={() => setTimeout(closeDevicePanel, 120)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--on-surface-muted)",
              width: 28,
              height: 28,
              borderRadius: 8,
              fontSize: 14,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s ease, color 0.15s ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface-highest)";
              e.currentTarget.style.color = "var(--on-surface)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "var(--on-surface-muted)";
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Device list */}
        {devices.length === 0 ? (
          <div
            style={{
              padding: "24px 16px",
              fontSize: 12,
              color: "var(--on-surface-muted)",
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            {connected ? "No other devices connected." : "Not connected to server."}
          </div>
        ) : (
          devices.map((d, i) => (
            <DevicePanelCard
              key={d.stableId ?? d.id}
              device={d}
              latencyHistory={getLatencyHistory(d.stableId ?? d.id)}
              index={i}
              highlighted={highlightedDevice === d.id}
            />
          ))
        )}
      </div>
    </>
  );
}
