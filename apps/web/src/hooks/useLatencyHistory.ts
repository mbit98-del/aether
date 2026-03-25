import { useCallback, useEffect, useRef } from "react";
import type { DeviceInfo } from "@aether/types";

/**
 * Tracks the last 5 latency samples per device (keyed by stableId ?? id).
 * Returns a stable getter function — call it with the device key to read the history.
 */
export function useLatencyHistory(devices: DeviceInfo[]): (key: string) => number[] {
  const historyRef = useRef<Map<string, number[]>>(new Map());

  useEffect(() => {
    for (const d of devices) {
      if (d.latencyMs === undefined) continue;
      const key = d.stableId ?? d.id;
      const prev = historyRef.current.get(key) ?? [];
      historyRef.current.set(key, [...prev, d.latencyMs].slice(-5));
    }
  }, [devices]);

  return useCallback((key: string) => historyRef.current.get(key) ?? [], []);
}

/** Derives a latency trend from a sample window. */
export function latencyTrend(history: number[]): "improving" | "degrading" | "stable" | null {
  if (history.length < 3) return null;
  const diff = history[history.length - 1] - history[0];
  if (Math.abs(diff) < 5) return "stable";
  return diff < 0 ? "improving" : "degrading";
}
