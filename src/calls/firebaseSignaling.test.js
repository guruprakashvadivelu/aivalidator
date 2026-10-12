import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal in-memory stand-in for the Realtime Database transaction API.
let active;
vi.mock('firebase/database', () => ({
  ref: (db, path) => ({ path }),
  runTransaction: async (r, fn) => {
    const next = fn(active);
    if (next === undefined) return { committed: false };
    active = next;
    return { committed: true };
  },
  set: async () => {}, remove: async () => {}, push: async () => {},
  onValue: () => () => {}, onChildAdded: () => () => {},
}));
const { createFirebaseSignaling } = await import('./firebaseSignaling');

describe('end', () => {
  const sig = createFirebaseSignaling({}, 'user2');
  beforeEach(() => { active = { id: 'c1', from: 'user1', to: 'user2', kind: 'audio', state: 'accepted', startedAt: 0, acceptedAt: 1 }; });

  it('ignores missed/declined/cancelled once the call was answered (e.g. a second device timing out)', async () => {
    for (const reason of ['missed', 'declined', 'cancelled']) expect(await sig.end('c1', reason, 5)).toBe(false);
    expect(active.state).toBe('accepted');
  });

  it('ends an answered call on hang-up or failure', async () => {
    expect(await sig.end('c1', 'hangup', 5)).toBe(true);
    expect(active).toMatchObject({ state: 'ended', endReason: 'hangup', endedAt: 5 });
  });

  it('ends a ringing call as missed, and never touches a different call', async () => {
    active = { ...active, state: 'ringing', acceptedAt: undefined };
    expect(await sig.end('other', 'missed', 5)).toBe(false);
    expect(await sig.end('c1', 'missed', 5)).toBe(true);
    expect(active.endReason).toBe('missed');
  });
});
