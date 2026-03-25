export type ActivityEvent = { id: number; icon: string; text: string; time: number };

let _evId = 0;
const _listeners = new Set<(e: ActivityEvent) => void>();

export function addActivity(icon: string, text: string) {
  const ev: ActivityEvent = { id: ++_evId, icon, text, time: Date.now() };
  _listeners.forEach((fn) => fn(ev));
}

export function subscribeActivity(handler: (e: ActivityEvent) => void): () => void {
  _listeners.add(handler);
  return () => _listeners.delete(handler);
}
