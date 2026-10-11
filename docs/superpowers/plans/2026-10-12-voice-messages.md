# Voice Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record, send and play WhatsApp-style voice messages in the AIRV chat, stored in the Firebase Realtime Database (free Spark plan).

**Architecture:** Pure helpers (waveform, duration format, drag classification, retention) and a `voiceService` hold all logic that can be unit-tested. `useMessages` owns every database read/write and exposes `sendVoice / loadVoice / markVoicePlayed / played`, so UI components only take callbacks (and the simulator harness can fake them). `useVoiceRecorder` wraps the microphone; `VoiceRecorderBar` is the mic button plus the recording overlay; `VoiceBubble` plays a note inside the existing bubble.

**Tech Stack:** React 18, Vite 5, Firebase 10 (Realtime Database), Vitest (new, unit tests only), Playwright (existing simulator harness outside the repo).

**Spec:** `docs/superpowers/specs/2026-10-12-voice-messages-design.md`

## Global Constraints

- Branch `v2` only; `main` (live V1) is not touched.
- No Firebase Storage. Audio lives at `voice/{id}` as base64; the message entry at `messages/{id}` holds `type: 'voice'` and `voice: { duration, waveform, mime }`; listened state at `played/{id}/{user}`.
- `messages/{id}` and `voice/{id}` are written in ONE `update()` multi-path write.
- Recording: mono, `audioBitsPerSecond: 32000`, `audio/mp4` preferred, fallback `audio/webm;codecs=opus`, then `audio/webm`.
- Minimum note length 1 s (shorter: discard + hint `Hold to record, release to send`); maximum 120 s (auto-stop and send).
- Waveform: 40 bars, integers 0–31.
- Fresh `getUserMedia` stream per recording; all tracks stopped when recording ends.
- Mic and recorder controls must never take focus from the message box (touchend + `preventDefault`, as the send button does).
- Icon buttons: 44pt tap area and an `aria-label`.
- Colours from `src/styles/global.css` tokens (`--accent-green`, `--tick-read`, `--time-in`, `--time-out`, `--bubble-text`, `--chat-bar`, …).
- Commit identity: `-c user.name=guruprakashvadivelu -c user.email=guru.prakashhiha@gmail.com`; every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not use `--no-verify`; the IBM secret scanner must pass.

## Review Focus

1. **Recipient opens the chat but doesn't play a voice note, then leaves** → the note must NOT be deleted by the delete-after-read rule; it stays until played. (Task 3: `shouldDelete` tests.)
2. **Finger lifts before the microphone is ready** (permission prompt or slow start) → nothing is sent, the mic is released, no stuck "recording" UI. (Task 4: early-release check in the harness script.)
3. **Recording comes back empty** (the iOS home-screen bug) → `Couldn't record — try again`, nothing sent. (Task 4: `stop()` returns `null` + notice when the blob is empty.)
4. **Tapping play before the audio has downloaded** → spinner, then playback; never a silent no-op. (Task 5: harness check with delayed `loadVoice`.)
5. **Two voice notes played one after another** → starting one pauses the other. (Task 5: harness check.)

---

## File Structure

- Create `src/voice/waveform.js` — `reduceWaveform`, `rmsLevel`, `WAVEFORM_BARS`, `WAVEFORM_MAX`.
- Create `src/voice/format.js` — `formatDuration`.
- Create `src/voice/gesture.js` — `classifyDrag`, `CANCEL_DISTANCE`, `LOCK_DISTANCE`.
- Create `src/voice/retention.js` — `shouldDelete` (delete-after-read incl. voice "played" rule).
- Create `src/voice/*.test.js` — unit tests for the above.
- Create `src/services/voiceService.js` (+ `voiceService.test.js`) — base64, atomic save, cached load, mark played, limits.
- Create `src/hooks/useVoiceRecorder.js` — microphone + MediaRecorder + waveform + timer.
- Create `src/components/VoiceRecorderBar.jsx` — mic button, hold/slide/lock gestures, recording overlay.
- Create `src/components/VoiceBubble.jsx` — playback UI.
- Modify `src/hooks/useMessages.js` — `played` subscription, `sendVoice`, `loadVoice`, `markVoicePlayed`, deletes via `shouldDelete`, voice paths removed with the message, reply label.
- Modify `src/screens/ChatScreen.jsx` — replace placeholder mic with `VoiceRecorderBar`; pass voice props to bubbles; reply bar label.
- Modify `src/components/MessageBubble.jsx` — render `VoiceBubble` for `type: 'voice'`.
- Modify `src/screens/ChatListScreen.jsx` — last-message label `🎤 Voice message`.
- Modify `package.json` — `vitest` dev dependency + `test` script.
- Harness (outside repo, not committed): `%LOCALAPPDATA%\Temp\airv-harness\mockMessages.js` gains in-memory voice support; `%LOCALAPPDATA%\Temp\airv-iphone\verify-voice.mjs` drives Chromium with a fake microphone.

---

### Task 1: Vitest + pure voice helpers

**Files:**
- Modify: `package.json`
- Create: `src/voice/waveform.js`, `src/voice/format.js`, `src/voice/gesture.js`
- Test: `src/voice/waveform.test.js`, `src/voice/format.test.js`, `src/voice/gesture.test.js`

**Interfaces:**
- Produces: `reduceWaveform(samples: number[], bars = 40): number[]` (ints 0–31), `rmsLevel(timeDomain: Uint8Array): number` (0–1), `formatDuration(seconds: number): string` (`m:ss`), `classifyDrag(dx: number, dy: number): 'cancel' | 'lock' | 'none'`, constants `WAVEFORM_BARS=40`, `WAVEFORM_MAX=31`, `CANCEL_DISTANCE=110`, `LOCK_DISTANCE=70`.

