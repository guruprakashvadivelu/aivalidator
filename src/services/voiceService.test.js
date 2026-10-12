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

  it('builds one atomic deletion covering every path of each message', () => {
    expect(svc.deletionUpdate(['a', 'b'])).toEqual({
      'messages/a': null, 'reads/a': null, 'reactions/a': null, 'voice/a': null, 'played/a': null,
      'messages/b': null, 'reads/b': null, 'reactions/b': null, 'voice/b': null, 'played/b': null,
    });
    expect(svc.deletionUpdate([])).toEqual({});
  });
});
