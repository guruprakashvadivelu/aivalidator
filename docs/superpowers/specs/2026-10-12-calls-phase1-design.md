# Audio & video calls, phase 1 (V2) — design

Status: approved in chat, 2026-10-12. Branch: `v2`.

## Goal

WhatsApp-style one-to-one audio and video calls between the two AIRV instances while both apps
are open, connecting over mobile data via Cloudflare's TURN relay when configured.

## Decisions

- Keep Netlify (hosting + functions) and Firebase (chat data). Cloudflare is used only for TURN.
- Relay is optional: without Cloudflare env vars calls use public STUN (works on most Wi-Fi);
  adding `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_API_TOKEN` in Netlify enables the relay
  with no code change. The key never reaches the app; the function hands out 24 h credentials.
- Phase 2 (later): push notification for incoming calls when the app is closed.

## iPhone limits (accepted)

- Rings only while AIRV is open on the callee's phone.
- The call may stop if either side backgrounds the app or locks the phone.
- The ringtone may be silent until the user has tapped the app since opening it.
- No earpiece/speaker switch (not available to web apps).
- Screen kept awake during calls via the Screen Wake Lock API where supported.

## User experience

- Header 📹 / 📞 buttons start a video / audio call (replacing the "coming soon" notes).
- **Outgoing:** name, "Calling…", cancel; for video, own camera preview behind.
- **Incoming:** shown on any screen after login — name, "Video call"/"Audio call", Decline (red),
  Accept (green), ringtone.
- **Connected:** video — remote full-screen, own camera small in a corner (mirrored);
  audio — avatar, name, timer. Controls: mute, camera on/off and flip (video), end.
- Unanswered after **30 s** → missed. Remote hang-up, decline or connection failure end the call
  with a short status ("Call ended", "Declined", "No answer", "Call failed").
- **Chat log:** a call entry from the caller's side — "📹 Video call · 3:42", "📞 Audio call · 0:12",
  "Missed video call", "Declined audio call", "Cancelled call", "Call failed".

## Architecture

- **Signaling in Firebase:** `calls/active` = `{ id, from, to, kind, state: 'ringing'|'accepted'|'ended',
  startedAt, acceptedAt?, endedAt?, endReason? }`; `calls/signal/{id}/offer`, `/answer`,
  `/candidates/{user}/{pushId}`. One active call at a time (two users). Signal data removed when a
  call ends; `calls/active` is overwritten by the next call.
- **WebRTC:** one `RTCPeerConnection`, trickle ICE, offer from caller, answer from callee;
  candidates queued until the remote description is set.
- **Modules:**
  - `src/calls/callModel.js` (pure, tested): new call record, incoming check incl. 30 s staleness,
    call outcome/duration, chat-log text, ICE server filtering (drop port 53).
  - `src/calls/firebaseSignaling.js`: the Firebase adapter (watch/set/update active, offer, answer,
    candidates, clear, log call). Injected, so the harness can swap in a shared fake.
  - `src/calls/useCall.js` + `CallProvider`: state machine, media, peer connection, ringtone, wake
    lock; mounted at App level so incoming calls show on any screen. `useCallActions()` exposes
    `startCall(kind)` to the chat header.
  - `src/components/CallScreen.jsx`: outgoing / incoming / connected UI.
  - `netlify/functions/turn-credentials.mjs`: same caller check as link previews (shared module),
    Cloudflare `generate-ice-servers` (ttl 86400), port-53 URLs filtered, `Cache-Control: no-store`,
    STUN fallback when unconfigured or Cloudflare fails.
  - `MessageBubble`: renders `type: 'call'` entries.

## Errors

- Camera/mic permission denied → notice, call not started (caller) or declined with reason (callee).
- Peer connection `failed` → end with reason `failed`.
- Callee opens the app to a stale ringing record (> 30 s) → ignored.
- Starting a call while one is active → ignored with a notice.

## Testing

- Vitest: `callModel`, `turn-credentials` (no env → STUN; env → Bearer request, port 53 filtered;
  Cloudflare error → STUN; bad origin → 403), shared origin check.
- Harness: two Chromium pages (user1, user2) with fake camera/mic and a shared fake signaling
  channel: video call connect (remote video plays on both), audio call, decline, cancel, missed
  after timeout (shortened in harness), remote hang-up, mute/camera toggles, chat log entries.
  Regressions: keyboard, voice, long-press, previews.
- Deployed: `turn-credentials` returns STUN without env vars, Cloudflare servers once configured.
- Device: two iPhones (home-screen apps), Wi-Fi and mobile data.