- [ ] **Step 1: Install Vitest and add the script**

Run: `npm install -D vitest@2 --no-audit --no-fund`
Then in `package.json` scripts add `"test": "vitest run"` after `"preview"`.

- [ ] **Step 2: Write the failing tests**

`src/voice/waveform.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { reduceWaveform, rmsLevel, WAVEFORM_BARS, WAVEFORM_MAX } from './waveform';

describe('reduceWaveform', () => {
  it('returns 40 zero bars for no samples', () => {
    expect(reduceWaveform([])).toEqual(new Array(WAVEFORM_BARS).fill(0));
  });
  it('scales the loudest bar to the max and keeps the bar count', () => {
    const samples = Array.from({ length: 200 }, (_, i) => (i === 150 ? 0.8 : 0.1));
    const bars = reduceWaveform(samples);
    expect(bars).toHaveLength(WAVEFORM_BARS);
    expect(Math.max(...bars)).toBe(WAVEFORM_MAX);
    expect(bars.every(b => Number.isInteger(b) && b >= 0 && b <= WAVEFORM_MAX)).toBe(true);
  });
  it('stretches fewer samples than bars', () => {
    expect(reduceWaveform([0.5, 1])).toHaveLength(WAVEFORM_BARS);
  });
});

describe('rmsLevel', () => {
  it('is 0 for silence (128) and >0 for signal', () => {
    expect(rmsLevel(new Uint8Array(64).fill(128))).toBe(0);
    expect(rmsLevel(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0)))).toBeGreaterThan(0.9);
  });
});
```

`src/voice/format.test.js`:
```js
import { it, expect } from 'vitest';
import { formatDuration } from './format';

it('formats seconds as m:ss', () => {
  expect(formatDuration(0)).toBe('0:00');
  expect(formatDuration(7.9)).toBe('0:07');
  expect(formatDuration(65)).toBe('1:05');
  expect(formatDuration(120)).toBe('2:00');
  expect(formatDuration(-3)).toBe('0:00');
  expect(formatDuration(NaN)).toBe('0:00');
});
```

`src/voice/gesture.test.js`:
```js
import { it, expect } from 'vitest';
import { classifyDrag, CANCEL_DISTANCE, LOCK_DISTANCE } from './gesture';

it('classifies drags', () => {
  expect(classifyDrag(0, 0)).toBe('none');
  expect(classifyDrag(-CANCEL_DISTANCE, 0)).toBe('cancel');
  expect(classifyDrag(-(CANCEL_DISTANCE - 1), 0)).toBe('none');
  expect(classifyDrag(0, -LOCK_DISTANCE)).toBe('lock');
  expect(classifyDrag(-30, -LOCK_DISTANCE)).toBe('lock');            // mostly upward
  expect(classifyDrag(-CANCEL_DISTANCE, -40)).toBe('cancel');        // mostly left
  expect(classifyDrag(40, 40)).toBe('none');                         // right/down never act
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./waveform`, `./format`, `./gesture`.

- [ ] **Step 4: Implement**

`src/voice/waveform.js`:
```js
// Voice note waveform: ~10 RMS samples per second while recording, reduced to a fixed
// number of bars so bubbles can draw it without downloading the audio.
export const WAVEFORM_BARS = 40;
export const WAVEFORM_MAX = 31;

export function reduceWaveform(samples, bars = WAVEFORM_BARS) {
  if (!samples.length) return new Array(bars).fill(0);
  const peaks = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.floor((i * samples.length) / bars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / bars));
    let peak = 0;
    for (let j = start; j < end && j < samples.length; j++) peak = Math.max(peak, samples[j]);
    peaks.push(peak);
  }
  const max = Math.max(...peaks);
  return peaks.map(p => (max > 0 ? Math.round((p / max) * WAVEFORM_MAX) : 0));
}

// RMS of an AnalyserNode byte time-domain buffer (128 = silence), 0..1.
export function rmsLevel(timeDomain) {
  let sum = 0;
  for (const v of timeDomain) {
    const x = (v - 128) / 128;
    sum += x * x;
  }
  return Math.sqrt(sum / timeDomain.length);
}
```

`src/voice/format.js`:
```js
// Voice note duration as WhatsApp shows it: m:ss.
export function formatDuration(seconds) {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
```

`src/voice/gesture.js`:
```js
// While holding the mic: slide left to cancel, slide up to lock (WhatsApp). Distances in px.
export const CANCEL_DISTANCE = 110;
export const LOCK_DISTANCE = 70;

export function classifyDrag(dx, dy) {
  const left = -dx;
  const up = -dy;
  if (up >= LOCK_DISTANCE && up > left) return 'lock';
  if (left >= CANCEL_DISTANCE && left >= up) return 'cancel';
  return 'none';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (3 files).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/voice
git commit -m "Add voice helpers (waveform, duration, drag) with Vitest tests"
```

---

### Task 2: voiceService (base64, atomic save, cached load, played)

