import { ref, push, update, get, set } from 'firebase/database';

// Voice notes live in the Realtime Database (Spark plan has no Firebase Storage):
// messages/{id} holds the small entry the chat list syncs; voice/{id} holds the audio,
// fetched only when a note is about to be played.
export const VOICE_MIN_SECONDS = 1;
export const VOICE_MAX_SECONDS = 120;

export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  // Chunked so long notes don't exceed the argument limit of String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
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

// Everything stored for these messages, as one multi-path update (null deletes a path).
export const deletionUpdate = ids => Object.fromEntries(
  ids.flatMap(id => [`messages/${id}`, `reads/${id}`, `reactions/${id}`, ...voicePaths(id)].map(p => [p, null]))
);
