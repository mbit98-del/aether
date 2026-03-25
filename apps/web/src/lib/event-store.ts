import { addActivity } from "./activity-bus";
import type { MeshEvent, MeshEventKind } from "@aether/types";

const STORAGE_KEY = "aether-events";
const MAX_EVENTS = 500;

const _listeners = new Set<(e: MeshEvent) => void>();

export function getEvents(): MeshEvent[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function clearEvents(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function subscribeEvents(handler: (e: MeshEvent) => void): () => void {
  _listeners.add(handler);
  return () => _listeners.delete(handler);
}

export function emitMeshEvent(
  kind: MeshEventKind,
  opts?: {
    deviceId?: string;
    deviceName?: string;
    meta?: MeshEvent["meta"];
  }
): void {
  const event: MeshEvent = {
    id: crypto.randomUUID(),
    kind,
    timestamp: Date.now(),
    ...opts,
  };

  // Persist — skip if the last stored event is an identical (kind + transferId) duplicate
  const stored = getEvents();
  const last = stored[0];
  const isSameTransfer =
    event.meta?.transferId !== undefined &&
    last?.meta?.transferId === event.meta.transferId &&
    last?.kind === event.kind;
  if (isSameTransfer) return;
  stored.unshift(event);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored.slice(0, MAX_EVENTS)));

  // Notify event-store subscribers
  _listeners.forEach((fn) => fn(event));

  // Bridge to existing activity-bus so ActivityPanel + bell still work
  const { icon, text } = toActivityEntry(event);
  addActivity(icon, text);
}

/**
 * Human-readable label for a MeshEvent.
 * Pass `deviceName` to override the stored name (e.g. resolved live from the device list).
 */
export function formatEvent(e: MeshEvent, opts?: { deviceName?: string }): string {
  const fileName = e.meta?.fileName ?? "file";
  const device = opts?.deviceName ?? e.deviceName ?? "device";
  switch (e.kind) {
    case "file:receiving":  return `Receiving ${fileName}`;
    case "file:sent":       return `Sent ${fileName} to ${device}`;
    case "file:received":   return `Received ${fileName} from ${device}`;
    case "file:cancelled":
      return e.meta?.cancelledBy === "receiver"
        ? `Cancelled receiving ${fileName}`
        : `Cancelled sending ${fileName}`;
    case "clipboard:sent":     return `Clipboard synced to ${device}`;
    case "clipboard:received": return `Clipboard from ${device}`;
  }
}

function toActivityEntry(e: MeshEvent): { icon: string; text: string } {
  const fileName = e.meta?.fileName ?? "file";
  const device = e.deviceName ?? "device";
  switch (e.kind) {
    case "file:receiving":
      return { icon: "\u{1F4E5}", text: `Receiving ${fileName}` };
    case "file:sent":
      return { icon: "\u{1F4E4}", text: `Sent ${fileName}` };
    case "file:received":
      return { icon: "\u2713", text: `Received ${fileName}` };
    case "file:cancelled":
      return {
        icon: "\u2716",
        text:
          e.meta?.cancelledBy === "receiver"
            ? `Cancelled receiving ${fileName}`
            : `Cancelled sending ${fileName}`,
      };
    case "clipboard:sent":
      return { icon: "\u{1F4CB}", text: `Clipboard sent to ${device}` };
    case "clipboard:received":
      return { icon: "\u{1F4CB}", text: `Clipboard from ${device}` };
  }
}
