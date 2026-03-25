# Aether — How It Works

Last updated: 2026-03-25

---

## Overview

Aether is a LAN-first file and clipboard transfer tool. Files and clipboard content move between devices on the same network via a central WebSocket server. No cloud, no internet required.

```
[Device A]          [Server]          [Device B]
  agent  ──WS──►  broadcaster  ──WS──►  agent
  web UI ──WS──►  broadcaster  ──WS──►  web UI
```

---

## Project Structure

```
aether/
├── apps/
│   ├── web/        # React frontend (UI)
│   ├── server/     # Node.js WebSocket broadcaster
│   └── agent/      # Clipboard sync + file receiver daemon
├── packages/
│   └── types/      # Shared TypeScript types
├── docs/
│   └── how-it-works.md
├── design.md
├── CLAUDE.md
├── tsconfig.base.json
├── turbo.json
└── pnpm-workspace.yaml
```

This is a **pnpm monorepo** managed with **Turborepo**. All apps share `@aether/types` for full-stack type safety.

---

## Running the Project

```bash
pnpm dev                          # all apps via turbo

cd apps/server && pnpm dev        # HTTP :3000 + WS :3001
cd apps/web    && pnpm dev        # Vite :5173
cd apps/agent  && pnpm dev        # clipboard + file daemon

# Agent options (env vars):
AETHER_SERVER=ws://192.168.x.x:3001   # point to a remote server
AETHER_NAME=my-macbook                # custom device name (default: hostname)
```

---

## apps/server

**Stack:** Fastify + `ws`

**Ports:** HTTP `:3000`, WebSocket `:3001`

