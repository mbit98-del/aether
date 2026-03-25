export type HistoryEntry = {
  id: string;
  name: string;
  size: number;
  direction: "SENT" | "RECEIVED";
  timestamp: number;
  from?: string;
};

const KEY = "aether-history";

export function getHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addHistory(entry: Omit<HistoryEntry, "id">): void {
  const history = getHistory();
  history.unshift({ ...entry, id: crypto.randomUUID() });
  localStorage.setItem(KEY, JSON.stringify(history.slice(0, 200)));
}

export function clearHistory(): void {
  localStorage.removeItem(KEY);
}
