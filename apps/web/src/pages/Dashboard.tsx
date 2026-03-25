import { useCallback, useEffect, useRef, useState } from "react";
import { TransferModal } from "../components/TransferModal";
import { ApprovalModal } from "../components/ApprovalModal";
import { FilePreviewModal } from "../components/FilePreviewModal";
import { useWs } from "../contexts/use-ws";
import { addHistory, getHistory } from "../lib/history-store";
import type { HistoryEntry } from "../lib/history-store";
import { notify } from "../lib/notify";
import { isTrusted, trustDevice } from "../lib/trust-store";
import { encryptChunk, decryptChunk } from "../lib/aether-crypto";
import { useWindowWidth } from "../hooks/useWindowWidth";
import { toast } from "../components/Toast";
import { emitMeshEvent } from "../lib/event-store";
import { registerFileSender } from "../lib/panel-bridge";
import { useLatencyHistory } from "../hooks/useLatencyHistory";
import { DevicePicker } from "../components/DevicePicker";
import type { AetherMessage, ClipboardMessage, FileCancelMessage, FileChunkMessage, FileEndMessage, FileStartMessage } from "@aether/types";

const CHUNK_SIZE = 512 * 1024; // 512 KB

type ActiveTransfer = {
  transferId: string;
  fileName: string;
  totalBytes: number;
  sentBytes: number;
  bytesPerSec: number;
  targetCount: number;
  fileIndex: number;
  totalFiles: number;
  to?: string; // target device ID — undefined means broadcast
};

type ReceivedFile = {
  id: string;
  name: string;
  url: string;
  size: number;
};

type IncomingTransfer = {
  name: string;
  mimeType: string;
  size: number;
  totalChunks: number;
  chunks: Array<{ data: string; iv?: string }>;
  from: string;
  senderId: string;
  encrypted: boolean;
};

type PendingApproval = {
  deviceId: string;   // server-assigned UUID (senderId)
  trustId: string;    // stableId if available, else deviceId — used for trust store
  deviceName: string;
  transferId: string;
  buffered: AetherMessage[];
};

type PendingPreview = {
  name: string;
  size: number;
  mimeType: string;
  url: string;
  senderId: string;
  encrypted: boolean;
  trusted: boolean;
};

