# Voice messages (V2) — design

Status: approved in chat, 2026-10-12. Branch: `v2`.

## Goal

Send and play voice messages in the AIRV chat, behaving like WhatsApp on iPhone, while staying on
Firebase's free Spark plan (no Firebase Storage).

## Constraints

- iPhone-only PWA (Safari engine), used from the home screen and from Safari.
- Firebase project `chat-4d5f4` is on Spark: Realtime Database only (1 GB stored, 10 GB/month
  download). Storage needs Blaze and is not used. Database rules are open read/write.
- Two instances (`user1`, `user2`). Messages are deleted after they are read.
- Must not regress the keyboard behaviour on `v2` (fixed header, no iOS reveal-scroll, footer
  returns on blur, keyboard stays open on send, back closes keyboard first, multi-line box).

## User experience (WhatsApp behaviour)

Recording, from the mic button (shown when the message box is empty):

- **Hold** to record. The message field is replaced by a blinking red mic, a timer (`0:03`) and
  `‹ Slide to cancel`.
- **Release** sends the note.
- **Slide left** past the threshold cancels and discards it.
- **Slide up** locks recording; the finger can lift. Locked view: live waveform, timer, **delete**,
  **pause/resume** and **send**.
- **Quick tap** (no hold) shows the hint `Hold to record, release to send`.
- Notes shorter than **1 s** are discarded. Recording stops at **2 min** and the note is sent.
- No haptics (Safari exposes no vibration API on iPhone).

Voice bubble (inside the existing WhatsApp-style bubble, with tail, time and ticks):

- Play/pause button, waveform (~40 bars) that can be dragged to seek, duration (elapsed while
  playing), and a `1× / 1.5× / 2×` speed toggle.
- **Listened indicator:** for the sender, the waveform/mic turns blue once the other person has
  played the note.

## Data model

```
messages/{id}: { type: 'voice', sender, timestamp, expiresAt,
                 voice: { duration: <seconds>, waveform: [0..31 x ~40], mime: 'audio/mp4' } }
voice/{id}:    { data: '<base64 audio>', mime: 'audio/mp4' }
played/{id}/{user}: true            // listened indicator
```

- `messages/{id}` and `voice/{id}` are written in **one atomic multi-path update**, so a message
  never exists without its audio (or the reverse).
- The chat list subscription only carries the small `messages` entries; audio is fetched per note.
- Size: mono AAC at ~32 kbps, a 30 s note is about 120 KB (≈160 KB as base64). 2 min cap ≈ 640 KB.

## Components

- `src/hooks/useVoiceRecorder.js` — mic access (fresh `getUserMedia` stream per recording, all
  tracks stopped afterwards), `MediaRecorder` (`audio/mp4`, fallback `audio/webm;codecs=opus`,
  ~32 kbps), waveform sampling via `AnalyserNode` (~10/s, reduced to ~40 bars), timer, 1 s minimum,
  2 min cap, pause/resume, cancel. Returns state + `start / stop / cancel / pause / resume`.
- `src/components/VoiceRecorderBar.jsx` — the recording UI that replaces the message field:
  hold/slide-to-cancel/slide-up-to-lock gestures, locked controls, hint on quick tap.
- `src/components/VoiceBubble.jsx` — playback: prefetch when visible (IntersectionObserver), play
  on tap without awaiting (iOS only allows audio to start directly from a tap), seek by dragging the
  waveform, speed toggle, marks `played/{id}/{me}` on first play.
- `src/services/voiceService.js` — blob → base64, atomic save, load + cache as object URL, delete.
- Wiring: `ChatScreen` (mic button → recorder bar), `MessageBubble` (render `VoiceBubble` for
  `type: 'voice'`), `useMessages` (`sendVoice`, include `voice/{id}` and `played/{id}` in deletes,
  expose `played`).

## Errors and iPhone quirks

- **Permission denied:** note explaining how to allow the microphone in Settings; nothing sent.
- **iOS home-screen recording bug** (recording works once, fails after reopening): fresh stream
  per recording, tracks released afterwards; if a recording yields no audio data, show
  `Couldn't record — try again` and send nothing.
- **Audio not yet loaded on tap:** show a spinner in the play button and start playback when ready
  (second tap if iOS refuses to auto-start after loading).
- **Keyboard:** mic/recorder controls never take focus from the message box (same touchend
  pattern as the send button).
- **V1:** the live V1 app cannot render voice notes (shows an empty bubble). Test with both
  instances on the V2 preview.

## Testing

- Simulator harness (WebKit iPhone frame): gestures and layout with a stand-in recorder producing
  fake audio; save / load / play / delete against the harness's fake message service.
- Desktop Chromium with a fake microphone (`--use-fake-device-for-media-stream`) for the real
  `MediaRecorder` → save → load → play pipeline.
- Regression: all existing keyboard checks.
- Device: on the iPhone (home-screen app and Safari) — hold-send, slide-cancel, lock-send,
  playback, speed, listened indicator, permission prompt, and close-and-reopen the home-screen app
  then record again.

## Out of scope

Stickers (next feature), Firebase Storage, transcription, forwarding, voice notes in V1.
