import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AetherMessage, DeviceInfo } from "@aether/types";
import { requestNotificationPermission } from "../lib/notify";
import {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedKey,
  type KeyPair,
} from "../lib/aether-crypto";
import { WsContext, type Listener } from "./use-ws";

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  (window.location.protocol === "https:"
    ? `wss://${window.location.host}/ws`
    : `ws://${window.location.hostname}:3001`);

export function WsProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [deviceName, setDeviceNameState] = useState(
    () => localStorage.getItem("aether-device-name") ?? "Web Browser"
  );
  const [latency, setLatency] = useState<number | null>(null);
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const listeners = useRef<Set<Listener>>(new Set());
  const deviceNameRef = useRef(deviceName);
  const pingSentAt = useRef<number | null>(null);
  const myDeviceIdRef = useRef<string | null>(null);

  // Crypto state — held in refs so we never re-render just for key material
  const keyPairRef = useRef<KeyPair | null>(null);
  const publicKeyB64Ref = useRef<string | null>(null);
  const sharedKeysRef = useRef<Map<string, CryptoKey>>(new Map());
  // Promise that resolves once the key pair is ready — prevents the 50ms race
  const keyPairReadyRef = useRef<Promise<void>>(Promise.resolve());
  // Track known peers so we can detect newcomers and re-broadcast our public key
  const knownPeerIdsRef = useRef<Set<string>>(new Set());

  // Keep ref in sync so WS callbacks always see the latest name without stale closure
  useEffect(() => { deviceNameRef.current = deviceName; }, [deviceName]);

  // Generate ECDH key pair once on mount
  useEffect(() => {
    keyPairReadyRef.current = generateKeyPair().then(async (kp) => {
      keyPairRef.current = kp;
      publicKeyB64Ref.current = await exportPublicKey(kp.publicKey);
    });
  }, []);

  // Re-broadcast our public key whenever a new peer joins so they can derive
  // the shared key even if they missed our initial key-exchange on connect.
  useEffect(() => {
    if (!myDeviceId) return;
    const peers = devices.filter((d) => d.id !== myDeviceId);
    const hasNew = peers.some((d) => !knownPeerIdsRef.current.has(d.id));
    knownPeerIdsRef.current = new Set(peers.map((d) => d.id));
    if (hasNew) void sendKeyExchange(); //Fix dette!
  }, [devices, myDeviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendKeyExchange() {
    await keyPairReadyRef.current; // wait however long key gen takes
    if (!publicKeyB64Ref.current || !myDeviceIdRef.current) return;
    if (ws.current?.readyState !== WebSocket.OPEN) return;
    ws.current.send(
      JSON.stringify({
        type: "key-exchange",
        from: myDeviceIdRef.current,
        publicKey: publicKeyB64Ref.current,
      })
    );
  }

  useEffect(() => {
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!alive) return;
      const socket = new WebSocket(WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        if (!alive) return;
        setConnected(true);
        // hello is sent after we receive the welcome (so we have myDeviceId)
      };

      socket.onmessage = async (e) => {
        try {
          const msg = JSON.parse(e.data) as AetherMessage;

          if (msg.type === "welcome") {
            myDeviceIdRef.current = msg.deviceId;
            setMyDeviceId(msg.deviceId);
            // Now send hello and key-exchange
            socket.send(
              JSON.stringify({
                type: "hello",
                name: deviceNameRef.current,
                platform: "web",
                from: msg.deviceId,
              })
            );
            // sendKeyExchange awaits key pair readiness internally
            sendKeyExchange();
            return;
          }

          if (msg.type === "devices") {
            // Deduplicate by stableId — keeps the most recently seen entry (lowest latency wins)
            const seen = new Map<string, typeof msg.devices[0]>();
            for (const d of msg.devices) {
              const key = d.stableId ?? d.id;
              const existing = seen.get(key);
              if (!existing || (d.latencyMs ?? Infinity) < (existing.latencyMs ?? Infinity)) {
                seen.set(key, d);
              }
            }
            setDevices([...seen.values()]);
            return;
          }

          if (msg.type === "pong" && pingSentAt.current !== null) {
            setLatency(Date.now() - pingSentAt.current);
            pingSentAt.current = null;
            return;
          }

          if (msg.type === "key-exchange") {
            const senderId = msg.senderId ?? msg.from;
            if (senderId && keyPairRef.current && msg.publicKey) {
              try {
                const remotePub = await importPublicKey(msg.publicKey);
                const shared = await deriveSharedKey(keyPairRef.current.privateKey, remotePub);
                sharedKeysRef.current.set(senderId, shared);
              } catch (err) {
                console.warn("[crypto] key-exchange failed:", err);
              }
            }
            return;
          }

          for (const fn of listeners.current) fn(msg);
        } catch {
          // ignore malformed
        }
      };

      socket.onclose = () => {
        if (!alive) return;
        setConnected(false);
        setLatency(null);
        myDeviceIdRef.current = null;
        setMyDeviceId(null);
        reconnectTimer = setTimeout(connect, 3000);
      };

      socket.onerror = () => socket.close();
    }

    requestNotificationPermission();
    connect();

    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        pingSentAt.current = Date.now();
        ws.current.send(JSON.stringify({ type: "ping", from: "web" }));
      }
    }, 5000);

    return () => {
      alive = false;
      clearInterval(pingInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.current?.close();
    };
  }, []);

  const send = useCallback((msg: AetherMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const setDeviceName = useCallback(
    (name: string) => {
      setDeviceNameState(name);
      localStorage.setItem("aether-device-name", name);
      deviceNameRef.current = name;
      send({ type: "hello", name, platform: "web", from: myDeviceIdRef.current ?? "web" });
    },
    [send]
  );

  const getSharedKey = useCallback((deviceId: string): CryptoKey | null => {
    return sharedKeysRef.current.get(deviceId) ?? null;
  }, []);

  return (
    <WsContext.Provider
      value={{ connected, devices, deviceName, latency, myDeviceId, setDeviceName, send, subscribe, getSharedKey }}
    >
      {children}
    </WsContext.Provider>
  );
}

