# Calls Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WhatsApp-style 1:1 audio/video calls (both apps open) over WebRTC, Firebase signaling, optional Cloudflare TURN.

**Architecture:** Pure `callModel` (tested) + injectable signaling adapter (`firebaseSignaling` in the app, a shared BroadcastChannel fake in the harness) + `useCall`/`CallProvider` at App level + `CallScreen` UI + `turn-credentials` Netlify Function.

**Tech Stack:** React 18, WebRTC, Firebase RTDB, Netlify Functions, Vitest, Playwright (Chromium fake media).

**Spec:** `docs/superpowers/specs/2026-10-12-calls-phase1-design.md`

## Global Constraints

- Ring timeout 30 s (`RING_TIMEOUT_MS = 30000`; the harness may shorten via `window.__ringTimeoutMs`).
- `calls/active` record shape exactly as in the spec; `kind` ∈ `audio|video`; `endReason` ∈ `hangup|declined|missed|cancelled|failed|busy`.
- getUserMedia called directly from the tap (start/accept) — iOS requires a user gesture.
- Video elements: `autoplay playsInline`, local preview `muted` and mirrored.
- TURN credentials never cached at the edge (`Cache-Control: no-store`); port-53 URLs dropped.
- Fallback ICE servers: `stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`.
- Caller writes the chat log entry (once) when the call ends.
- Commit identity/trailer as before; no `--no-verify`.

## Review Focus

1. **Both press call at the same moment** (glare) → one call survives, the other side sees it as incoming; no two half-calls. (Task 3 harness: simultaneous start.)
2. **Callee opens the app minutes after a missed call** (stale ringing record) → no ghost incoming screen. (Task 1 `isIncomingFor` staleness test.)
3. **Camera permission denied on accept** → caller is told (declined/failed), callee isn't stuck on a black screen. (Task 3: getUserMedia rejection path.)
4. **Remote side vanishes** (closes app mid-call) → call ends within a few seconds via `connectionState` `failed`/`disconnected` timeout, not a frozen screen. (Task 3: close callee page.)
5. **Cloudflare returns an error or is slow** → calls still start with STUN. (Task 2 function test.)

## Tasks

### Task 1: callModel (pure) — `src/calls/callModel.js` (+ test)
Produces: `RING_TIMEOUT_MS`, `newCall({from,to,kind,now}) → active`, `isIncomingFor(active, me, now) → bool`,
`callOutcome(active) → { outcome: 'completed'|'missed'|'declined'|'cancelled'|'failed', duration: seconds }`,
`callLogText({kind, outcome, duration}) → string`, `filterIceServers(iceServers) → iceServers` (drops `:53` URLs, keeps entries with remaining URLs).
TDD: tests first (ringing/accepted/ended cases, staleness, each outcome's text with icon, duration formatting via `formatDuration`, port filtering for string and array `urls`).

### Task 2: shared origin check + turn-credentials function
- Move `allowedRequest` to `netlify/lib/origin.mjs`… **ruling at execution:** Netlify bundles any file under the functions directory as a function, so shared code lives in `src/server/origin.js`; `link-preview.mjs` re-exports it (existing tests unchanged).
- `netlify/functions/turn-credentials.mjs`: GET; 403 for disallowed callers; env missing → `{ iceServers: FALLBACK }`; else POST `https://rtc.live.cloudflare.com/v1/turn/keys/${KEY_ID}/credentials/generate-ice-servers` with `Authorization: Bearer ${TOKEN}`, body `{"ttl":86400}`, 5 s timeout → `{ iceServers: filterIceServers(json.iceServers) }`; any failure → fallback. Headers `Cache-Control: no-store`.
TDD: tests with injected env + fetch.

### Task 3: signaling adapter + useCall/CallProvider + CallScreen + wiring
- `src/calls/firebaseSignaling.js` — `createFirebaseSignaling(db, me)` → `{ watchActive(cb) → unsub, startCall(active, offer), accept(id, answer, acceptedAt), end(id, reason, endedAt), watchSignal(id, cb) → unsub (offer/answer), addCandidate(id, user, cand), watchCandidates(id, user, cb) → unsub, clear(id), logCall(entry) }`.
- `src/calls/useCall.js` — `CallProvider({ me, other, signaling, children })`, `useCallActions()` → `{ startCall(kind) }`, `useCallState()` for the screen.
- `src/components/CallScreen.jsx` — outgoing/incoming/connected UI with aria-labels: `Accept call`, `Decline call`, `End call`, `Mute`/`Unmute`, `Turn camera off`/`on`, `Switch camera`.
- Wiring: `App.jsx` wraps the logged-in UI in `CallProvider`; `ChatScreen` header buttons call `startCall('video'|'audio')`; `MessageBubble` renders `type: 'call'` with `callLogText`.
- Harness: vite plugin maps `/calls/firebaseSignaling` → `fakeSignaling.js` (BroadcastChannel + shared state per browser context); `main.jsx` reads `?me=user2`; wraps ChatScreen in `CallProvider`.
- `verify-calls.mjs` (two pages, fake media): video connect (both remote videos have frames), audio connect, decline, cancel, missed (timeout shortened), remote hang-up, mute/camera toggle reflected in track.enabled, glare, callee page closed mid-call → caller ends, call log entries.
TDD: harness script first (RED), then implementation (GREEN), plus regressions.

### Task 4: deploy + verify
Push; `curl` deployed `turn-credentials` (allowed origin → STUN fallback while unconfigured; other origin → 403); device test on two iPhones.