**Files:**
- Create: `src/services/voiceService.js`
- Test: `src/services/voiceService.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `VOICE_MIN_SECONDS = 1`, `VOICE_MAX_SECONDS = 120`
  - `blobToBase64(blob: Blob): Promise<string>` (no `data:` prefix)
  - `base64ToBlob(b64: string, mime: string): Blob`
  - `saveVoiceMessage(db, { sender, duration, waveform, mime, blob }): Promise<string>` → new message id
  - `loadVoiceUrl(db, id: string): Promise<string>` → object URL (cached per id)
  - `markPlayed(db, id: string, user: string): Promise<void>`
  - `voicePaths(id: string): string[]` → `['voice/{id}', 'played/{id}']`

- [ ] **Step 1: Write the failing test**

`src/services/voiceService.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = { update: [], get: [], set: [] };
vi.mock('firebase/database', () => ({
  ref: (db, path) => ({ path: path ?? '' }),
  push: r => ({ key: 'k1', path: `${r.path}/k1` }),
  update: vi.fn(async (r, values) => { calls.update.push([r.path, values]); }),
  set: vi.fn(async (r, v) => { calls.set.push([r.path, v]); }),
  get: vi.fn(async r => { calls.get.push(r.path); return { val: () => ({ data: btoa('abc'), mime: 'audio/mp4' }) }; }),
}));

const svc = await import('./voiceService');

beforeEach(() => { calls.update = []; calls.get = []; calls.set = []; });

