// ─── Device ────────────────────────────────────────────────────────────────────

export type DeviceInfo = {
  id: string;        // ephemeral server-assigned UUID for this session
  stableId?: string; // persistent cross-session device identity (set by agent)
  name: string;
  platform: "web" | "agent" | "unknown";
  connectedAt: number;
  latencyMs?: number;
};

// ─── Messages ──────────────────────────────────────────────────────────────────

export type ClipboardMessage = {
  type: "clipboard";
  data: string;
  from: string;
  timestamp: number;
  to?: string;      // target device ID — omit to broadcast to all
  senderId?: string; // stamped by server on relay
};

/** Sent by the server immediately on connect so the client knows its own UUID. */
export type WelcomeMessage = {
  type: "welcome";
  deviceId: string;
  from: "server";
};

/** Sent by a client immediately on connect to announce itself. */
export type HelloMessage = {
  type: "hello";
  name: string;
  platform: DeviceInfo["platform"];
  from: string;
  stableId?: string; // persistent cross-session identity
};

/** Sent by the server to all clients whenever the device list changes. */
export type DevicesMessage = {
  type: "devices";
  devices: DeviceInfo[];
};

/** ECDH public key exchange — sent after hello so peers can derive a shared AES key. */
export type KeyExchangeMessage = {
  type: "key-exchange";
  from: string;        // sender's deviceId (server-assigned UUID)
  publicKey: string;   // base64-encoded SPKI public key
  senderId?: string;   // stamped by server on relay
};

// ─── File transfer (chunked) ───────────────────────────────────────────────────

export type FileStartMessage = {
  type: "file-start";
  transferId: string;
  name: string;
  mimeType: string;
  size: number;        // total bytes
  totalChunks: number;
  from: string;
  to?: string;         // target device ID — omit to broadcast to all
  timestamp: number;
  senderId?: string;   // stamped by server on relay
  encrypted?: boolean; // true when chunks are AES-GCM encrypted
};

export type FileChunkMessage = {
  type: "file-chunk";
  transferId: string;
  index: number;       // 0-based
  data: string;        // base64 (ciphertext when encrypted)
  from: string;
  to?: string;
  senderId?: string;   // stamped by server on relay
  iv?: string;         // base64 AES-GCM IV — present when encrypted
};

export type FileEndMessage = {
  type: "file-end";
  transferId: string;
  from: string;
  to?: string;
  senderId?: string;   // stamped by server on relay
};

// ─── Legacy single-frame file (kept for agent compat, deprecated) ──────────────

export type FileMessage = {
  type: "file";
  name: string;
  mimeType: string;
  size: number;
  data: string; // base64
  from: string;
  timestamp: number;
};

/** Sent by either side to abort an in-progress chunked transfer. */
export type FileCancelMessage = {
  type: "file-cancel";
  transferId: string;
  from: string;
  to?: string;             // mirrors the to field of the original file-start
  senderId?: string;       // stamped by server on relay
  cancelledBy?: "sender" | "receiver"; // who initiated the cancel
};

export type PingMessage = { type: "ping"; from: string };
export type PongMessage = { type: "pong"; from: string };

// ─── Mesh Events (client-side only, persisted to localStorage) ────────────────

export type MeshEventKind =
  | "file:receiving"
  | "file:sent"
  | "file:received"
  | "file:cancelled"
  | "clipboard:sent"
  | "clipboard:received";

export type MeshEvent = {
  id: string;
  kind: MeshEventKind;
  timestamp: number;
  deviceId?: string;
  deviceName?: string;
  meta?: {
    transferId?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    cancelledBy?: "sender" | "receiver";
    clipboardPreview?: string;
  };
};

export type AetherMessage =
  | ClipboardMessage
  | WelcomeMessage
  | HelloMessage
  | DevicesMessage
  | KeyExchangeMessage
  | FileStartMessage
  | FileChunkMessage
  | FileEndMessage
  | FileCancelMessage
  | FileMessage
  | PingMessage
  | PongMessage;