export function Dashboard() {
  const { connected, devices: allDevices, latency, myDeviceId, send, subscribe, getSharedKey } = useWs();
  const devices = allDevices.filter((d) => d.id !== myDeviceId);
  const mobile = useWindowWidth() < 768;

  const [dragging, setDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<string | "all" | null>(null);
  const dragCountRef = useRef(0);
  const [activeTransfer, setActiveTransfer] = useState<ActiveTransfer | null>(null);
  const [received, setReceived] = useState<ReceivedFile[]>([]);
  const [recentTransfers, setRecentTransfers] = useState<HistoryEntry[]>(() => getHistory().slice(0, 3));

  const cancelRef = useRef(false);
  const myDeviceIdRef = useRef(myDeviceId);
  const activeTransferIdRef = useRef<string | null>(null);
  const incomingRef = useRef<Map<string, IncomingTransfer>>(new Map());
  const pendingApprovalsRef = useRef<Map<string, PendingApproval>>(new Map());
  const rejectedRef = useRef<Set<string>>(new Set());
  const [approvalQueue, setApprovalQueue] = useState<PendingApproval[]>([]);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);

  useEffect(() => { myDeviceIdRef.current = myDeviceId; }, [myDeviceId]);

  // Latency history — last 5 samples per device (keyed by stableId ?? id)
  const getLatencyHistory = useLatencyHistory(devices);

  const [receivingProgress, setReceivingProgress] = useState<
    Map<string, { name: string; received: number; total: number; senderId: string }>
  >(new Map());

  const assembleAndDownloadRef = useRef<(t: IncomingTransfer) => void>(() => {});

  async function assembleAndDownload(transfer: IncomingTransfer) {
    try {
      let chunkData: string[];

      if (transfer.encrypted) {
        const key = getSharedKey(transfer.senderId);
        if (!key) {
          console.error("[crypto] No shared key for encrypted transfer from", transfer.senderId);
          notify("Transfer failed", `No encryption key for ${transfer.name} — key exchange may not have completed.`);
          return;
        }
        chunkData = await Promise.all(
          transfer.chunks.map((c) =>
            c.iv ? decryptChunk(key, c.iv, c.data) : Promise.resolve(c.data)
          )
        );
      } else {
        chunkData = transfer.chunks.map((c) => c.data);
      }

      // Decode each chunk independently to avoid base64 padding corruption.
      // Joining padded base64 strings (e.g. "AAAA==BBBB") causes atob() to stop
      // at the first '=' in the middle, truncating the file.
      const buffers = chunkData.map((b64) => {
        const binary = atob(b64);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        return arr;
      });
      const blob = new Blob(buffers, { type: transfer.mimeType });
      const url = URL.createObjectURL(blob);

      setReceived((prev) => [
        { id: crypto.randomUUID(), name: transfer.name, url, size: transfer.size },
        ...prev,
      ]);

      addHistory({
        name: transfer.name,
        size: transfer.size,
        direction: "RECEIVED",
        timestamp: Date.now(),
        from: transfer.from,
      });
      emitMeshEvent("file:received", {
        deviceId: transfer.senderId,
        meta: { fileName: transfer.name, fileSize: transfer.size, mimeType: transfer.mimeType },
      });
      setRecentTransfers(getHistory().slice(0, 3));
      notify(
        `File received: ${transfer.name}`,
        `${formatBytes(transfer.size)} from ${transfer.from}${transfer.encrypted ? " (encrypted)" : ""}`
      );

      setPendingPreview({
        name: transfer.name,
        size: transfer.size,
        mimeType: transfer.mimeType,
        url,
        senderId: transfer.senderId,
        encrypted: transfer.encrypted,
        trusted: isTrusted(transfer.senderId),
      });
    } catch (err) {
      console.error("[transfer] assembly/decryption failed:", err);
      notify("Transfer failed", `Could not assemble ${transfer.name}`);
    }
  }

  useEffect(() => {
    assembleAndDownloadRef.current = assembleAndDownload;
  }, [getSharedKey, send]);

  // Process a file message that has passed the trust gate
  const processFileMsg = useCallback((msg: AetherMessage) => {
    if (msg.type === "file-start") {
      const senderId = msg.senderId ?? msg.from;
      incomingRef.current.set(msg.transferId, {
        name: msg.name,
        mimeType: msg.mimeType,
        size: msg.size,
        totalChunks: msg.totalChunks,
        chunks: [],
        from: msg.from,
        senderId,
        encrypted: msg.encrypted ?? false,
      });
      setReceivingProgress((prev) => {
        const next = new Map(prev);
        next.set(msg.transferId, { name: msg.name, received: 0, total: msg.totalChunks, senderId });
        return next;
      });
      return;
    }

    if (msg.type === "file-chunk") {
      const transfer = incomingRef.current.get(msg.transferId);
      if (transfer) {
        transfer.chunks[msg.index] = { data: msg.data, iv: msg.iv };
        setReceivingProgress((prev) => {
          const entry = prev.get(msg.transferId);
          if (!entry) return prev;
          const next = new Map(prev);
          next.set(msg.transferId, { ...entry, received: msg.index + 1 });
          return next;
        });
      }
      return;
    }

    if (msg.type === "file-end") {
      // Guard: if the transfer was already removed (cancelled), drop this silently
      if (!incomingRef.current.has(msg.transferId)) return;
      const transfer = incomingRef.current.get(msg.transferId)!;
      incomingRef.current.delete(msg.transferId);
      setReceivingProgress((prev) => {
        const next = new Map(prev);
        next.delete(msg.transferId);
        return next;
      });
      void assembleAndDownloadRef.current(transfer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return subscribe((msg: AetherMessage) => {
      if (msg.type === "file-start") {
        const senderId = msg.senderId ?? msg.from;
        // Prefer stableId for trust lookups so trust survives agent reconnects
        const senderDevice = allDevices.find((d) => d.id === senderId);
        const trustId = senderDevice?.stableId ?? senderId;
        const autoAccept: boolean = (() => { try { return JSON.parse(localStorage.getItem("aether-settings") ?? "{}").autoAccept ?? true; } catch { return true; } })();
        if (!isTrusted(trustId) || !autoAccept) {
          // Look up device name for the approval prompt (use filtered devices, senderDevice already found above)
          const deviceName = senderDevice?.name ?? msg.from;
          const approval: PendingApproval = {
            deviceId: senderId,
            trustId,
            deviceName,
            transferId: msg.transferId,
            buffered: [msg],
          };
          pendingApprovalsRef.current.set(msg.transferId, approval);
          setApprovalQueue((q) => [...q, approval]);
          return;
        }
        processFileMsg(msg);
        return;
      }

      if (msg.type === "file-chunk" || msg.type === "file-end") {
        const transferId = (msg as FileChunkMessage | FileEndMessage).transferId;
        if (rejectedRef.current.has(transferId)) return;
        const pending = pendingApprovalsRef.current.get(transferId);
        if (pending) {
          pending.buffered.push(msg);
          return;
        }
        processFileMsg(msg);
        return;
      }

      if (msg.type === "file-cancel") {
        const { transferId } = msg;
        const cancelSender = msg.senderId ?? msg.from;

        // If the cancel came from a remote device and matches our active outgoing transfer,
        // the receiver aborted — stop the chunk loop and clear state.
        if (cancelSender !== myDeviceIdRef.current && activeTransferIdRef.current === transferId) {
          cancelRef.current = true;
          activeTransferIdRef.current = null;
          const cancellerName =
            allDevices.find((d) => d.id === cancelSender || d.stableId === cancelSender)?.name
            ?? "remote device";
          // Only toast here — activity is owned by the side that initiated the cancel
          setTimeout(() => setActiveTransfer(null), 400);
          toast(`Cancelled by ${cancellerName}`, "error");
        }

        // Receiver-side cleanup (no-ops if this device isn't receiving that transfer)
        incomingRef.current.delete(transferId);
        rejectedRef.current.delete(transferId);
        pendingApprovalsRef.current.delete(transferId);
        setReceivingProgress((prev) => {
          if (!prev.has(transferId)) return prev;
          const next = new Map(prev);
          next.delete(transferId);
          return next;
        });
        setApprovalQueue((q) => q.filter((a) => a.transferId !== transferId));
        return;
      }

      if (msg.type === "file") {
        // Legacy single-frame (agent compat) — always from trusted local agent
        assembleAndDownload({
          name: msg.name,
          mimeType: msg.mimeType,
          size: msg.size,
          totalChunks: 1,
          chunks: [{ data: msg.data }],
          from: msg.from,
          senderId: msg.from,
          encrypted: false,
        });
      }
    });
  }, [subscribe, devices, processFileMsg]);

  function handleApprove(approval: PendingApproval) {
    trustDevice(approval.trustId);
    pendingApprovalsRef.current.delete(approval.transferId);
    setApprovalQueue((q) => q.filter((a) => a.transferId !== approval.transferId));
    for (const msg of approval.buffered) {
      processFileMsg(msg);
    }
  }

  function handleAllowOnce(approval: PendingApproval) {
    pendingApprovalsRef.current.delete(approval.transferId);
    setApprovalQueue((q) => q.filter((a) => a.transferId !== approval.transferId));
    for (const msg of approval.buffered) {
      processFileMsg(msg);
    }
  }

  function handleReject(approval: PendingApproval) {
    rejectedRef.current.add(approval.transferId);
    pendingApprovalsRef.current.delete(approval.transferId);
    setApprovalQueue((q) => q.filter((a) => a.transferId !== approval.transferId));
  }

  async function sendFile(file: File, targetId?: string, fileIndex = 1, totalFiles = 1) {
    const targetCount = targetId ? 1 : devices.length;
    const transferId = crypto.randomUUID();
    activeTransferIdRef.current = transferId;
    setActiveTransfer({ transferId, fileName: file.name, totalBytes: file.size, sentBytes: 0, bytesPerSec: 0, targetCount, fileIndex, totalFiles, to: targetId });

    const buffer = await file.arrayBuffer();
    const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE) || 1;

    // Determine if we can encrypt (only for targeted sends with a shared key)
    const sharedKey = targetId ? getSharedKey(targetId) : null;
    const willEncrypt = !!sharedKey;

    send({
      type: "file-start",
      transferId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      totalChunks,
      from: myDeviceId ?? "web",
      ...(targetId ? { to: targetId } : {}),
      timestamp: Date.now(),
      ...(willEncrypt ? { encrypted: true } : {}),
    } satisfies FileStartMessage);

    const speedWindow: Array<{ bytes: number; ms: number }> = [];

    for (let i = 0; i < totalChunks; i++) {
      if (cancelRef.current) return;

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, buffer.byteLength);
      const bytes = new Uint8Array(buffer.slice(start, end));

      let chunkMsg: FileChunkMessage;

      if (willEncrypt && sharedKey) {
        const { iv, data } = await encryptChunk(sharedKey, bytes);
        chunkMsg = {
          type: "file-chunk",
          transferId,
          index: i,
          data,
          iv,
          from: myDeviceId ?? "web",
          ...(targetId ? { to: targetId } : {}),
        };
      } else {
        let binary = "";
        for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
        chunkMsg = {
          type: "file-chunk",
          transferId,
          index: i,
          data: btoa(binary),
          from: myDeviceId ?? "web",
          ...(targetId ? { to: targetId } : {}),
        };
      }

      send(chunkMsg);

      speedWindow.push({ bytes: bytes.length, ms: Date.now() });
      if (speedWindow.length > 8) speedWindow.shift();
      let bytesPerSec = 0;
      if (speedWindow.length >= 2) {
        const windowMs = speedWindow[speedWindow.length - 1].ms - speedWindow[0].ms;
        const windowBytes = speedWindow.slice(1).reduce((s, c) => s + c.bytes, 0);
        if (windowMs > 0) bytesPerSec = (windowBytes / windowMs) * 1000;
      }

      setActiveTransfer((t) => t ? { ...t, sentBytes: Math.min(end, file.size), bytesPerSec } : null);
      await new Promise((r) => setTimeout(r, 0));
    }

    if (cancelRef.current) return;

    send({
      type: "file-end",
      transferId,
      from: myDeviceId ?? "web",
      ...(targetId ? { to: targetId } : {}),
    } satisfies FileEndMessage);

    addHistory({ name: file.name, size: file.size, direction: "SENT", timestamp: Date.now() });
    emitMeshEvent("file:sent", {
      deviceId: targetId,
      meta: { transferId, fileName: file.name, fileSize: file.size, mimeType: file.type || "application/octet-stream" },
    });
    setRecentTransfers(getHistory().slice(0, 3));
    activeTransferIdRef.current = null;
  }

  async function sendFiles(files: File[], targetId?: string) {
    cancelRef.current = false;
    for (let i = 0; i < files.length; i++) {
      if (cancelRef.current) break;
      await sendFile(files[i], targetId, i + 1, files.length);
    }
    activeTransferIdRef.current = null;
    if (!cancelRef.current) setTimeout(() => setActiveTransfer(null), 1200);
  }

  const handleZoneDragEnter = useCallback(() => {
    dragCountRef.current++;
    setDragging(true);
  }, []);

  const handleZoneDragLeave = useCallback(() => {
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setDragging(false);
      setDragTarget(null);
    }
  }, []);

  const sendFilesRef = useRef(sendFiles);
  useEffect(() => { sendFilesRef.current = sendFiles; }, [sendFiles]);
  useEffect(() => registerFileSender((files, deviceId) => sendFilesRef.current(files, deviceId)), []);

  const handleDrop = useCallback((e: React.DragEvent, targetId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current = 0;
    setDragging(false);
    setDragTarget(null);
    const files = Array.from(e.dataTransfer.files);
    if (files.length && connected) {
      const last = localStorage.getItem("aether-last-device");
      const valid = devices.find((d) => d.id === last);
      const resolved = targetId ?? valid?.id ?? undefined;
      void sendFilesRef.current(files, resolved);
    }
  }, [connected, devices]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingTargetRef = useRef<string | undefined>(undefined);

  function handleFileInput(targetId?: string) {
    if (!connected) return;
    pendingTargetRef.current = targetId;
    // Skip programmatic click under automation (Playwright sets navigator.webdriver).
    // Tests provide files via setInputFiles on [data-testid="file-input"] directly.
    if (!navigator.webdriver) {
      fileInputRef.current?.click();
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) {
      const last = localStorage.getItem("aether-last-device");
      const valid = devices.find((d) => d.id === last);
      const resolved = pendingTargetRef.current ?? valid?.id ?? undefined;
      sendFiles(files, resolved);
    }
  }

  const currentApproval = approvalQueue[0] ?? null;

  const [clipSent, setClipSent] = useState(false);
  const [sendPickerOpen, setSendPickerOpen] = useState(false);
  const [qaPickerOpen, setQaPickerOpen] = useState(false);

  async function sendClipboard() {
    if (!connected) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      send({ type: "clipboard", data: text, from: "web", timestamp: Date.now() } as ClipboardMessage);
      const names = devices.map((d) => d.name);
      const label = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} + ${names[1]}` : `${names[0]} + ${names.length - 1} more`;
      toast(`Sent to ${label}`, "✓");
      setClipSent(true);
      setTimeout(() => setClipSent(false), 2000);
    } catch {
      toast("Clipboard permission denied", "✗");
    }
  }

  const lastSent = recentTransfers.find((t) => t.direction === "SENT") ?? null;

  return (
    <div style={{ padding: mobile ? "24px 16px" : "48px 40px", maxWidth: 1400, margin: "0 auto" }}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        data-testid="file-input"
        style={{ position: "fixed", top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        onChange={handleFileInputChange}
      />
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 340px", gap: 32 }}>
        {/* Left column */}
        <div>
          {/* Hero */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--primary)", marginBottom: 12 }}>
              FILE TRANSFER
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: mobile ? 36 : 56,
                lineHeight: 1.05,
                letterSpacing: "-2px",
                color: "var(--on-surface)",
                marginBottom: 12,
              }}
            >
              Fast. Silent.{" "}
              <span style={{ color: "var(--primary)" }}>Precise.</span>
            </h1>
            <p style={{ fontSize: 15, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
              Encrypted point-to-point file transfer across your local infrastructure.
            </p>
          </div>

          {/* Connection status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
              padding: "8px 16px",
              background: "var(--surface-low)",
              borderRadius: 10,
              width: "fit-content",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: connected ? "#22c55e" : "#ef4444",
                display: "inline-block",
                boxShadow: connected ? "0 0 6px rgba(34,197,94,0.7)" : "none",
                transition: "background 0.3s",
              }}
            />
            <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
              {connected
                ? `Server connected — ${devices.length} node${devices.length !== 1 ? "s" : ""} online`
                : "Connecting to server..."}
            </span>
          </div>

          {/* Drop zone */}
          <div
            onDragEnter={handleZoneDragEnter}
            onDragLeave={handleZoneDragLeave}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e)}
            onClick={() => !dragging && handleFileInput()}
            style={{
              borderRadius: 24,
              background: dragging ? "rgba(133,173,255,0.06)" : "var(--surface-low)",
              border: `2px dashed ${dragging ? "var(--primary)" : "rgba(255,255,255,0.06)"}`,
              minHeight: 280,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              cursor: connected ? (dragging ? "copy" : "pointer") : "not-allowed",
              transition: "all 0.2s",
              marginBottom: 40,
              opacity: connected ? 1 : 0.5,
              padding: dragging && devices.length > 0 ? 28 : 0,
            }}
          >
            {dragging && devices.length > 0 ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", color: "var(--on-surface-muted)" }}>
                  DROP ON A DEVICE
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", width: "100%" }}>
                  {devices.map((device) => (
                    <div
                      key={device.id}
                      onDragEnter={() => setDragTarget(device.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, device.id)}
                      style={{
                        flex: "1 1 120px",
                        maxWidth: 160,
                        padding: "20px 16px",
                        borderRadius: 18,
                        background: dragTarget === device.id
                          ? "rgba(133,173,255,0.22)"
                          : "rgba(133,173,255,0.07)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 10,
                        transition: "all 0.15s",
                        cursor: "copy",
                        boxShadow: dragTarget === device.id
                          ? "0 0 0 2px var(--primary)"
                          : "none",
                      }}
                    >
                      <DeviceIconBox />
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: dragTarget === device.id ? "var(--primary)" : "var(--on-surface)", marginBottom: 2 }}>
                          {device.name}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--on-surface-muted)", letterSpacing: "0.06em" }}>
                          {device.platform.toUpperCase()}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div
                    onDragEnter={() => setDragTarget("all")}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e)}
                    style={{
                      flex: "1 1 120px",
                      maxWidth: 160,
                      padding: "20px 16px",
                      borderRadius: 18,
                      background: dragTarget === "all"
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(255,255,255,0.04)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                      transition: "all 0.15s",
                      cursor: "copy",
                      boxShadow: dragTarget === "all"
                        ? "0 0 0 2px rgba(255,255,255,0.3)"
                        : "none",
                    }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-highest)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 18 }}>⊕</span>
                    </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: dragTarget === "all" ? "var(--on-surface)" : "var(--on-surface-muted)", marginBottom: 2 }}>
                          All devices
                        </div>
                        <div style={{ fontSize: 10, color: "var(--on-surface-muted)", letterSpacing: "0.06em" }}>
                          SEND TO ALL
                        </div>
                      </div>
                    </div>
                  </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: dragging ? "rgba(133,173,255,0.15)" : "var(--surface-high)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background 0.2s",
                  }}
                >
                  <UploadIcon active={dragging} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      fontSize: 18,
                      color: "var(--on-surface)",
                      marginBottom: 6,
                    }}
                  >
                    {dragging ? "Release to send" : "Drop files to send"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--on-surface-muted)", letterSpacing: "0.08em" }}>
                    OR CLICK TO BROWSE LOCAL STORAGE
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Received files */}
          {received.length > 0 && (
            <div style={{ marginBottom: 40 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  color: "var(--on-surface-muted)",
                  marginBottom: 12,
                }}
              >
                RECEIVED
              </div>
              {received.map((f) => (
                <a
                  key={f.id}
                  href={f.url}
                  download={f.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    background: "var(--surface-low)",
                    borderRadius: 12,
                    textDecoration: "none",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "rgba(133,173,255,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FileIcon />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--on-surface)" }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: "var(--on-surface-muted)" }}>{formatBytes(f.size)}</div>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--primary)", fontWeight: 600 }}>↓ Download</span>
                </a>
              ))}
            </div>
          )}

          {/* Nearby Devices */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 20,
                    color: "var(--on-surface)",
                  }}
                >
                  Nearby Devices
                </h2>
                {devices.length > 0 && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#22c55e",
                      display: "inline-block",
                      boxShadow: "0 0 8px rgba(34,197,94,0.6)",
                    }}
                  />
                )}
              </div>
              <span style={{ fontSize: 11, color: "var(--on-surface-muted)", letterSpacing: "0.08em" }}>
                {devices.length} NODE{devices.length !== 1 ? "S" : ""} DETECTED
              </span>
            </div>

            {devices.length === 0 ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  background: "var(--surface-low)",
                  borderRadius: 20,
                  color: "var(--on-surface-muted)",
                  fontSize: 13,
                }}
              >
                {connected ? "No other devices detected. Run the agent on another device." : "Waiting for server connection..."}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                {devices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    encrypted={!!getSharedKey(device.id)}
                    trusted={isTrusted(device.id)}
                    latencyHistory={getLatencyHistory(device.stableId ?? device.id)}
                    isDragTarget={dragging && dragTarget === device.id}
                    onSend={() => handleFileInput(device.id)}
                    onDragEnter={() => setDragTarget(device.id)}
                    onDragOver={(e: React.DragEvent) => e.preventDefault()}
                    onDrop={(e: React.DragEvent) => handleDrop(e, device.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Connected Panel */}
          <div style={{ background: "var(--surface-low)", borderRadius: 20, padding: 24 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: "var(--primary)",
                marginBottom: 6,
              }}
            >
              CONNECTED PANEL
            </div>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 22,
                color: "var(--on-surface)",
                marginBottom: activeTransfer ? 20 : 8,
              }}
            >
              {activeTransfer ? "Active Stream" : "No Active Transfer"}
            </h3>

            {activeTransfer ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>
                    {activeTransfer.fileName}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--primary)", fontWeight: 600 }}>
                    {Math.round((activeTransfer.sentBytes / activeTransfer.totalBytes) * 100)}%
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: 3,
                    background: "var(--surface-highest)",
                    borderRadius: 2,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      width: `${(activeTransfer.sentBytes / activeTransfer.totalBytes) * 100}%`,
                      height: "100%",
                      background: "linear-gradient(to right, var(--primary-dim), var(--primary))",
                      borderRadius: 2,
                      transition: "width 0.1s",
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: "var(--on-surface-muted)", textAlign: "right" }}>
                  to {activeTransfer.targetCount} node{activeTransfer.targetCount !== 1 ? "s" : ""}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--on-surface-muted)", marginBottom: 20 }}>
                Drop a file to start a transfer.
              </div>
            )}

            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "var(--on-surface-muted)",
                marginBottom: 12,
              }}
            >
              ACTIVE NODES
            </div>

            {devices.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--on-surface-muted)", padding: "12px 0" }}>
                No nodes connected.
              </div>
            ) : (
              devices.map((device) => (
                <NodeRow
                  key={device.id}
                  name={device.name}
                  sub={device.platform}
                  encrypted={!!getSharedKey(device.id)}
                  latencyMs={device.latencyMs}
                />
              ))
            )}

            <div style={{ position: "relative", marginTop: 16 }}>
            <button
              onClick={() => devices.length > 1 ? setSendPickerOpen((v) => !v) : handleFileInput(devices[0]?.id)}
              disabled={!connected}
              style={{
                width: "100%",
                padding: "14px",
                background: connected ? "var(--primary)" : "var(--surface-high)",
                border: "none",
                borderRadius: 12,
                color: connected ? "#0e0e0f" : "var(--on-surface-muted)",
                fontSize: 14,
                fontWeight: 700,
                cursor: connected ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontFamily: "var(--font-ui)",
                transition: "background 0.2s",
              }}
            >
              <span style={{ fontSize: 18 }}>+</span> Send
              {devices.length > 1 && <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>▾</span>}
            </button>
            {sendPickerOpen && (
              <DevicePicker
                devices={devices}
                onSelect={(id) => { handleFileInput(id ?? undefined); setSendPickerOpen(false); }}
                onClose={() => setSendPickerOpen(false)}
              />
            )}
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ background: "var(--surface-low)", borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--primary)", marginBottom: 14 }}>
              QUICK ACTIONS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Send clipboard */}
              <button
                onClick={sendClipboard}
                disabled={!connected || devices.length === 0}
                className={clipSent ? "btn-success" : ""}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  background: clipSent ? "rgba(34,197,94,0.12)" : "var(--surface-high)",
                  border: "none",
                  borderRadius: 10,
                  color: clipSent ? "#22c55e" : connected && devices.length > 0 ? "var(--on-surface)" : "var(--on-surface-muted)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: connected && devices.length > 0 ? "pointer" : "not-allowed",
                  fontFamily: "var(--font-ui)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  transition: "background 0.15s, color 0.15s, transform 0.1s",
                }}
              >
                <span style={{ fontSize: 16 }}>📋</span>
                <div style={{ textAlign: "left" }}>
                  <div>{clipSent ? "Sent!" : "Send clipboard"}</div>
                  <div style={{ fontSize: 10, color: clipSent ? "#22c55e" : "var(--on-surface-muted)", fontWeight: 400, marginTop: 1 }}>
                    {devices.length > 0 ? `Broadcast to ${devices.length} device${devices.length !== 1 ? "s" : ""}` : "No devices connected"}
                  </div>
                </div>
              </button>

              {/* Send last file / pick file */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => devices.length > 1 ? setQaPickerOpen((v) => !v) : handleFileInput(devices[0]?.id)}
                  disabled={!connected}
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    background: "var(--surface-high)",
                    border: "none",
                    borderRadius: 10,
                    color: connected ? "var(--on-surface)" : "var(--on-surface-muted)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: connected ? "pointer" : "not-allowed",
                    fontFamily: "var(--font-ui)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    transition: "background 0.15s, color 0.15s, transform 0.1s",
                  }}
                >
                  <span style={{ fontSize: 16 }}>📁</span>
                  <div style={{ textAlign: "left", minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      Send file
                      {devices.length > 1 && <span style={{ fontSize: 9, opacity: 0.5 }}>▾</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--on-surface-muted)", fontWeight: 400, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lastSent ? `Last: ${lastSent.name}` : "Pick a file to send"}
                    </div>
                  </div>
                </button>
                {qaPickerOpen && (
                  <DevicePicker
                    devices={devices}
                    onSelect={(id) => { handleFileInput(id ?? undefined); setQaPickerOpen(false); }}
                    onClose={() => setQaPickerOpen(false)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Receiving progress */}
          {receivingProgress.size > 0 && (
            <div style={{ background: "var(--surface-low)", borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "var(--on-surface-muted)", marginBottom: 14 }}>
                RECEIVING
              </div>
              {[...receivingProgress.entries()].map(([id, t]) => {
                const pct = t.total > 0 ? Math.round((t.received / t.total) * 100) : 0;
                return (
                  <div key={id} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--on-surface-variant)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.name}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "var(--tertiary)", fontWeight: 600 }}>{pct}%</span>
                        <button
                          onClick={() => {
                            send({
                              type: "file-cancel",
                              transferId: id,
                              from: myDeviceId ?? "web",
                              to: t.senderId,
                              cancelledBy: "receiver",
                            } satisfies FileCancelMessage);
                            incomingRef.current.delete(id);
                            rejectedRef.current.delete(id);
                            pendingApprovalsRef.current.delete(id);
                            setReceivingProgress((prev) => {
                              const next = new Map(prev);
                              next.delete(id);
                              return next;
                            });
                            setApprovalQueue((q) => q.filter((a) => a.transferId !== id));
                            emitMeshEvent("file:cancelled", {
                              deviceId: t.senderId,
                              meta: { transferId: id, cancelledBy: "receiver", fileName: t.name },
                            });
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "2px 4px",
                            fontSize: 12,
                            color: "var(--on-surface-muted)",
                            lineHeight: 1,
                          }}
                          title="Cancel transfer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div style={{ height: 3, background: "var(--surface-highest)", borderRadius: 2 }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: "linear-gradient(to right, #c084fc, var(--tertiary))",
                          borderRadius: 2,
                          transition: "width 0.1s",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Network stats */}
          <div
            style={{
              background: "var(--surface-low)",
              borderRadius: 16,
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <RingProgress value={latencyToScore(latency, connected)} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--on-surface)", marginBottom: 2 }}>
                {latency !== null ? `${latency} ms` : "Network Latency"}
              </div>
              <div style={{ fontSize: 11, color: "var(--on-surface-muted)", letterSpacing: "0.06em" }}>
                {!connected ? "OFFLINE" : latency === null ? "MEASURING..." : latencyLabel(latency)}
              </div>
            </div>
          </div>

          {/* Clipboard Sync Status */}
          <ClipboardSyncStatus deviceCount={devices.length} connected={connected} />

          {/* Recent Transfers */}
          <div style={{ background: "var(--surface-low)", borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "var(--on-surface-muted)", marginBottom: 12 }}>
              RECENT TRANSFERS
            </div>
            {recentTransfers.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--on-surface-muted)", paddingBottom: 4 }}>
                No transfers yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recentTransfers.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: t.direction === "SENT" ? "rgba(133,173,255,0.12)" : "rgba(250,176,255,0.12)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: t.direction === "SENT" ? "var(--primary)" : "var(--tertiary)" }}>
                        {t.direction === "SENT" ? "↑" : "↓"}
                      </span>
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--on-surface-muted)" }}>
                        {formatBytes(t.size)} · {new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {activeTransfer && (
        <TransferModal
          fileName={activeTransfer.fileName}
          totalBytes={activeTransfer.totalBytes}
          sentBytes={activeTransfer.sentBytes}
          bytesPerSec={activeTransfer.bytesPerSec}
          targetCount={activeTransfer.targetCount}
          fileIndex={activeTransfer.fileIndex}
          totalFiles={activeTransfer.totalFiles}
          onCancel={() => {
            cancelRef.current = true;
            activeTransferIdRef.current = null;
            send({
              type: "file-cancel",
              transferId: activeTransfer.transferId,
              from: myDeviceId ?? "web",
              cancelledBy: "sender",
              ...(activeTransfer.to ? { to: activeTransfer.to } : {}),
            } satisfies FileCancelMessage);
            emitMeshEvent("file:cancelled", {
              deviceId: activeTransfer.to,
              meta: { transferId: activeTransfer.transferId, cancelledBy: "sender", fileName: activeTransfer.fileName },
            });
            setTimeout(() => setActiveTransfer(null), 400);
          }}
        />
      )}

      {pendingPreview && (
        <FilePreviewModal
          name={pendingPreview.name}
          size={pendingPreview.size}
          mimeType={pendingPreview.mimeType}
          url={pendingPreview.url}
          senderName={
            allDevices.find((d) => d.id === pendingPreview.senderId || d.stableId === pendingPreview.senderId)?.name
            ?? pendingPreview.senderId
          }
          encrypted={pendingPreview.encrypted}
          trusted={pendingPreview.trusted}
          onSave={() => {
            const a = document.createElement("a");
            a.href = pendingPreview.url;
            a.download = pendingPreview.name;
            a.click();
            setPendingPreview(null);
          }}
          onDismiss={() => setPendingPreview(null)}
        />
      )}

      {currentApproval && (
        <ApprovalModal
          deviceName={currentApproval.deviceName}
          fileName={
            (currentApproval.buffered[0] as FileStartMessage | undefined)?.name ?? "unknown file"
          }
          onApprove={() => handleApprove(currentApproval)}
          onAllowOnce={() => handleAllowOnce(currentApproval)}
          onReject={() => handleReject(currentApproval)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

import type { DeviceInfo } from "@aether/types";

function DeviceCard({
  device,
  encrypted,
  trusted,
  latencyHistory,
  isDragTarget,
  onSend,
  onDragEnter,
  onDragOver,
  onDrop,
}: {
  device: DeviceInfo;
  encrypted: boolean;
  trusted: boolean;
  latencyHistory: number[];
  isDragTarget?: boolean;
  onSend: () => void;
  onDragEnter?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <div
      data-testid="device-card"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        background: isDragTarget ? "rgba(133,173,255,0.1)" : "var(--surface-low)",
        borderRadius: 20,
        padding: 20,
        boxShadow: isDragTarget ? "0 0 0 2px var(--primary)" : "none",
        transition: "box-shadow 0.15s, background 0.15s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <DeviceIconBox />
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginBottom: 4 }}>
            {device.latencyMs !== undefined && device.latencyMs < 15 ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "rgba(133,173,255,0.15)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--primary)",
                  letterSpacing: "0.04em",
                }}
              >
                Local
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "rgba(133,173,255,0.15)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--primary)",
                  letterSpacing: "0.04em",
                }}
              >
                LAN
              </span>
            )}
            {encrypted && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "rgba(34,197,94,0.12)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#22c55e",
                  letterSpacing: "0.04em",
                }}
              >
                E2E
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: trusted ? "#22c55e" : "var(--on-surface-muted)", letterSpacing: "0.06em", marginTop: 2 }}>
            {trusted ? "TRUSTED" : "UNKNOWN"}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            color: "var(--on-surface)",
            marginBottom: 4,
          }}
        >
          {device.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "#22c55e" }}>Online · {formatAge(device.connectedAt)}</span>
          <span style={{ fontSize: 11, color: "var(--on-surface-muted)" }}>
            {device.latencyMs !== undefined ? `${device.latencyMs}ms` : "--"}
          </span>
          {deviceLatencyTrend(latencyHistory) === "improving" && (
            <span style={{ fontSize: 11, color: "#22c55e", lineHeight: 1 }} title="Latency improving">↓</span>
          )}
          {deviceLatencyTrend(latencyHistory) === "degrading" && (
            <span style={{ fontSize: 11, color: "var(--error)", lineHeight: 1 }} title="Latency degrading">↑</span>
          )}
          {deviceLatencyTrend(latencyHistory) === "stable" && (
            <span style={{ fontSize: 11, color: "var(--on-surface-muted)", lineHeight: 1 }} title="Latency stable">—</span>
          )}
        </div>
      </div>

      <button
        onClick={onSend}
        style={{
          width: "100%",
          padding: "10px",
          background: isDragTarget ? "var(--primary)" : "transparent",
          border: "none",
          color: isDragTarget ? "#0e0e0f" : "var(--on-surface)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
          borderRadius: 8,
          transition: "background 0.15s, color 0.15s",
        }}
      >
        {isDragTarget ? "Drop to send" : "Send"}
      </button>
    </div>
  );
}

function NodeRow({ name, sub, encrypted, latencyMs }: { name: string; sub: string; encrypted: boolean; latencyMs?: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        background: "var(--surface-high)",
        borderRadius: 12,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "var(--surface-highest)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <ServerIcon />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--on-surface)" }}>{name}</div>
        <div style={{ fontSize: 11, color: "var(--on-surface-muted)" }}>{sub}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: encrypted ? "#22c55e" : "var(--on-surface-muted)", letterSpacing: "0.06em" }}>
          {encrypted ? "E2E" : ""}
        </div>
        <div style={{ fontSize: 9, color: "var(--on-surface-muted)" }}>
          {latencyMs !== undefined ? `${latencyMs}ms` : "--"}
        </div>
      </div>
    </div>
  );
}

function RingProgress({ value }: { value: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
      <svg width="56" height="56" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--surface-highest)" strokeWidth="3" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--primary)" strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--on-surface)",
        }}
      >
        {value}%
      </div>
    </div>
  );
}

function DeviceIconBox() {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: "var(--surface-high)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--on-surface-variant)" strokeWidth="1.5">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M1 21h22" />
      </svg>
    </div>
  );
}

function UploadIcon({ active }: { active: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--primary)" : "var(--on-surface-variant)"} strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--on-surface-variant)" strokeWidth="1.5">
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function ClipboardSyncStatus({ deviceCount, connected }: { deviceCount: number; connected: boolean }) {
  const [syncEnabled, setSyncEnabled] = useState(() => {
    try { return JSON.parse(localStorage.getItem("aether-clipboard-autosync") ?? "false"); } catch { return false; }
  });

  // Re-read on focus (in case toggled on the Portal page)
  useEffect(() => {
    function onFocus() {
      try { setSyncEnabled(JSON.parse(localStorage.getItem("aether-clipboard-autosync") ?? "false")); } catch { /* */ }
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <div
      style={{
        background: "var(--surface-low)",
        borderRadius: 16,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: syncEnabled && connected ? "rgba(133,173,255,0.12)" : "var(--surface-high)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={syncEnabled && connected ? "var(--primary)" : "var(--on-surface-muted)"} strokeWidth="1.5">
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <rect x="4" y="6" width="16" height="16" rx="2" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="13" y2="16" />
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--on-surface)", marginBottom: 2 }}>
          {syncEnabled && connected
            ? `Clipboard synced`
            : syncEnabled
              ? "Clipboard sync offline"
              : "Clipboard sync off"
          }
        </div>
        <div style={{ fontSize: 11, color: "var(--on-surface-muted)" }}>
          {syncEnabled && connected
            ? `${deviceCount} device${deviceCount !== 1 ? "s" : ""} connected`
            : syncEnabled
              ? "Waiting for connection"
              : "Enable in Portal"
          }
        </div>
      </div>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: syncEnabled && connected ? "#22c55e" : syncEnabled ? "#f59e0b" : "var(--surface-highest)",
          display: "inline-block",
          boxShadow: syncEnabled && connected ? "0 0 6px rgba(34,197,94,0.5)" : "none",
          flexShrink: 0,
        }}
      />
    </div>
  );
}

function formatAge(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  return `${Math.floor(diff / 3_600_000)}h`;
}

function deviceLatencyTrend(history: number[]): "improving" | "degrading" | "stable" | null {
  if (history.length < 3) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const diff = last - first;
  if (Math.abs(diff) < 5) return "stable";
  return diff < 0 ? "improving" : "degrading";
}

function latencyToScore(ms: number | null, connected: boolean): number {
  if (!connected || ms === null) return 0;
  if (ms <= 5) return 100;
  if (ms <= 20) return 95;
  if (ms <= 50) return 85;
  if (ms <= 100) return 70;
  if (ms <= 200) return 50;
  return 30;
}

function latencyLabel(ms: number): string {
  if (ms <= 20) return "OPTIMAL STABILITY";
  if (ms <= 50) return "GOOD";
  if (ms <= 100) return "ACCEPTABLE";
  return "HIGH LATENCY";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
