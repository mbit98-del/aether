import clipboard from "clipboardy";
import WebSocket from "ws";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { AetherMessage } from "@aether/types";

const SERVER_URL = process.env.AETHER_SERVER ?? "ws://localhost:3001";
const DEVICE_NAME = process.env.AETHER_NAME ?? os.hostname();
// For LAN use with self-signed certs (mkcert). Set AETHER_TLS_VERIFY=true to enforce cert validation.
const TLS_VERIFY = process.env.AETHER_TLS_VERIFY === "true";
const POLL_INTERVAL = 800;
const SAVE_DIR = path.join(os.homedir(), "Downloads", "aether-received");

// Stable device identity — generated once and persisted so trust survives reconnects.
const STABLE_ID_PATH = path.join(os.homedir(), ".aether-agent-id");
const STABLE_ID = (() => {
  try {
    const existing = fs.readFileSync(STABLE_ID_PATH, "utf8").trim();
    if (existing.length > 0) return existing;
  } catch { /* file doesn't exist yet */ }
  const id = randomUUID();
  fs.writeFileSync(STABLE_ID_PATH, id, "utf8");
  return id;
})();

fs.mkdirSync(SAVE_DIR, { recursive: true });

type IncomingTransfer = {
  name: string;
  mimeType: string;
  size: number;
  totalChunks: number;
  chunks: string[];
};

const incoming = new Map<string, IncomingTransfer>();

let ws: WebSocket;
let myDeviceId = "";          // set on welcome from server
let lastClipboard = "";       // last value we sent
let lastRemoteClipboard = ""; // last value received from network
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect() {
  console.log(`Connecting to ${SERVER_URL}...`);
  ws = new WebSocket(SERVER_URL, { rejectUnauthorized: TLS_VERIFY });

  ws.on("open", () => {
    console.log(`Connected — announcing as "${DEVICE_NAME}"`);
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

    ws.send(JSON.stringify({
      type: "hello",
      name: DEVICE_NAME,
      platform: "agent",
      from: "agent",
      stableId: STABLE_ID,
    } satisfies AetherMessage));
  });

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as AetherMessage;

      // ── Server handshake messages ──────────────────────────────────────────

      if (msg.type === "welcome") {
        myDeviceId = msg.deviceId;
        console.log(`[hello] server assigned device ID: ${myDeviceId.slice(0, 8)}...`);
        return;
      }

      if (msg.type === "devices") {
        // Informational — agent doesn't maintain a local device list yet
        return;
      }

      if (msg.type === "key-exchange") {
        // Web clients exchange ECDH keys for E2E encryption.
        // Agent doesn't participate in ECDH yet — silently acknowledge.
        return;
      }

      // ── Live messages ──────────────────────────────────────────────────────

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", from: myDeviceId || "agent" }));
        return;
      }

      if (msg.type === "clipboard") {
        lastRemoteClipboard = msg.data;
        lastClipboard = msg.data; // prevent poll from re-broadcasting what we're about to apply
        try {
          await clipboard.write(msg.data);
          console.log(`[clipboard] received and applied ${msg.data.length} chars`);
        } catch {
          console.log(`[clipboard] received ${msg.data.length} chars (could not write to clipboard)`);
        }
        return;
      }

      if (msg.type === "file-start") {
        incoming.set(msg.transferId, {
          name: msg.name,
          mimeType: msg.mimeType,
          size: msg.size,
          totalChunks: msg.totalChunks,
          chunks: [],
        });
        console.log(`[file] incoming "${msg.name}" (${formatBytes(msg.size)}, ${msg.totalChunks} chunks)`);
        return;
      }

      if (msg.type === "file-chunk") {
        const transfer = incoming.get(msg.transferId);
        if (transfer) transfer.chunks[msg.index] = msg.data;
        return;
      }

      if (msg.type === "file-end") {
        const transfer = incoming.get(msg.transferId);
        if (!transfer) return;
        incoming.delete(msg.transferId);

        // Verify all chunks arrived before writing
        const receivedCount = transfer.chunks.filter(Boolean).length;
        if (receivedCount !== transfer.totalChunks) {
          console.warn(`[!] Incomplete transfer "${transfer.name}": expected ${transfer.totalChunks} chunks, got ${receivedCount}. Discarding.`);
          return;
        }

        try {
          const combined = transfer.chunks.join("");
          const buffer = Buffer.from(combined, "base64");

          let savePath = path.join(SAVE_DIR, transfer.name);
          if (fs.existsSync(savePath)) {
            const ext = path.extname(transfer.name);
            const base = path.basename(transfer.name, ext);
            savePath = path.join(SAVE_DIR, `${base}-${Date.now()}${ext}`);
          }
          fs.writeFileSync(savePath, buffer);
          console.log(`[file] saved "${transfer.name}" → ${savePath}`);
        } catch (err) {
          console.error(`[!] Failed to save "${transfer.name}":`, err);
        }
        return;
      }

      // Legacy single-frame file
      if (msg.type === "file") {
        try {
          const buffer = Buffer.from(msg.data, "base64");
          let savePath = path.join(SAVE_DIR, msg.name);
          if (fs.existsSync(savePath)) {
            const ext = path.extname(msg.name);
            const base = path.basename(msg.name, ext);
            savePath = path.join(SAVE_DIR, `${base}-${Date.now()}${ext}`);
          }
          fs.writeFileSync(savePath, buffer);
          console.log(`[file] saved "${msg.name}" (legacy) → ${savePath}`);
        } catch (err) {
          console.error(`[!] Failed to save legacy file "${msg.name}":`, err);
        }
      }
    } catch (err) {
      console.error("Failed to handle message:", err);
    }
  });

  ws.on("close", () => {
    console.log("Disconnected. Reconnecting in 3s...");
    reconnectTimer = setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    console.error("WS error:", err.message);
  });
}

async function pollClipboard() {
  try {
    const current = await clipboard.read();
    if (current && current !== lastClipboard && current !== lastRemoteClipboard && ws.readyState === WebSocket.OPEN) {
      lastClipboard = current;
      ws.send(JSON.stringify({
        type: "clipboard",
        data: current,
        from: myDeviceId || "agent",
        timestamp: Date.now(),
      } satisfies AetherMessage));
      console.log(`[clipboard] sent ${current.length} chars`);
    }
  } catch {
    // clipboard may be empty or inaccessible
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

connect();
setInterval(pollClipboard, POLL_INTERVAL);
