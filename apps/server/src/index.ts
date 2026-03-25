import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { networkInterfaces } from "node:os";
import type { AetherMessage, DeviceInfo, DevicesMessage } from "@aether/types";

function getLanIPs(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n): n is NonNullable<typeof n> => !!n && n.family === "IPv4" && !n.internal)
    .map((n) => n.address);
}

const app = Fastify({ logger: false });
const wss = new WebSocketServer({ port: 3001 });

// Native WS keepalive — prevents Vite proxy (and other intermediaries) from
// silently dropping idle connections. Uses protocol-level ping frames, not
// the app-level JSON ping which only travels over the data channel.
const HEARTBEAT_MS = 20_000;
type AliveWs = WebSocket & { isAlive: boolean; pingSentAt: number | null };

const heartbeatInterval = setInterval(() => {
  for (const [id, { ws }] of clients) {
    const sock = ws as AliveWs;
    if (!sock.isAlive) {
      const rtt = sock.pingSentAt !== null ? `${Date.now() - sock.pingSentAt}ms` : "unknown";
      console.warn(`[!] ${id.slice(0, 8)} missed pong (last ping ${rtt} ago) — terminating`);
      sock.terminate();
      continue;
    }
    sock.isAlive = false;
    sock.pingSentAt = Date.now();
    sock.ping();
  }
}, HEARTBEAT_MS);

wss.on("close", () => clearInterval(heartbeatInterval));

const clients = new Map<string, { ws: WebSocket; info: DeviceInfo }>();

function broadcastDevices() {
  const msg: DevicesMessage = {
    type: "devices",
    devices: [...clients.values()].map((c) => c.info),
  };
  const payload = JSON.stringify(msg);
  for (const { ws } of clients.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function broadcast(payload: string, excludeId: string) {
  for (const [id, { ws }] of clients) {
    if (id !== excludeId && ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

/** Route a message, stamping senderId so receivers know who sent it. */
function route(message: AetherMessage & { to?: string }, senderDeviceId: string) {
  const stamped = JSON.stringify({ ...message, senderId: senderDeviceId });
  const target = (message as { to?: string }).to;
  if (target) {
    const client = clients.get(target);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(stamped);
    } else {
      console.warn(`[!] Target device ${target} not found or offline`);
    }
  } else {
    broadcast(stamped, senderDeviceId);
  }
}

wss.on("connection", (ws) => {
  const sock = ws as AliveWs;
  sock.isAlive = true;
  sock.pingSentAt = Date.now();
  ws.ping(); // immediate ping so RTT is available on first broadcast

  const deviceId = uuidv4();
  const info: DeviceInfo = {
    id: deviceId,
    name: `device-${deviceId.slice(0, 6)}`,
    platform: "unknown",
    connectedAt: Date.now(),
  };

  ws.on("pong", () => {
    const sock = ws as AliveWs;
    sock.isAlive = true;
    if (sock.pingSentAt !== null) {
      const entry = clients.get(deviceId);
      if (entry) {
        entry.info.latencyMs = Date.now() - sock.pingSentAt;
        broadcastDevices();
      }
    }
  });

  clients.set(deviceId, { ws, info });
  console.log(`[+] ${info.name} connected (${clients.size} total)`);

  // Tell the client its own server-assigned UUID
  ws.send(JSON.stringify({ type: "welcome", deviceId, from: "server" }));
  broadcastDevices();

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as AetherMessage;

      if (message.type === "hello") {
        const entry = clients.get(deviceId);
        if (entry) {
          entry.info.name = message.name;
          entry.info.platform = message.platform;
          if (message.stableId) entry.info.stableId = message.stableId;
        }
        broadcastDevices();
        return;
      }

      if (message.type === "ping") {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "pong", from: "server" }));
        }
        return;
      }

      // All other messages are routed with senderId stamped
      route(message as AetherMessage & { to?: string }, deviceId);
    } catch {
      console.error("Invalid message received");
    }
  });

  ws.on("close", () => {
    clients.delete(deviceId);
    console.log(`[-] ${info.name} disconnected (${clients.size} total)`);
    broadcastDevices();
  });

  ws.on("error", (err) => {
    console.error(`[!] Error from ${info.name}:`, err.message);
    clients.delete(deviceId);
    broadcastDevices();
  });
});

app.get("/health", async () => ({
  ok: true,
  clients: clients.size,
  devices: [...clients.values()].map((c) => c.info),
}));

const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);

app.get("/info", async () => ({
  ips: getLanIPs(),
  wsPort: 3001,
  webPort: WEB_PORT,
}));

app.listen({ port: 3000, host: "0.0.0.0" }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log("HTTP  → http://localhost:3000");
  console.log("WS    → ws://localhost:3001");
});
