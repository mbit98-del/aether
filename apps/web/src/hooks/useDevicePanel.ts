import { useEffect, useState } from "react";

let _open = false;
let _highlightId: string | null = null;
const _listeners = new Set<() => void>();
const _highlightListeners = new Set<() => void>();

function notify() { _listeners.forEach((fn) => fn()); }
function notifyHighlight() { _highlightListeners.forEach((fn) => fn()); }

export function openDevicePanel(deviceId?: string) {
  _open = true;
  _highlightId = deviceId ?? null;
  notify();
  notifyHighlight();
  if (deviceId) {
    setTimeout(() => {
      _highlightId = null;
      notifyHighlight();
    }, 2000);
  }
}

export function closeDevicePanel() {
  _open = false;
  _highlightId = null;
  notify();
  notifyHighlight();
}

/** Returns whether the panel is open. Re-renders on change. */
export function useDevicePanel(): boolean {
  const [open, setOpen] = useState(_open);
  useEffect(() => {
    const update = () => setOpen(_open);
    _listeners.add(update);
    return () => _listeners.delete(update);
  }, []);
  return open;
}

/** Returns the device ID to highlight, or null. Auto-clears after 2s. */
export function useHighlightedDevice(): string | null {
  const [id, setId] = useState(_highlightId);
  useEffect(() => {
    const update = () => setId(_highlightId);
    _highlightListeners.add(update);
    return () => _highlightListeners.delete(update);
  }, []);
  return id;
}
