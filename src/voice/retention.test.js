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
