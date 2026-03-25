const KEY = "aether-trusted-devices";

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function save(set: Set<string>) {
  localStorage.setItem(KEY, JSON.stringify([...set]));
}

export function getTrustedDevices(): Set<string> {
  return load();
}

export function isTrusted(deviceId: string): boolean {
  return load().has(deviceId);
}

export function trustDevice(deviceId: string): void {
  const trusted = load();
  trusted.add(deviceId);
  save(trusted);
}

export function untrustDevice(deviceId: string): void {
  const trusted = load();
  trusted.delete(deviceId);
  save(trusted);
}