describe('voiceService', () => {
  it('round-trips base64', async () => {
    const b64 = await svc.blobToBase64(new Blob(['abc'], { type: 'audio/mp4' }));
    expect(b64).toBe(btoa('abc'));
    const back = svc.base64ToBlob(b64, 'audio/mp4');
    expect(back.type).toBe('audio/mp4');
    expect(await back.text()).toBe('abc');
  });

  it('saves message and audio in one multi-path update', async () => {
    const id = await svc.saveVoiceMessage({}, {
      sender: 'user1', duration: 3.2, waveform: [1, 2], mime: 'audio/mp4', blob: new Blob(['abc']),
    });
    expect(id).toBe('k1');
    expect(calls.update).toHaveLength(1);
    const [path, values] = calls.update[0];
    expect(path).toBe('');
    expect(values['voice/k1']).toEqual({ data: btoa('abc'), mime: 'audio/mp4' });
    expect(values['messages/k1']).toMatchObject({
      type: 'voice', sender: 'user1', voice: { duration: 3.2, waveform: [1, 2], mime: 'audio/mp4' },
    });
  });

  it('loads audio once per id and returns an object URL', async () => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    const a = await svc.loadVoiceUrl({}, 'k9');
    const b = await svc.loadVoiceUrl({}, 'k9');
    expect(a).toBe('blob:x');
    expect(b).toBe('blob:x');
    expect(calls.get).toEqual(['voice/k9']);
  });

  it('marks played and lists voice paths', async () => {
    await svc.markPlayed({}, 'k1', 'user2');
    expect(calls.set).toEqual([['played/k1/user2', true]]);
    expect(svc.voicePaths('k1')).toEqual(['voice/k1', 'played/k1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/voiceService.test.js`
Expected: FAIL — cannot resolve `./voiceService`.

- [ ] **Step 3: Implement**

`src/services/voiceService.js`:
```js
import { ref, push, update, get, set } from 'firebase/database';

// Voice notes live in the Realtime Database (Spark plan has no Firebase Storage):
// messages/{id} holds the small entry the chat list syncs; voice/{id} holds the audio,
// fetched only when a note is about to be played.
export const VOICE_MIN_SECONDS = 1;
export const VOICE_MAX_SECONDS = 120;

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read recording'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function saveVoiceMessage(db, { sender, duration, waveform, mime, blob }) {
  const id = push(ref(db, 'messages')).key;
  const data = await blobToBase64(blob);
  const timestamp = Date.now();
  // One multi-path write: the message never exists without its audio, or the reverse.
  await update(ref(db), {
    [`messages/${id}`]: {
      type: 'voice', sender, timestamp, expiresAt: timestamp + 86400000,
      voice: { duration, waveform, mime },
    },
    [`voice/${id}`]: { data, mime },
  });
  return id;
}

const urlCache = new Map(); // id -> Promise<object URL>

export function loadVoiceUrl(db, id) {
  if (!urlCache.has(id)) {
    const promise = get(ref(db, `voice/${id}`)).then(snap => {
      const v = snap.val();
      if (!v?.data) throw new Error('Voice note not found');
      return URL.createObjectURL(base64ToBlob(v.data, v.mime || 'audio/mp4'));
    });
    promise.catch(() => urlCache.delete(id)); // let a later attempt retry
    urlCache.set(id, promise);
  }
  return urlCache.get(id);
}

export function markPlayed(db, id, user) {
  return set(ref(db, `played/${id}/${user}`), true);
}

export const voicePaths = id => [`voice/${id}`, `played/${id}`];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (4 files).

- [ ] **Step 5: Commit**

```bash
git add src/services/voiceService.js src/services/voiceService.test.js
git commit -m "Add voiceService: atomic save, cached load, played marker"
```

---

### Task 3: useMessages wiring, retention rule, labels

**Files:**
- Create: `src/voice/retention.js`, Test: `src/voice/retention.test.js`
- Modify: `src/hooks/useMessages.js` (subscriptions ~line 33, 24h expiry ~line 68-78, `deleteReadMessages` ~80-91, `sendMessage` replyTo ~103-108, return ~140)
- Modify: `src/screens/ChatListScreen.jsx:48-53`
- Modify: `src/screens/ChatScreen.jsx:36` (ReplyBar label)

**Interfaces:**
- Consumes: `saveVoiceMessage`, `loadVoiceUrl`, `markPlayed`, `voicePaths` (Task 2).
- Produces from `useMessages`: `played: { [id]: { [user]: true } }`, `sendVoice({ blob, duration, waveform, mime }): Promise<string>`, `loadVoice(id): Promise<string>`, `markVoicePlayed(id): Promise<void>`.
- Produces: `shouldDelete(msg, { reads, played, me, other }): boolean`.

- [ ] **Step 1: Write the failing test**

`src/voice/retention.test.js`:
```js
import { it, expect } from 'vitest';
import { shouldDelete } from './retention';

const ctx = (reads = {}, played = {}) => ({ reads, played, me: 'user2', other: 'user1' });

it('text: deletes once read by the recipient', () => {
  const msg = { id: 'a', sender: 'user1', text: 'hi' };
  expect(shouldDelete(msg, ctx())).toBe(false);
  expect(shouldDelete(msg, ctx({ a: { user2: true } }))).toBe(true);
});

it('voice: read but not played is kept; played is deleted', () => {
  const msg = { id: 'v', sender: 'user1', type: 'voice' };
  expect(shouldDelete(msg, ctx({ v: { user2: true } }))).toBe(false);
  expect(shouldDelete(msg, ctx({ v: { user2: true } }, { v: { user2: true } }))).toBe(true);
});

it('my own voice note is deleted only after the other side played it', () => {
  const msg = { id: 'm', sender: 'user2', type: 'voice' };
  expect(shouldDelete(msg, ctx({ m: { user1: true } }))).toBe(false);
  expect(shouldDelete(msg, ctx({ m: { user1: true } }, { m: { user1: true } }))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/voice/retention.test.js`
Expected: FAIL — cannot resolve `./retention`.

- [ ] **Step 3: Implement `retention.js`**

```js
// Delete-after-read: a message goes once the recipient has seen it. A voice note only
// counts as seen once it has been played, so opening the chat doesn't throw it away.
export function shouldDelete(msg, { reads, played, me, other }) {
  const recipient = msg.sender === me ? other : me;
  if (!reads[msg.id]?.[recipient]) return false;
  if (msg.type === 'voice') return !!played[msg.id]?.[recipient];
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (5 files).

- [ ] **Step 5: Wire `useMessages.js`**

Add imports at the top:
```js
import { saveVoiceMessage, loadVoiceUrl, markPlayed, voicePaths } from '../services/voiceService';
import { shouldDelete } from '../voice/retention';
```
Add state next to `reactions`:
```js
  const [played, setPlayed] = useState({});
```
In the subscription effect add, after the `reactions` listener, and include it in cleanup:
```js
    const u5 = onValue(ref(db, 'played'), snap => setPlayed(snap.val() || {}));
    return () => { u1(); u2(); u3(); u4(); u5(); };
```
Add a helper above `deleteReadMessages` and use it in BOTH the 24h-expiry loop and `deleteReadMessages`, replacing the three `remove(...)` lines in each:
```js
  const removeMessage = async id => {
    for (const path of [`messages/${id}`, `reads/${id}`, `reactions/${id}`, ...voicePaths(id)]) {
      await remove(ref(db, path));
    }
  };
```
Replace the `toDelete` filter in `deleteReadMessages`:
```js
    const toDelete = messages.filter(msg =>
      shouldDelete(msg, { reads, played, me: currentUser, other: selectedChat })
    );
    for (const msg of toDelete) await removeMessage(msg.id);
```
and add `played` to its dependency array. In the 24h expiry loop body use `await removeMessage(msg.id);`.

In `sendMessage`, make the reply label work for voice:
```js
        mediaType: replyTo.mediaType || (replyTo.type === 'voice' ? 'voice' : null),
```
Add the voice callbacks before `unreadCount`:
```js
  const sendVoice = useCallback(
    rec => saveVoiceMessage(db, { ...rec, sender: currentUser }),
    [currentUser]
  );
  const loadVoice = useCallback(id => loadVoiceUrl(db, id), []);
  const markVoicePlayed = useCallback(id => markPlayed(db, id, currentUser), [currentUser]);
```
Add `played, sendVoice, loadVoice, markVoicePlayed,` to the returned object.

- [ ] **Step 6: Labels**

`src/screens/ChatListScreen.jsx` in `formatLastMsg`, before the image line:
```js
    if (msg.type === 'voice') return '🎤 Voice message';
```
`src/screens/ChatScreen.jsx` ReplyBar line 36:
```js
          {replyTo.type === 'voice' ? '🎤 Voice message' : replyTo.mediaType ? `📎 ${replyTo.mediaType}` : replyTo.text}
```

- [ ] **Step 7: Build and test**

Run: `npm test && npm run build`
Expected: tests PASS, build `✓ built`.

- [ ] **Step 8: Commit**

```bash
git add src/voice/retention.js src/voice/retention.test.js src/hooks/useMessages.js src/screens/ChatListScreen.jsx src/screens/ChatScreen.jsx
git commit -m "Wire voice notes into useMessages; keep unplayed notes from delete-after-read"
```

---

### Task 4: Recording — useVoiceRecorder + VoiceRecorderBar

**Files:**
- Create: `src/hooks/useVoiceRecorder.js`, `src/components/VoiceRecorderBar.jsx`
- Modify: `src/screens/ChatScreen.jsx` (footer: replace the placeholder "Voice message" button; footer row gets `position: 'relative'`)
- Harness (not committed): `%LOCALAPPDATA%\Temp\airv-harness\mockMessages.js`, `%LOCALAPPDATA%\Temp\airv-iphone\verify-voice.mjs`

**Interfaces:**
- Consumes: `reduceWaveform`, `rmsLevel` (Task 1), `classifyDrag` (Task 1), `formatDuration` (Task 1), `VOICE_MIN_SECONDS`, `VOICE_MAX_SECONDS` (Task 2), `sendVoice` (Task 3).
- Produces:
  - `useVoiceRecorder({ onError, onLimit })` → `{ status: 'idle'|'starting'|'recording'|'paused', elapsed: number, levels: number[], start(): Promise<boolean>, stop(): Promise<Result|{tooShort:true}|null>, cancel(): void, pause(): void, resume(): void }` where `Result = { blob, duration, waveform, mime }`; `onError(kind)` with `kind` in `'permission'|'unavailable'|'empty'`.
  - `<VoiceRecorderBar onSend={(result) => Promise} onNotice={(text) => void} />` — renders the mic button; while recording it overlays the rest of the footer row.

- [ ] **Step 1: Harness support (fake service + verification script)**

In `mockMessages.js` add an in-memory voice store and return the new fields:
```js
const voiceStore = new Map();
// inside useMessages():
  const [played, setPlayed] = useState({});
  const sendVoice = useCallback(async ({ blob, duration, waveform, mime }) => {
    const id = 'v' + Date.now();
    voiceStore.set(id, URL.createObjectURL(blob));
    window.__sentVoice = { size: blob.size, duration, bars: waveform.length, mime };
    setMessages(m => [...m, { id, type: 'voice', sender: currentUser, timestamp: Date.now(), voice: { duration, waveform, mime } }]);
    return id;
  }, [currentUser]);
  const loadVoice = useCallback(async id => {
    await new Promise(r => setTimeout(r, window.__voiceDelay || 0));
    return voiceStore.get(id);
  }, []);
  const markVoicePlayed = useCallback(async id => setPlayed(p => ({ ...p, [id]: { user1: true } })), []);
// add to the returned object: played, sendVoice, loadVoice, markVoicePlayed
```
Create `verify-voice.mjs` (Chromium, fake mic) that: opens `http://localhost:5175/`, dispatches `touchstart` on `[aria-label="Record voice message"]`, waits 2.5 s, dispatches `touchend`, then prints `window.__sentVoice`, the last bubble's `type`, and checks: (a) hold+release sends (`size > 0`, `duration >= 2`, `bars === 40`); (b) touchstart then immediate touchend → no new message and hint text visible; (c) touchstart, touchmove `dx=-130` → cancelled, nothing sent; (d) touchstart, touchmove `dy=-90`, touchend → still recording (locked), then tap `[aria-label="Send voice message"]` → sent. Launch with `chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })`.

- [ ] **Step 2: Run the script to verify it fails**

Run: `node verify-voice.mjs` (in `%LOCALAPPDATA%\Temp\airv-iphone`)
Expected: FAIL — no element `[aria-label="Record voice message"]`.

- [ ] **Step 3: Implement `useVoiceRecorder.js`**

```js
import { useCallback, useEffect, useRef, useState } from 'react';
import { reduceWaveform, rmsLevel } from '../voice/waveform';
import { VOICE_MIN_SECONDS, VOICE_MAX_SECONDS } from '../services/voiceService';

const MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
const pickMime = () =>
  typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported
    ? MIME_CANDIDATES.find(m => MediaRecorder.isTypeSupported(m)) || ''
    : '';

/**
 * Microphone recording for voice notes. A fresh stream per recording, fully released
 * afterwards (also works around iOS home-screen apps failing to record after reopening).
 * stop() resolves { blob, duration, waveform, mime }, { tooShort: true }, or null.
 */
export function useVoiceRecorder({ onError, onLimit } = {}) {
  const [status, setStatus] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState([]);
  const rec = useRef({});
  const callbacks = useRef({ onError, onLimit });
  callbacks.current = { onError, onLimit };

  const seconds = () => {
    const s = rec.current;
    return (s.accumulated || 0) + (s.runningSince ? (performance.now() - s.runningSince) / 1000 : 0);
  };

  const release = () => {
    const s = rec.current;
    clearInterval(s.timer);
    clearInterval(s.sampler);
    s.stream?.getTracks().forEach(t => t.stop());
    s.ctx?.close().catch(() => {});
    rec.current = {};
    setStatus('idle');
    setElapsed(0);
    setLevels([]);
  };

  const stop = useCallback(() => new Promise(resolve => {
    const s = rec.current;
    if (!s.recorder) { // finger lifted before the mic was ready
      if (s.starting) s.abandoned = true;
      release();
      resolve(null);
      return;
    }
    const duration = seconds();
    s.recorder.onstop = () => {
      const blob = new Blob(s.chunks, { type: s.mime });
      const waveform = reduceWaveform(s.samples);
      release();
      if (duration < VOICE_MIN_SECONDS) { resolve({ tooShort: true }); return; }
      if (!blob.size) { callbacks.current.onError?.('empty'); resolve(null); return; }
      resolve({ blob, duration: Math.round(duration * 10) / 10, waveform, mime: s.mime });
    };
    s.recorder.stop();
  }), []);

  const start = useCallback(async () => {
    if (rec.current.recorder || rec.current.starting) return false;
    rec.current = { starting: true };
    setStatus('starting');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      release();
      callbacks.current.onError?.(err?.name === 'NotAllowedError' ? 'permission' : 'unavailable');
      return false;
    }
    if (rec.current.abandoned || !rec.current.starting) { stream.getTracks().forEach(t => t.stop()); release(); return false; }

    const mime = pickMime();
    const recorder = new MediaRecorder(stream, { ...(mime && { mimeType: mime }), audioBitsPerSecond: 32000 });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };

    let ctx, analyser, buffer;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      buffer = new Uint8Array(analyser.fftSize);
    } catch { analyser = null; }

    const samples = [];
    rec.current = {
      stream, recorder, chunks, ctx, samples, accumulated: 0,
      runningSince: performance.now(), mime: recorder.mimeType || mime || 'audio/mp4',
    };
    rec.current.sampler = setInterval(() => {
      if (!rec.current.runningSince) return;
      const level = analyser ? (analyser.getByteTimeDomainData(buffer), rmsLevel(buffer)) : 0;
      samples.push(level);
      setLevels(l => [...l.slice(-59), level]);
    }, 100);
    rec.current.timer = setInterval(() => {
      const s = seconds();
      setElapsed(s);
      if (s >= VOICE_MAX_SECONDS) stop().then(r => r && !r.tooShort && callbacks.current.onLimit?.(r));
    }, 200);
    recorder.start(250);
    setStatus('recording');
    return true;
  }, [stop]);

  const cancel = useCallback(() => {
    const s = rec.current;
    if (s.recorder) { s.recorder.onstop = () => {}; try { s.recorder.stop(); } catch {} }
    else if (s.starting) s.abandoned = true;
    release();
  }, []);

  const pause = useCallback(() => {
    const s = rec.current;
    if (!s.recorder || !s.runningSince) return;
    s.recorder.pause();
    s.accumulated += (performance.now() - s.runningSince) / 1000;
    s.runningSince = null;
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    const s = rec.current;
    if (!s.recorder || s.runningSince) return;
    s.recorder.resume();
    s.runningSince = performance.now();
    setStatus('recording');
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { status, elapsed, levels, start, stop, cancel, pause, resume };
}
```

- [ ] **Step 4: Implement `VoiceRecorderBar.jsx`**

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { classifyDrag, CANCEL_DISTANCE } from '../voice/gesture';
import { formatDuration } from '../voice/format';

const ICON_BUTTON = {
  width: '44px', height: '44px', flexShrink: 0, padding: 0, border: 'none', background: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};
const ERRORS = {
  permission: 'Allow microphone access in Settings › Safari to send voice messages',
  unavailable: 'Microphone not available',
  empty: "Couldn't record — try again",
};
const HINT = 'Hold to record, release to send';
const point = e => (e.touches?.[0] || e.changedTouches?.[0] || e);

/**
 * WhatsApp-style voice recording: hold the mic to record, release to send, slide left
 * to cancel, slide up to lock (then delete / pause / send). While active it overlays
 * the rest of the footer row (the row must be position: relative).
 */
export default function VoiceRecorderBar({ onSend, onNotice }) {
  const [locked, setLocked] = useState(false);
  const [dragX, setDragX] = useState(0);
  const micRef = useRef(null);
  const gesture = useRef(null); // { x, y, done }
  const recorder = useVoiceRecorder({
    onError: kind => onNotice(ERRORS[kind]),
    onLimit: result => { setLocked(false); onSend(result); },
  });
  const active = recorder.status !== 'idle';

  const finish = async send => {
    setLocked(false);
    setDragX(0);
    if (!send) { recorder.cancel(); return; }
    const result = await recorder.stop();
    if (result?.tooShort) onNotice(HINT);
    else if (result) onSend(result);
  };

  // Native listeners: touch handlers must be non-passive to keep focus in the message box.
  useEffect(() => {
    const el = micRef.current;
    if (!el) return;
    const onStart = e => {
      e.preventDefault();
      if (locked) return;
      const p = point(e);
      gesture.current = { x: p.clientX, y: p.clientY, done: false };
      recorder.start();
    };
    const onMove = e => {
      const g = gesture.current;
      if (!g || g.done) return;
      const p = point(e);
      const dx = p.clientX - g.x;
      const dy = p.clientY - g.y;
      setDragX(Math.min(0, dx));
      const action = classifyDrag(dx, dy);
      if (action === 'cancel') { g.done = true; finish(false); }
      if (action === 'lock') { g.done = true; setDragX(0); setLocked(true); }
    };
    const onEnd = e => {
      e.preventDefault();
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.done) return;
      finish(true);
    };
    const onCancel = () => { gesture.current = null; finish(false); };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onCancel);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  });

  const tap = handler => ({
    onMouseDown: e => e.preventDefault(),
    onTouchEnd: e => { e.preventDefault(); handler(); },
    onClick: handler,
  });

  return (
    <>
      {active && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, right: '50px', background: 'var(--chat-bar)', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 10px', zIndex: 5 }}>
          {locked ? (
            <>
              <button aria-label="Delete recording" style={ICON_BUTTON} {...tap(() => finish(false))}>
                <svg width="22" height="22" fill="none" stroke="var(--icon)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
              </button>
              <span style={{ color: 'var(--bubble-text)', fontSize: '14px', minWidth: '36px' }}>{formatDuration(recorder.elapsed)}</span>
              <div aria-hidden="true" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', height: '28px', overflow: 'hidden', justifyContent: 'flex-end' }}>
                {recorder.levels.map((l, i) => (
                  <span key={i} style={{ width: '2px', borderRadius: '1px', background: 'var(--time-in)', height: `${3 + Math.min(1, l * 4) * 22}px`, flexShrink: 0 }} />
                ))}
              </div>
              <button aria-label={recorder.status === 'paused' ? 'Resume recording' : 'Pause recording'} style={ICON_BUTTON}
                {...tap(() => (recorder.status === 'paused' ? recorder.resume() : recorder.pause()))}>
                {recorder.status === 'paused'
                  ? <svg width="22" height="22" fill="#e5484d" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/></svg>
                  : <svg width="22" height="22" fill="var(--icon)" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>}
              </button>
            </>
          ) : (
            <>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#e5484d', animation: 'voice-blink 1s infinite' }} />
              <span style={{ color: 'var(--bubble-text)', fontSize: '15px', minWidth: '40px' }}>{formatDuration(recorder.elapsed)}</span>
              <span style={{ flex: 1, textAlign: 'center', color: 'var(--time-in)', fontSize: '14px', transform: `translateX(${dragX}px)`, opacity: 1 - Math.min(1, -dragX / CANCEL_DISTANCE) }}>
                ‹ Slide to cancel
              </span>
            </>
          )}
        </div>
      )}

      {/* Lock hint above the mic while holding */}
      {active && !locked && (
        <div aria-hidden="true" style={{ position: 'absolute', right: '10px', bottom: '58px', width: '32px', padding: '8px 0', borderRadius: '16px', background: 'var(--bubble-in)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 5 }}>
          <svg width="16" height="16" fill="none" stroke="var(--icon)" strokeWidth="1.8" strokeLinecap="round" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          <svg width="12" height="12" fill="none" stroke="var(--time-in)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>
        </div>
      )}

      {locked ? (
        <button aria-label="Send voice message" style={ICON_BUTTON} {...tap(() => finish(true))}>
          <span style={{ width: '33px', height: '33px', borderRadius: '50%', background: 'var(--accent-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" fill="#0b1a10" viewBox="0 0 24 24"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.39 1.17L4.5 12l-2.49 7.23a1 1 0 001.39 1.17z"/></svg>
          </span>
        </button>
      ) : (
        <button ref={micRef} aria-label="Record voice message" style={{ ...ICON_BUTTON, touchAction: 'none' }} onClick={() => onNotice(HINT)}>
          <span style={{ width: active ? '44px' : '33px', height: active ? '44px' : '33px', borderRadius: '50%', background: 'var(--accent-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width .12s, height .12s' }}>
            <svg width="20" height="20" fill="none" stroke="#0b1a10" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
              <rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>
            </svg>
          </span>
        </button>
      )}
    </>
  );
}
```
Add to `src/styles/global.css`:
```css
@keyframes voice-blink { 50% { opacity: 0.2; } }
```

- [ ] **Step 5: Wire into `ChatScreen.jsx`**

Import `VoiceRecorderBar` and take `sendVoice` from `useMessages`. Generalise the notice helper (replace `showComingSoon`'s body):
```jsx
  const showNotice = (text, ms = 1600) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), ms);
  };
  const showComingSoon = feature => showNotice(`${feature} — coming soon`);
```
Give the footer row `position: 'relative'`. Replace the placeholder voice button (the `aria-label="Voice message"` button in the `hasText ? … : …` branch) with:
```jsx
            <VoiceRecorderBar
              onSend={result => sendVoice(result).catch(() => showNotice("Couldn't send voice message", 2500))}
              onNotice={text => showNotice(text, 2500)}
            />
```

- [ ] **Step 6: Run the harness script to verify it passes**

Run: `npm run build` then `node verify-voice.mjs`
Expected: (a) sent with `size > 0`, `duration ≈ 2.5`, `bars 40`; (b) hint shown, nothing sent; (c) cancelled, nothing sent; (d) locked then sent. Also re-run the keyboard regression set (`SHOT_TIMELINE`, `SHOT_CLOSE_TIMELINE`, `SHOT_BACK`, `SHOT_SEND`, `SHOT_MULTILINE`) — all unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useVoiceRecorder.js src/components/VoiceRecorderBar.jsx src/screens/ChatScreen.jsx src/styles/global.css
git commit -m "Record voice notes: hold to record, slide to cancel, slide up to lock"
```

---

### Task 5: Playback — VoiceBubble

**Files:**
- Create: `src/components/VoiceBubble.jsx`
- Modify: `src/components/MessageBubble.jsx` (text branch of `bubbleContent`; memo comparator; props)
- Modify: `src/screens/ChatScreen.jsx` (pass `played`, `loadVoice`, `markVoicePlayed` to bubbles)

**Interfaces:**
- Consumes: `formatDuration`, `WAVEFORM_MAX` (Task 1); `played`, `loadVoice`, `markVoicePlayed` (Task 3).
- Produces: `<VoiceBubble msg isMine listened loadVoice onPlayed />` where `listened` is the other person's played flag for my notes, and my played flag for theirs.

- [ ] **Step 1: Extend `verify-voice.mjs` with playback checks**

After a note is sent: (e) tap `[aria-label="Play voice message"]` → within 1 s the `<audio>` tied to the bubble has `currentTime > 0` and the button label becomes `Pause voice message`; (f) set `window.__voiceDelay = 800`, send another note, tap play immediately → a spinner (`[data-voice-loading]`) is shown, then playback starts; (g) start note 1 then note 2 → note 1 is paused; (h) speed button cycles `1×`→`1.5×`→`2×`→`1×` and `audio.playbackRate` matches.

- [ ] **Step 2: Run to verify it fails**

Run: `node verify-voice.mjs`
Expected: FAIL at (e) — no `[aria-label="Play voice message"]`.

- [ ] **Step 3: Implement `VoiceBubble.jsx`**

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../voice/format';
import { WAVEFORM_MAX } from '../voice/waveform';

const SPEEDS = [1, 1.5, 2];
let nowPlaying = null; // only one voice note plays at a time

/** Voice note playback inside a message bubble (WhatsApp style). */
export default function VoiceBubble({ msg, isMine, listened, loadVoice, onPlayed }) {
  const { duration = 0, waveform = [] } = msg.voice || {};
  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const [url, setUrl] = useState(null);
  const [wantPlay, setWantPlay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);

  const audio = () => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = 'auto';
      a.ontimeupdate = () => setTime(a.currentTime);
      a.onplay = () => setPlaying(true);
      a.onpause = () => setPlaying(false);
      a.onended = () => { setPlaying(false); setTime(0); };
      audioRef.current = a;
    }
    return audioRef.current;
  };

  // Prefetch when the bubble scrolls into view, so a tap can start playback immediately
  // (iOS only lets audio start directly from a tap, not after an await).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || url) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        io.disconnect();
        loadVoice(msg.id).then(u => { audio().src = u; setUrl(u); }).catch(() => {});
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [msg.id, url]);

  const play = () => {
    const a = audio();
    if (nowPlaying && nowPlaying !== a) nowPlaying.pause();
    nowPlaying = a;
    a.playbackRate = speed;
    a.play().then(() => { if (!isMine && !listened) onPlayed(msg.id); }).catch(() => {});
  };

  // Tapped before the audio arrived: start as soon as it does.
  useEffect(() => {
    if (url && wantPlay) { setWantPlay(false); play(); }
  }, [url, wantPlay]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = () => {
    if (playing) { audio().pause(); return; }
    if (!url) { setWantPlay(true); loadVoice(msg.id).then(u => { audio().src = u; setUrl(u); }).catch(() => setWantPlay(false)); return; }
    play();
  };

  const seek = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.touches?.[0] || e.changedTouches?.[0] || e).clientX;
    const ratio = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
    if (url) { audio().currentTime = ratio * duration; setTime(ratio * duration); }
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const progress = duration ? time / duration : 0;
  const loading = wantPlay && !url;

  return (
    <div ref={rootRef} style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px', padding: '2px 0' }}>
      <button aria-label={playing ? 'Pause voice message' : 'Play voice message'} onClick={toggle} {...(loading && { 'data-voice-loading': '' })}
        style={{ width: '36px', height: '36px', flexShrink: 0, border: 'none', background: 'none', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        {loading
          ? <span style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          : playing
            ? <svg width="24" height="24" fill="var(--bubble-text)" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
            : <svg width="24" height="24" fill="var(--bubble-text)" viewBox="0 0 24 24"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div role="slider" aria-label="Voice message position" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)}
          onClick={seek} onTouchMove={seek}
          style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '26px', cursor: 'pointer' }}>
          {waveform.map((v, i) => (
            <span key={i} style={{ flex: 1, maxWidth: '3px', borderRadius: '1.5px', height: `${3 + (v / WAVEFORM_MAX) * 21}px`, background: i / waveform.length < progress ? 'var(--bubble-text)' : 'rgba(255,255,255,0.4)' }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
          <svg aria-label={listened ? 'Listened' : 'Not listened yet'} width="12" height="12" fill="none" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"
            stroke={isMine ? (listened ? 'var(--tick-read)' : (isMine ? 'var(--time-out)' : 'var(--time-in)')) : (listened ? 'var(--time-in)' : 'var(--accent-green)')}>
            <rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>
          </svg>
          <span style={{ color: isMine ? 'var(--time-out)' : 'var(--time-in)', fontSize: '11px' }}>{formatDuration(playing || time ? time : duration)}</span>
        </div>
      </div>
      <button aria-label={`Playback speed ${speed}×`} onClick={cycleSpeed}
        style={{ flexShrink: 0, minWidth: '36px', height: '24px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.15)', color: 'var(--bubble-text)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
        {speed}×
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Render it from `MessageBubble.jsx`**

Import `VoiceBubble`. Extend the component props with `voiceListened, loadVoice, onVoicePlayed`. In `bubbleContent`, before `{msg.text && (`, add:
```jsx
      {msg.type === 'voice' && (
        <>
          <VoiceBubble msg={msg} isMine={isMine} listened={voiceListened} loadVoice={loadVoice} onPlayed={onVoicePlayed} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '3px', marginTop: '-2px' }}>
            <span style={{ color: isMine ? 'var(--time-out)' : 'var(--time-in)', fontSize: '11px' }}>{timeStr}</span>
            {isMine && <Ticks isRead={isRead} />}
          </div>
        </>
      )}
```
Add to the memo comparator: `prev.voiceListened === next.voiceListened &&`.

- [ ] **Step 5: Pass props from `ChatScreen.jsx`**

Take `played, loadVoice, markVoicePlayed` from `useMessages`; on `<MessageBubble …>` add:
```jsx
                voiceListened={!!played[item.msg.id]?.[item.msg.sender === currentUser ? selectedChat : currentUser]}
                loadVoice={loadVoice}
                onVoicePlayed={markVoicePlayed}
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run build && node verify-voice.mjs`
Expected: (a)–(h) PASS. Simulator screenshot (WebKit iPhone frame) of a voice bubble next to text bubbles looks WhatsApp-like. Keyboard regression set unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/components/VoiceBubble.jsx src/components/MessageBubble.jsx src/screens/ChatScreen.jsx
git commit -m "Play voice notes: waveform, seek, speed, listened indicator"
```

---

### Task 6: Ship to the preview and device check

**Files:** none (deploy + manual verification)

- [ ] **Step 1: Push and wait for the preview**

```bash
git push origin v2
```
Poll `https://v2--myaivalidator.netlify.app/` until the new bundle contains `Record voice message`.

- [ ] **Step 2: iPhone checklist (user, home-screen app and Safari)**

Both instances on the V2 preview. Check: first record → permission prompt; hold-release sends; quick tap shows hint; slide left cancels; slide up locks, pause/resume, delete, send; incoming note plays, seek, speed; sender sees blue mic after the other side plays; unplayed note survives leaving and reopening the chat; close the home-screen app fully, reopen, record again (iOS bug check); keyboard behaviour unchanged.
