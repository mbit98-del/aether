# Aether Improvement Roadmap

This document proposes product improvements that preserve Aether's core principles:

- LAN-fast
- deterministic behavior
- local-first
- minimal protocol complexity

## 1) High-impact UX improvements (next)

### 1.1 Receive-side file preview upgrades

**Why:** Receiving files currently has a preview + download flow, but confidence can be improved before users accept/save.

**Ideas:**
- Add richer previews for image/video/text when metadata is available.
- Show `sender`, `file type`, `size`, and `transfer duration` in a compact summary.
- Add "Open folder after download" option (agent-capable targets only).

**Implementation-safe areas:**
- `apps/web/src/components/FilePreviewModal.tsx`
- `apps/web/src/pages/Dashboard.tsx`

### 1.2 Transfer speed + ETA quality

**Why:** Users need trust in progress signals and completion predictability.

**Ideas:**
- Compute moving-average throughput over last N chunks (avoid noisy instantaneous speed).
- Display both current speed and stabilized ETA in `TransferModal`.
- Show a "network jitter" indicator when ETA confidence is low.

**Implementation-safe areas:**
- `apps/web/src/components/TransferModal.tsx`
- `apps/web/src/lib/activity-bus.ts`

### 1.3 Clipboard UX controls

**Why:** Clipboard sync is core value; UX should feel deliberate and safe.

**Ideas:**
- Add per-device clipboard auto-sync toggles.
- Add "sync plaintext only" mode to strip formatting.
- Add temporary pause (15m/1h) without disconnecting.

**Implementation-safe areas:**
- `apps/web/src/pages/Portal.tsx`
- `apps/web/src/pages/Settings.tsx`

---

## 2) Control & reliability improvements

### 2.1 Transfer cancel with synchronized state

**Why:** Partial transfer handling should be explicit for both sender and receiver.

**Ideas:**
- Add a `transfer-cancel` message with `transferId`, `from`, `to`.
- Receiver marks transfer as canceled and discards partial chunks.
- Sender surfaces "Canceled by receiver" vs "Canceled locally" distinctly.

**Guardrails:**
- Keep message additive (no protocol break).
- Preserve chunk decode-per-chunk behavior.

### 2.2 Resume-friendly transfers (optional)

**Why:** Large LAN transfers can fail on transient disconnects.

**Ideas:**
- Add optional resume token: receiver requests missing chunk indices.
- Sender retransmits only missing chunks.

**Note:** This adds complexity; consider after cancel support is stable.

### 2.3 Approval flow quality

**Why:** Trust gating is a critical security UX.

**Ideas:**
- Include a clear risk summary in `ApprovalModal` (trusted persistence implications).
- Add bulk actions for repeated unknown sender prompts in short windows.

---

## 3) Local-first product polish

### 3.1 Activity persistence with compact retention

**Why:** Users want short-term memory of transfers/events across refreshes.

**Ideas:**
- Persist activity log in localStorage with rolling retention (e.g. last 500 entries).
- Add filters for clipboard/file/error/system.

### 3.2 File icons and quick-recognition metadata

**Why:** Faster scanning in history and active transfer lists.

**Ideas:**
- MIME-based icon mapping.
- Badge states: encrypted, trusted sender, unknown sender.

### 3.3 Device quality indicators

**Why:** Helps users understand "why this feels slow".

**Ideas:**
- Last seen age + latency trend.
- "Likely on same subnet" hint when detectable.

---

## 4) Suggested milestone plan

### Milestone A (1 sprint)
- Better speed/ETA modeling in `TransferModal`.
- File preview metadata polish.
- Clipboard pause + per-device toggle.

### Milestone B (1 sprint)
- Transfer cancel end-to-end.
- Activity persistence + filters.
- Approval modal risk UX improvements.

### Milestone C (stretch)
- Resume-friendly chunk retry.
- Advanced device quality indicators.

---

## 5) Guardrails to keep Aether deterministic

- Do not change base message semantics unless additive and backward-compatible.
- Avoid hidden background retries that can cause duplicated effects.
- Continue echo-loop guards for clipboard (`lastClipboard`, remote-source tracking).
- Keep encryption conditional only when `targetId && sharedKey`.

---

## 6) Quick win feature candidates

1. **Clipboard snippet history in Portal** (last 10, one-click resend).
2. **"Send again" for recent files** using metadata cache (not file persistence).
3. **One-click trust revoke** from active device list.
4. **Transfer error reason taxonomy** (permission denied, disconnected, canceled, checksum mismatch).
5. **Accessibility pass** on modals (focus trap + keyboard actions).

These provide immediate user value with low protocol risk.
