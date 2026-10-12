import { describe, it, expect } from 'vitest';
import { RING_TIMEOUT_MS, newCall, isIncomingFor, callOutcome, callLogText, filterIceServers } from './callModel';

describe('newCall', () => {
  it('creates a ringing call record', () => {
    const c = newCall({ from: 'user1', to: 'user2', kind: 'video', now: 1000 });
    expect(c).toMatchObject({ from: 'user1', to: 'user2', kind: 'video', state: 'ringing', startedAt: 1000 });
    expect(typeof c.id).toBe('string');
    expect(newCall({ from: 'user1', to: 'user2', kind: 'audio', now: 1000 }).id).not.toBe(c.id);
  });
});

describe('isIncomingFor', () => {
  const c = { id: 'a', from: 'user1', to: 'user2', kind: 'audio', state: 'ringing', startedAt: 1000 };
  it('is incoming for the callee while ringing and fresh', () => {
    expect(isIncomingFor(c, 'user2', 2000)).toBe(true);
    expect(isIncomingFor(c, 'user1', 2000)).toBe(false);
    expect(isIncomingFor({ ...c, state: 'accepted' }, 'user2', 2000)).toBe(false);
    expect(isIncomingFor(null, 'user2', 2000)).toBe(false);
  });
  it('ignores a stale ringing record (opened the app after the call timed out)', () => {
    expect(isIncomingFor(c, 'user2', 1000 + RING_TIMEOUT_MS + 1)).toBe(false);
  });
});

describe('callOutcome', () => {
  const base = { kind: 'video', startedAt: 0 };
  it('completed calls report seconds between accept and end', () => {
    expect(callOutcome({ ...base, state: 'ended', acceptedAt: 5000, endedAt: 227000, endReason: 'hangup' }))
      .toEqual({ outcome: 'completed', duration: 222 });
  });
  it('maps end reasons for unanswered calls', () => {
    expect(callOutcome({ ...base, state: 'ended', endedAt: 30000, endReason: 'missed' }).outcome).toBe('missed');
    expect(callOutcome({ ...base, state: 'ended', endedAt: 3000, endReason: 'declined' }).outcome).toBe('declined');
    expect(callOutcome({ ...base, state: 'ended', endedAt: 3000, endReason: 'cancelled' }).outcome).toBe('cancelled');
    expect(callOutcome({ ...base, state: 'ended', endedAt: 3000, endReason: 'busy' }).outcome).toBe('declined');
    expect(callOutcome({ ...base, state: 'ended', endedAt: 3000, endReason: 'failed' }).outcome).toBe('failed');
  });
  it('a call that failed after connecting still counts its talk time', () => {
    expect(callOutcome({ ...base, state: 'ended', acceptedAt: 1000, endedAt: 61000, endReason: 'failed' }))
      .toEqual({ outcome: 'completed', duration: 60 });
  });
});

describe('callLogText', () => {
  it('reads like WhatsApp', () => {
    expect(callLogText({ kind: 'video', outcome: 'completed', duration: 222 })).toBe('📹 Video call · 3:42');
    expect(callLogText({ kind: 'audio', outcome: 'completed', duration: 12 })).toBe('📞 Audio call · 0:12');
    expect(callLogText({ kind: 'video', outcome: 'missed' })).toBe('📹 Missed video call');
    expect(callLogText({ kind: 'audio', outcome: 'declined' })).toBe('📞 Declined audio call');
    expect(callLogText({ kind: 'audio', outcome: 'cancelled' })).toBe('📞 Cancelled audio call');
    expect(callLogText({ kind: 'video', outcome: 'failed' })).toBe('📹 Video call failed');
  });
});

describe('filterIceServers', () => {
  it('drops port 53 URLs that browsers block', () => {
    const servers = [
      { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
      { urls: 'turn:turn.cloudflare.com:53' },
    ];
    expect(filterIceServers(servers)).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
    ]);
  });
});
