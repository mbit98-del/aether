Read and follow the design.md and always update docs/how-it-works everytime you change something so its easy to understand the project under its hood

---

# Aether — Claude Context

## What the project is

LAN-first file and clipboard transfer. No cloud, no accounts. Files and clipboard move between devices on the same local network via a central WebSocket broadcaster. The UI is a dark, atmospheric dashboard (see `design.md` — "Obsidian Ether" aesthetic, Manrope + Inter, no 1px borders).

## Monorepo structure

```
apps/web        React 19 + Vite + TypeScript   Dashboard UI  :5173
apps/server     Fastify + ws                   WS broadcaster :3001 (HTTP :3000)
apps/agent      Node.js + clipboardy           Clipboard/file daemon
apps/e2e        Playwright                     E2E test suite
packages/types  Shared TypeScript types
```

pnpm workspaces + Turborepo. Run everything: `pnpm dev`.

## Key files to know

| File | Purpose |
|------|---------|
| `apps/web/src/pages/Dashboard.tsx` | All transfer logic, approval flow, state management (~1300 lines) |
| `apps/web/src/contexts/ws-context.tsx` | WebSocket connection, device list, ECDH key exchange |
| `apps/web/src/components/TransferModal.tsx` | Sender-side progress overlay (`data-testid="transfer-modal"`) |
| `apps/web/src/components/FilePreviewModal.tsx` | Receiver-side preview + save (8s auto-save) |
| `apps/web/src/components/ApprovalModal.tsx` | Trust gating: Allow & Trust / Allow once / Reject |
| `apps/server/src/index.ts` | Broadcaster: stamps `senderId`, relays targeted or broadcast |
| `apps/e2e/fixtures.ts` | Playwright fixtures: `deviceA/B`, `sendFileFromCard`, `waitForPeer` |

## Transfer protocol (simplified)

```
sender                          server                        receiver
  │── file-start ──────────────────────────────────────────────► │
  │── file-chunk × N ───────────────────────────────────────────► │
  │── file-end ─────────────────────────────────────────────────► │
  │                                                               │ assemble + preview
  │◄─ file-cancel (if receiver clicks Cancel) ──────────────────  │
  │── file-cancel (if sender clicks Cancel/Close) ──────────────► │
```

Chunk size: 512 KB. Targeted sends use ECDH P-256 + AES-256-GCM encryption.

## Trust / approval flow

- Unknown sender → `ApprovalModal` on receiver; chunks are **buffered** until decision
- **Allow & Trust** → `trustDevice(id)` in localStorage; future transfers auto-accepted
- **Allow once** → processes buffered chunks, no trust stored
- **Reject** → marks transferId in `rejectedRef`; buffered chunks are dropped
- **Cancel** (sender) → sends `file-cancel`; receiver clears approval queue + buffers

## Important implementation details

- `sendFileFromCard` in fixtures uses `[data-testid="device-card"]:has-text("name")` — DO NOT use the old `div:has(button):has-text(...)` selector; after a transfer the DOM has many matching ancestor divs (RECEIVED section, ACTIVE NODES panel, etc.)
- `DeviceCard` root div has `data-testid="device-card"`
- `TransferModal` root div has `data-testid="transfer-modal"`
- `cancelRef.current = true` stops the chunk loop; clicking Cancel/Close on `TransferModal` always sends `file-cancel` (even when showing "Close" on completed transfer)
- For **untrusted** devices, `file-end` is **always buffered** — `assembleAndDownload` is never called until approved. This means cancel is reliable even for tiny files.
- Device deduplication uses `stableId ?? id` so trust survives agent reconnects
- `reuseExistingServer: !process.env.CI` — e2e tests share the running dev server; real developer devices appear in the device list. Use `[data-testid="device-card"]:has-text("e2e-device-b")` scoped selectors, not broad ones.

## E2E tests (apps/e2e)

Run: `pnpm --filter @aether/e2e exec playwright test`

| File | Covers |
|------|--------|
| `cancel.spec.ts` | sender cancels → no preview on receiver |
| `clipboard.spec.ts` | clipboard broadcast arrives on receiver |
| `connection.spec.ts` | peer discovery, Send button, E2E badge after key exchange |
| `file-transfer.spec.ts` | accept (allow once) → download, received list; reject → no preview; progress panel |
| `trust.spec.ts` | Allow & Trust → second transfer skips approval |

All 9 tests pass. Workers: 1 (serial, shared WS server).

## Design rules (from design.md)

- Dark obsidian palette: `--background: #0e0e0f`, `--primary: #85adff` (electric blue), `--error: #ff716c`
- **No 1px borders** — separation via tonal shifts and negative space only
- Floating panels: glassmorphism (`surface_bright` 40% opacity + 24px backdrop-blur)
- Typography: Manrope (display/headlines) + Inter (body/UI)
- Metadata labels: all-caps, 0.05–0.1em letter-spacing (e.g. "FILE SIZE", "NODES DETECTED")