**What it does:**
- Assigns each connecting client a UUID and stores `Map<id, { ws, DeviceInfo }>`
- On connect: sends `welcome` (with the client's own UUID) then broadcasts updated `devices` list to all clients
- On `hello` message: updates the device's display name, platform, and optional `stableId`, re-broadcasts `devices`
- On `ping`: echoes `pong` directly back to the sender (not broadcast)
- On any other message: stamps `senderId` (the sender's UUID) on the message, then relays it (targeted or broadcast)
- On disconnect / error: removes client, re-broadcasts `devices`

**Message stamping:** The server adds `senderId: <uuid>` to every relayed message so receivers know exactly which device sent it. This is the authoritative source of sender identity — clients cannot spoof each other's UUIDs.

**WS keepalive:** The server sends a native WebSocket ping frame to each client every 20 seconds (`HEARTBEAT_MS = 20_000`). Clients that miss a pong are terminated. Pong receipt updates `DeviceInfo.latencyMs` and triggers a `devices` re-broadcast so all clients see live RTT per node. This prevents Vite proxy (and other intermediaries) from silently dropping idle connections.

**Endpoints:**
```
GET http://localhost:3000/health  → { ok, clients, devices }
GET http://localhost:3000/info    → { ips: string[], wsPort: number, webPort: number }
```
`/info` returns the machine's LAN IPs (non-loopback IPv4) plus the HTTP and WS ports. The Clipboard (Portal) page fetches this at `/api/info` (proxied through Vite) to build the QR code URL: `https://<ip>:<webPort>` — the web app URL, not the WS port.

---

## apps/agent

**Stack:** Node.js + `clipboardy` + `ws` + `node:fs`

**What it does:**
- On connect: sends `hello` with hostname (or `AETHER_NAME`), `platform: "agent"`, and a persistent `stableId`
- Handles `welcome` → stores server-assigned UUID in `myDeviceId`; uses it as `from` in outgoing messages
- Handles `devices` and `key-exchange` gracefully (no-ops — agent doesn't participate in ECDH yet)
- Polls clipboard every **800ms** and sends `clipboard` message on change
- Receives `clipboard` messages → writes content to system clipboard via `clipboard.write()`; sets `lastClipboard` to prevent the poll from immediately re-broadcasting what was just applied
- Receives chunked file transfer (`file-start` → `file-chunk[]` → `file-end`) → validates all chunks arrived → reassembles and saves to `~/Downloads/aether-received/`
- Filename collision handling: appends timestamp suffix if file already exists
- Auto-reconnects every 3s on disconnect

**Stable identity:** The agent generates a UUID on first run and persists it to `~/.aether-agent-id`. This `stableId` is included in every `hello` message so the web UI can recognise the same physical device across reconnects (the server-assigned ephemeral UUID changes each time). Trust lookups prefer `stableId` over the ephemeral `id`.

**Received files:** `~/Downloads/aether-received/<filename>`

**Note:** Files sent from web to agent are never encrypted — the agent doesn't participate in ECDH key exchange, so `getSharedKey(agentId)` always returns `null` and `willEncrypt` stays `false`.

---

## apps/web

**Stack:** React 19 + Vite 8 + Tailwind v4 + react-router-dom v7

### Pages

| Route | Nav label | Component | Description |
|-------|-----------|-----------|-------------|
| `/` | Dashboard | `Dashboard` | Drop zone with device picker, live device list, send/receive progress, clipboard sync status, latency ring gauge, recent transfers |
| `/clipboard` | Portal | `Portal` | Live sync panel, persistent history with expandable preview & resend, auto-sync toggle, targeted Send (DevicePicker dropdown) + per-device chips, QR pairing, Sync Status panel |
| `/history` | History | `History` | Transfer archive with sent/received filter + type filter (all / images / files); shows total bandwidth used across all entries |
| `/settings` | Settings | `Settings` | Device name, toggles, connectivity status, session uptime, trusted device management, connected peers list with last-seen timestamps |

### Components

| Component | Description |
|-----------|-------------|
| `Layout` | Sticky nav wraps all pages. Desktop nav-right: "Search commands…" button (⌘K trigger) + bell (activity feed) + user avatar (DevicePanel). Mobile hides those controls. Uses `useWindowWidth` hook for the breakpoint. |
| `TransferModal` | Overlay with real-time progress during active send. Shows current speed (moving-average over last 8 chunks) and ETA derived from remaining bytes ÷ speed. Speed and ETA only appear after enough chunks have been sent and hide when the transfer completes. |
| `ApprovalModal` | Trust gate shown when an unknown device initiates a file transfer. Three actions: "Allow & Trust" (persists trust, shows "This device will be remembered" hint), "Allow once" (accepts this transfer only, no trust stored), "Reject" (discards buffer). |
| `FilePreviewModal` | Shown after a file is fully received and assembled, before triggering the browser download. Long filenames are truncated in the middle (extension always visible; full name on hover). MIME type shown as friendly label ("JPEG image", "PDF document", etc.). Badges: 🔒 Encrypted, ✓ Trusted device, ⚠ Unknown sender. Images render a thumbnail (14px padding); text/JSON/XML show a monospace preview (first 2000 chars); everything else shows a file-type icon + size. `Enter` saves, `Esc` dismisses. Auto-saves after 8s with a draining progress bar countdown. Clicking outside also dismisses. |
| `CommandPalette` | ⌘K command palette — navigate pages, send clipboard to a specific device, copy current clipboard. Opened via `⌘K` / `Ctrl+K` globally (Layout keyboard listener) or by clicking the "Search commands…" nav button. Wired to real WS state (`devices`, `myDeviceId`, `send`). |
| `DevicePicker` | Dropdown positioned below a trigger button. Shows "All devices" (broadcast) + individual device rows. `onSelect(id \| null)` — `null` means broadcast. Used in Portal's Send button and Dashboard. Closes on outside click. |
| `Toast` / `Toaster` | Module-level toast bus. `toast(message, icon?)` fires a notification from anywhere. `Toaster` renders the stack fixed bottom-right (z-index 9999). Mounted once in `App.tsx` outside the router. Auto-dismisses after 2.5s. |
| `QuickSendPalette` | Legacy — uses hardcoded mock devices; not wired to real state. Superseded by `CommandPalette`. |

### Context

| Provider/Hook | File | Description |
|--------------|------|-------------|
| `WsProvider` | `contexts/ws-context.tsx` | Single shared WS connection for the entire app. Manages `connected`, `devices`, `deviceName`, `latency`, `myDeviceId`. Exposes `send()`, `subscribe()`, `setDeviceName()`, `getSharedKey()`. Imports `WsContext` and `Listener` from `use-ws.ts`. |
| `WsContext` / `WsContextValue` / `Listener` | `contexts/use-ws.ts` | Context object, value type, and listener type — extracted so pages/components can import the hook without pulling in the full provider implementation. |
| `useWs()` | `contexts/use-ws.ts` | Hook to consume `WsProvider` from any page or component |

All pages (`Dashboard`, `Portal`, `Settings`) subscribe to messages via `subscribe(fn)` which returns an unsubscribe function used in `useEffect` cleanup. There is only one WebSocket connection per session.

### History persistence

`lib/history-store.ts` — thin localStorage wrapper for file transfer history:
- `addHistory(entry)` — called by Dashboard on every send and receive (max 200 entries)
- `getHistory()` — called by History page on mount
- `clearHistory()` — triggered by the "CLEAR HISTORY" button on the History page; also called by Reset Node Configuration in Settings

### Clipboard history persistence

Clipboard history is stored separately in `localStorage["aether-clipboard-history"]` (max 50 entries, JSON). Managed directly in the Portal component:
- Initialised from localStorage on mount
- Persisted via `useEffect` whenever `history` changes
- Entries include `{ id, content, from, timestamp, type }`
- `from` is the sender's device UUID (or `"local"` for items copied locally)
- Resolved to a friendly name at render time by looking up `devices` from `WsContext`

### Settings persistence

| Key | Contents |
|-----|----------|
| `localStorage["aether-device-name"]` | Device display name; read on `WsProvider` init, sent in every `hello` |
| `localStorage["aether-settings"]` | JSON object: `{ clipboardSync, autoAccept, offlineLan }` |
| `localStorage["aether-clipboard-autosync"]` | Boolean; auto-broadcast local clipboard changes (default `false`) |
| `localStorage["aether-clipboard-history"]` | JSON array of `ClipboardEntry[]` (max 50) |
| `localStorage["aether-trusted-devices"]` | JSON array of trusted device IDs |
| `localStorage["aether-last-seen"]` | JSON object `Record<deviceId, unixMs>`; updated by Settings page to track last-seen timestamps for offline trusted devices |
| `sessionStorage["aether-connected-at"]` | Unix ms timestamp of when this session first connected; used by Settings to compute session uptime. Cleared on disconnect, preserved across page reloads within the same session. |

"Apply Changes" in Settings immediately re-announces the device name via a new `hello` message to the server.

---

## Trust Model

**Problem:** Any device on the LAN can connect and send files. Without a trust gate, files arrive automatically.

**Solution:** Client-side trust gating with localStorage persistence.

### Trust store

`lib/trust-store.ts` stores trusted device UUIDs (server-assigned) in `localStorage["aether-trusted-devices"]`. Functions:
- `isTrusted(deviceId)` — check before accepting a file
- `trustDevice(deviceId)` — persist after approval
- `untrustDevice(deviceId)` — revoke; called from the Trusted Devices section in Settings
- `getTrustedDevices()` — returns full `Set<string>` for listing in Settings UI

### Trust flow

```
file-start arrives with senderId (server-stamped UUID)
  → isTrusted(senderId)?
    YES → process normally (file-chunk, file-end handled as before)
    NO  → buffer all messages for this transferId in pendingApprovalsRef
        → show ApprovalModal with device name + file name
        → user clicks "Allow & Trust"
            → trustDevice(senderId)
            → replay all buffered messages through processFileMsg()
        → user clicks "Allow once"
            → replay buffered messages (no trustDevice() call)
            → next transfer from this device will prompt again
        → user clicks "Reject"
            → discard buffer, hide modal
```

Subsequent files from the same device are accepted without prompting. Trust persists across page reloads and browser sessions.

---

## End-to-End Encryption

**Algorithm:** ECDH P-256 key exchange → AES-256-GCM per-chunk encryption.

**Key exchange flow:**

```
Device A connects:
  ← server sends welcome { deviceId: "uuid-A" }
  → A sends hello { from: "uuid-A", name, platform }
  → A sends key-exchange { publicKey: "<base64 SPKI>", from: "uuid-A" }
     (server stamps senderId: "uuid-A" and relays to all)

Device B receives key-exchange:
  → derives shared AES-256-GCM key: ECDH(B.privateKey, A.publicKey)
  → sharedKeys.set("uuid-A", derivedKey)

(Same happens in reverse: A derives from B's key-exchange)
```

The server only sees ciphertext and public keys — never the AES keys or plaintext.

### Encrypted file send

Only **targeted sends** (`to: deviceId`) are encrypted. Send-to-all (all devices) remains plaintext — encrypting for N devices simultaneously would require N different ciphertexts or a group key exchange, which is out of scope.

```
sendFile(file, targetId):
  sharedKey = getSharedKey(targetId)
  if sharedKey → send file-start { encrypted: true }
  for each chunk:
    { iv, data } = AES-256-GCM encrypt(sharedKey, rawBytes)
    send file-chunk { data, iv }   // iv is unique per chunk (12B random)
```

### Encrypted file receive

```
file-start { encrypted: true } → mark IncomingTransfer.encrypted = true
file-chunk → store { data, iv } (no decryption yet)
file-end   → decrypt all chunks: decryptChunk(sharedKey, chunk.iv, chunk.data)
           → assemble plaintext → Blob → download
```

Decryption happens at assembly time (on `file-end`) using `Promise.all` so all chunks decrypt in parallel before the file is offered for download.

### Crypto primitives (`lib/aether-crypto.ts`)

| Function | Description |
|----------|-------------|
| `generateKeyPair()` | ECDH P-256 key pair (called once per WsProvider mount) |
| `exportPublicKey(key)` | CryptoKey → base64 SPKI (sent over WS) |
| `importPublicKey(b64)` | base64 SPKI → CryptoKey (received from peer) |
| `deriveSharedKey(priv, pub)` | ECDH → AES-256-GCM CryptoKey |
| `encryptChunk(key, bytes)` | AES-GCM encrypt Uint8Array → { iv, data } (both base64). Uses a loop (not spread) to build the binary string — spreading a large Uint8Array into `String.fromCharCode` exceeds the JS argument limit (~65 535) for chunks > 64 KB. |
| `decryptChunk(key, iv, data)` | AES-GCM decrypt → base64 string of plaintext (same format as unencrypted chunks, ready for independent `atob()` decode at assembly time) |

All crypto uses the Web Crypto API (`crypto.subtle`) — no external dependencies.

---

## Device discovery flow

```
Client connects
  ← server sends welcome { deviceId }
  → client sends hello { name, platform, from: deviceId }
  → client sends key-exchange { publicKey, from: deviceId }
  ← server broadcasts { type: "devices", devices: [...] } to all
  → web UI updates "Nearby Devices" from real server data
  ← other clients process key-exchange, derive shared key
```

---

## Device Intelligence

Each device card in the Dashboard's "Nearby Devices" section shows three real-time signals:

**Latency trend:** Dashboard tracks the last 5 `latencyMs` samples per device (keyed by `stableId ?? id`) in a `useRef` map updated on every `devices` broadcast. `deviceLatencyTrend()` compares the first and last sample in the window; a difference of ≥5ms triggers an arrow:
- `↓` green — latency improving (lower)
- `↑` red — latency degrading (higher)
- `—` muted — stable (< 5ms change)
- No arrow shown until 3+ samples are collected (avoids false signals on connect).

**Joined age:** "Online · 3m" derived from `device.connectedAt` using `formatAge()`. Updates on every render.

**Local vs LAN badge:** If `device.latencyMs < 15`, the standard "LAN" badge becomes "Local" — a latency-based inference that both devices are on the same physical network segment. Above 15ms stays "LAN".

---

## Drag-to-device UX

When the user drags a file over the Dashboard drop zone:
- The drop zone interior transforms into a **device picker grid**: one tile per connected device + an "All devices / Send to All" tile
- Hovering over a tile highlights it (blue ring + background tint)
- Dropping on a device tile calls `sendFiles(files, device.id)` — targeted, encrypted if key exchange completed
- Dropping on "All devices" calls `sendFiles(files)` — sends to all, always plaintext
- The Nearby Devices cards below the drop zone are also droppable: they highlight with a ring when dragged over and show "Drop to send" on the button

**Reliable drag tracking:** A `dragCountRef` counter increments on `dragEnter` and decrements on `dragLeave` (both bubble up from child elements). The dragging state clears only when the counter reaches zero, preventing false positives from cursor movement between child elements.

---

## File send flow (chunked)

```
User drops / selects file (optionally targeting a specific device)
  → read as ArrayBuffer
  → split into 512 KB chunks (CHUNK_SIZE = 512 * 1024)
  → if targetId && sharedKey: set encrypted=true
  → send file-start { transferId, name, mimeType, size, totalChunks, encrypted? }
  → for each chunk:
      if encrypted: AES-GCM encrypt (loop, not spread — avoids JS arg limit) → send file-chunk { data (ciphertext), iv }
      else: btoa(binary string built via loop) → send file-chunk { data }
     (yield to event loop between chunks → UI stays responsive)
  → send file-end { transferId }
  → TransferModal shows real byte progress + speed (moving-average, 8-chunk window) + ETA, auto-closes after 1.2s
  → if user cancels mid-send: set cancelRef → stop chunk loop → send file-cancel { transferId, to? } → close modal
```

---

## File receive flow (web)

```
file-start → trust check (senderId; prefers stableId for agent reconnect survival)
           → if untrusted OR autoAccept=false: buffer all messages + show ApprovalModal
           → if trusted: store IncomingTransfer { encrypted, chunks[] }
file-chunk → store { data, iv? } at chunks[index]
file-end   → if encrypted: decrypt each chunk with shared key (Promise.all)
           → decode each chunk's base64 independently → array of Uint8Array
           → new Blob([...Uint8Arrays], { type }) — browser concatenates
           → append to "RECEIVED" list in UI
           → addHistory() + notify()
           → show FilePreviewModal (image thumbnail / text preview / generic icon)
           → user clicks "Save to Downloads" → triggers <a download>.click()
           → user clicks "Dismiss" → modal closes, file stays in RECEIVED list
```

**Why per-chunk base64 decode:** Each chunk is base64-encoded independently. CHUNK_SIZE = 524,288 bytes — `524288 mod 3 = 2` — so every full chunk's base64 output ends with a `=` padding character. Joining the base64 strings before decoding (e.g. `"AAAA==BBBB..."`) causes `atob()` to stop at the first `=` mid-string, silently truncating the file. Decoding each chunk independently and passing an array to `Blob` avoids this entirely.

---

## packages/types

**Key file:** `packages/types/src/index.ts`

### Message types

| Type | Direction | Description |
|------|-----------|-------------|
| `welcome` | server → client | Tells the connecting client its server-assigned UUID |
| `hello` | client → server | Announces device name and platform on connect |
| `devices` | server → clients | Full list of currently connected devices |
| `key-exchange` | client → server → clients | ECDH public key broadcast; server stamps `senderId` |
| `clipboard` | client → server → clients | Clipboard sync payload |
| `file-start` | client → server → client(s) | Begins chunked transfer. `to` targets one device; `encrypted` signals AES-GCM |
| `file-chunk` | client → server → client(s) | One 512 KB chunk; `iv` present when encrypted |
| `file-end` | client → server → client(s) | Transfer complete; receiver assembles and decrypts |
| `file-cancel` | client → server → client(s) | Sender aborted the transfer; receiver discards all buffered chunks and clears progress state |
| `file` | client → server → clients | Legacy single-frame transfer (deprecated, kept for agent compat) |
| `ping` / `pong` | client ↔ server | RTT latency measurement (5s interval) |

All relayed messages have `senderId` stamped by the server — this is the authoritative sender identity.

### DeviceInfo

```ts
type DeviceInfo = {
  id: string;           // ephemeral UUID assigned by server for this session
  stableId?: string;    // persistent cross-session identity (agent only, from ~/.aether-agent-id)
  name: string;         // from hello message, default "device-xxxxxx"
  platform: "web" | "agent" | "unknown";
  connectedAt: number;  // unix ms
  latencyMs?: number;   // RTT from server WS ping/pong, updated every 20s
}
```

The web UI deduplicates the `devices` list by `stableId` when present, keeping the entry with the lowest latency. This prevents the same physical device showing twice when reconnecting.

---

## Design System

Defined in `design.md`, implemented in `apps/web/src/index.css`.

**Fonts:** Manrope (display/headings) + Inter (UI), loaded via Google Fonts in `index.html`

### Color tokens

| Variable | Value | Usage |
|----------|-------|-------|
| `--bg` | `#0e0e0f` | Base background |
| `--surface-low` | `#131314` | Cards, panels |
| `--surface-high` | `#1c1c1e` | Hover states, inner cards |
| `--surface-highest` | `#242426` | Progress tracks |
| `--primary` | `#85adff` | CTAs, active states |
| `--primary-dim` | `#5c8cff` | Gradient starts |
| `--tertiary` | `#fab0ff` | Secondary highlights |
| `--error` | `#ff716c` | Failed states |
| `--on-surface` | `#e8e8ea` | Primary text |
| `--on-surface-variant` | `#adaaab` | Secondary text |
| `--on-surface-muted` | `#6b6870` | Metadata, labels |

**Rules from design.md:**
- No 1px solid borders — tonal shifts or negative space only
- No pure white text — use `--on-surface`
- Glassmorphism on floating elements: 40% opacity + `backdrop-blur: 24px`
- Progress bars: gradient `--primary-dim → --primary` + leading-edge glow
- Rounding: `24px` large containers, `16px` cards, `12px` list items

---

## Latency Measurement

`WsProvider` sends a `ping` message every 5 seconds. The server responds immediately with `pong` to the same client (not broadcast). The context records `pingSentAt` before sending and calculates `latency = Date.now() - pingSentAt` on receipt. The Dashboard ring gauge and label update in real time. Latency resets to `null` on disconnect.

---

## WS URL resolution

- On HTTP: `ws://<hostname>:3001` (direct to WS server)
- On HTTPS: `wss://<hostname>/ws` (proxied through Vite — required for QR scan on mobile)
- Override with `VITE_WS_URL` env var

## HTTPS / QR scanning

Android Chrome auto-upgrades scanned QR URLs to `https://`. Vite runs with mkcert-generated certificates (stored in `apps/web/certs/`). If certs are missing Vite falls back to HTTP with a console warning. The WS connection is proxied through Vite at `/ws` → `ws://localhost:3001`. The `/api/info` endpoint is also proxied through Vite to `http://localhost:3000/info`.

The Portal page builds the QR code value as `https://<lanIp>:<webPort>` — pointing to the web app (Vite), not the WS server. The LAN IP and `webPort` come from the `/api/info` response. Users must install the mkcert root CA on mobile devices to avoid certificate warnings (on hold).

---

## Settings Toggles

The Settings page persists three toggles to `localStorage["aether-settings"]`:

| Toggle | Key | Default | Wired? |
|--------|-----|---------|--------|
| Clipboard Sync | `clipboardSync` | on | Yes — Portal poll exits early when off |
| Auto Accept | `autoAccept` | on | Yes — Dashboard reads it before showing ApprovalModal |
| Offline LAN Mode | `offlineLan` | off | No — stored only, relay filtering not implemented |

The **Clipboard Sync** toggle in Settings (`clipboardSync`, default `true`) is now wired: when off, the Portal's 1-second poll exits early and neither reads nor broadcasts clipboard content. The separate **auto-sync** toggle on the Portal page (`localStorage["aether-clipboard-autosync"]`, default `false`) controls whether each clipboard change is automatically broadcast to all devices; it only has effect when Clipboard Sync is on.

## Receiving Progress

When a chunked transfer arrives, Dashboard tracks progress in `receivingProgress` state (`Map<transferId, { name, received, total }>`). A progress bar per in-flight transfer appears in the right column while chunks arrive. Cleared on `file-end`.

## Activity Bus

`lib/activity-bus.ts` owns the activity bus — a module-level singleton with no React dependency:
- `addActivity(icon, text)` — push an event; any file can import and call this
- `subscribeActivity(handler)` — register a listener, returns an unsubscribe function
- `ActivityEvent` — `{ id, icon, text, time }` type

`Layout` subscribes via `subscribeActivity` to receive all events (both WS-generated and external) and append them to local bell state. It also subscribes to WS messages directly (`clipboard`, `file-start`, `file-end`) and calls `addActivity()` for each, so those events flow through the same bus.

Dashboard and Portal import `addActivity` directly from `lib/activity-bus` — not from Layout. The bell badge increments for each new event while the panel is closed; opening the panel resets the count. Events are capped at 30 entries in memory and never persisted.

## Toast Notifications

`components/Toast.tsx` exports:
- `toast(message, icon?)` — fire-and-forget; pushes a `ToastItem` to all mounted `Toaster` instances via a module-level listener set
- `Toaster` — renders a fixed bottom-right stack; items auto-dismiss after 2.5s

`Toaster` is mounted once in `App.tsx` outside `<Layout>` so it stays alive across route changes. Any module can call `toast()` after importing it — no context or prop threading required.

## Portal Page — Keyboard Shortcut

`⌘⇧V` (or `Ctrl⇧V`) while on the Portal page writes the currently displayed clipboard content to the local system clipboard. Implemented via a `keydown` listener added in `useEffect` and cleaned up on unmount. The handler reads from `applyRef.current` (a ref that always points to the latest `applyToClipboard` function) to avoid stale closure issues.

## Reset Node Configuration

Two-step confirm in Settings (first click shows confirm label, second click within 3s executes). On confirm: removes `aether-trusted-devices`, `aether-settings`, `aether-device-name` from localStorage, calls `clearHistory()`, then reloads the page.

## Trusted Device Management

Settings → "Trusted Devices" section lists all previously approved device UUIDs, cross-referenced with the live `devices` list for display names. Offline trusted devices show their UUID prefix. "Revoke" button calls `untrustDevice(id)` from `lib/trust-store.ts` — the next transfer from that device triggers ApprovalModal again.

## Layout — Bell and Avatar Panels

**Bell (ActivityPanel):** Dropdown shows recent activity events (clipboard received, file-start, file-end, plus any `addActivity()` calls from other components). Closes on outside click. Badge count resets when opened.

**Avatar (DevicePanel):** Dropdown shows:
- Inline device name editor — click "Edit" to rename, "Save" (or Enter) to apply. Calls `setDeviceName()` from `WsContext` which re-announces via `hello`.
- Connection status line with live peer count and RTT
- Clipboard Sync and Auto Accept toggles — read from and write to `localStorage["aether-settings"]` immediately (no "Apply" needed)
- List of connected devices with platform icons and per-device latency (`latencyMs`)

Both panels are wired directly to `WsContext` state inside `Layout` — they never own their own WS subscription.

## Dashboard — Clipboard Sync Status

The Dashboard right column includes a `ClipboardSyncStatus` card that reads `localStorage["aether-clipboard-autosync"]` to show the current sync state. Each state renders a title line and a subtitle line:

| State | Title | Subtitle | Dot |
|-------|-------|----------|-----|
| Sync on + connected | "Clipboard synced" | "N device(s) connected" | green glow |
| Sync on + disconnected | "Clipboard sync offline" | "Waiting for connection" | amber |
| Sync off | "Clipboard sync off" | "Enable in Portal" | dim |

The component re-reads localStorage on window `focus`, so toggling auto-sync on the Portal page is reflected immediately when switching back to Dashboard.

## Portal — Targeted Sends

The Send button in Portal opens a `DevicePicker` dropdown. Selecting a specific device calls `sendToDevice(deviceId, name)` which sends a targeted `clipboard` message (`to: deviceId`). Selecting "All devices" calls `pushToAll()` which broadcasts without a `to` field.

Below the action buttons, up to 6 per-device chip buttons are also rendered directly. Each chip highlights on hover and shows a "✓" when the clipboard was recently sent to that device. `sentDevices` state tracks which device IDs received a send in the last 2 seconds.

## Portal — Expandable Clipboard History

Clipboard history items are clickable. Clicking an entry expands it to show:
- **Full preview** of the content in a monospace, scrollable box (max 160px height)
- **Resend to All** button — pushes the entry's content as a new `clipboard` message to all devices
- **Copy** button — writes to local clipboard
- **Delete** button — removes the entry from history

A small chevron indicator on each row signals expandability. Only one entry can be expanded at a time (clicking another collapses the previous).

---

## What's Not Yet Built

- [ ] Agent ECDH encryption — agent handles `key-exchange` gracefully but doesn't participate; E2E encryption is web-to-web only
- [ ] Mobile QR scanning — on hold; Android needs mkcert root CA installed to trust the self-signed cert
- [ ] Offline LAN Mode toggle — stored in settings but relay filtering not implemented
- [x] Clipboard Sync toggle in Settings — now wired; poll exits early when disabled
- [ ] Offline queue — queue files/clipboard to send when a device comes back online
