# Aether

Fast, silent, precise. LAN-first file and clipboard transfer — no cloud, no accounts, no friction.

## What it does

Drop a file onto a device. It arrives. Copy something on your phone. It's on your Mac. That's it.

- **Chunked file transfer** — 512 KB chunks, real-time progress with speed + ETA, cancel mid-send
- **Clipboard sync** — bidirectional; agent writes directly to system clipboard on receive
- **End-to-end encryption** — ECDH P-256 key exchange + AES-256-GCM for targeted sends
- **Trust gating** — approve unknown devices once, permanently, or reject outright
- **File preview** — image thumbnail, text preview, or type + size before saving; auto-saves after 8s
- **Device intelligence** — latency trend arrows, connection age, local-network detection per device

## Stack

```
apps/web      React 19 + Vite + TypeScript    Dashboard UI
apps/server   Fastify + ws                    WebSocket broadcaster
apps/agent    Node.js + clipboardy            Clipboard + file daemon
apps/e2e      Playwright                      E2E test suite
packages/types                                Shared TypeScript types
```

pnpm workspaces + Turborepo.

## Running

```bash
pnpm install
pnpm dev          # starts web + server + agent concurrently
```

Or individually:

```bash
cd apps/server && pnpm dev    # :3000 HTTP + :3001 WS
cd apps/web    && pnpm dev    # :5173
cd apps/agent  && pnpm dev    # clipboard daemon
```

Point the agent at a different server:

```bash
AETHER_SERVER=ws://192.168.x.x:3001 AETHER_NAME=my-mac pnpm dev
```

## Testing

```bash
# Run all e2e tests (requires dev server running)
pnpm --filter @aether/e2e exec playwright test

# Other modes
pnpm --filter @aether/e2e exec playwright test --ui
pnpm --filter @aether/e2e exec playwright test --headed
```

Tests cover: peer discovery, E2E encryption badge, file transfer (accept / reject / cancel), trust flow, clipboard sync. All run serially against the shared dev server.

## HTTPS / mobile

Vite uses mkcert certificates (`apps/web/certs/`). Android Chrome auto-upgrades QR-scanned URLs to HTTPS — install the mkcert root CA on mobile to avoid certificate warnings.

## Architecture

See [`docs/how-it-works.md`](docs/how-it-works.md) for protocol details, encryption flow, message types, and component architecture.
