/**
 * Thin bridge so DevicePanel can trigger file sends via Dashboard's
 * existing sendFiles logic without duplicating chunk/encrypt code.
 * Dashboard registers itself on mount; the bridge is a no-op if Dashboard is unmounted.
 */
type FileSender = (files: File[], deviceId?: string) => void;

let _sender: FileSender | null = null;

export function registerFileSender(fn: FileSender): () => void {
  _sender = fn;
  return () => {
    _sender = null;
  };
}

export function bridgeSendFiles(files: File[], deviceId?: string): void {
  _sender?.(files, deviceId);
}
