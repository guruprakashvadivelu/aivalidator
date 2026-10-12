import { ref, onValue, onChildAdded, push, remove, runTransaction, set } from 'firebase/database';
import { RING_TIMEOUT_MS, callLogText } from './callModel';

// Call signaling through Firebase: calls/active (one call at a time, two users) and
// calls/signal/{id}/{offer, answer, candidates/{user}}. Injected into CallProvider so the
// test harness can swap in a fake with the same shape.
export function createFirebaseSignaling(db, me) {
  const activeRef = ref(db, 'calls/active');
  const signalPath = id => `calls/signal/${id}`;
  // Only a fresh ringing call blocks a new one. An idle caller can't be in an accepted call, so an
  // accepted record left behind by a crashed app is dead and may be replaced.
  const busy = cur => !!cur && cur.state === 'ringing' && Date.now() - cur.startedAt <= RING_TIMEOUT_MS;
  const guarded = async (id, change) => {
    const res = await runTransaction(activeRef, cur => (cur && cur.id === id ? change(cur) : undefined));
    return res.committed;
  };

  return {
    watchActive: cb => onValue(activeRef, snap => cb(snap.val())),

    async startCall(active, offer) {
      await set(ref(db, `${signalPath(active.id)}/offer`), offer);
      const res = await runTransaction(activeRef, cur => (busy(cur) ? undefined : active));
      if (!res.committed) await remove(ref(db, signalPath(active.id)));
      return res.committed;
    },

    async accept(id, answer, acceptedAt) {
      await set(ref(db, `${signalPath(id)}/answer`), answer);
      return guarded(id, cur => (cur.state === 'ringing' ? { ...cur, state: 'accepted', acceptedAt } : undefined));
    },

    end: (id, reason, endedAt) =>
      guarded(id, cur => (cur.state === 'ended' ? undefined : { ...cur, state: 'ended', endReason: reason, endedAt })),

    watchSignal(id, cb) {
      let last;
      return onValue(ref(db, signalPath(id)), snap => {
        const sig = snap.val() || {};
        const key = JSON.stringify([sig.offer, sig.answer]);
        if (key !== last) { last = key; cb(sig); }
      });
    },

    addCandidate: (id, user, cand) => push(ref(db, `${signalPath(id)}/candidates/${user}`), cand),

    watchCandidates: (id, user, cb) => onChildAdded(ref(db, `${signalPath(id)}/candidates/${user}`), snap => cb(snap.val())),

    clear: id => remove(ref(db, signalPath(id))),

    // The caller writes one chat entry per call; text keeps chat list previews and replies working.
    logCall({ from, kind, outcome, duration }) {
      const now = Date.now();
      return push(ref(db, 'messages'), {
        type: 'call', sender: from, text: callLogText({ kind, outcome, duration }),
        call: { kind, outcome, duration }, timestamp: now, expiresAt: now + 86400000,
      });
    },
  };
}
