import { createContext, useContext } from "react";
import type { AetherMessage, DeviceInfo } from "@aether/types";

export type Listener = (msg: AetherMessage) => void;

export type WsContextValue = {
  connected: boolean;
  devices: DeviceInfo[];
  deviceName: string;
  latency: number | null;
  myDeviceId: string | null;
  setDeviceName: (name: string) => void;
  send: (msg: AetherMessage) => void;
  subscribe: (fn: Listener) => () => void;
  getSharedKey: (deviceId: string) => CryptoKey | null;
};

export const WsContext = createContext<WsContextValue | null>(null);

export function useWs() {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWs must be used inside WsProvider");
  return ctx;
}
