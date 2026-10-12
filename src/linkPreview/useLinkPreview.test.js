import { it, expect } from 'vitest';
import { firstLink, previewForSend } from './useLinkPreview';

it('finds the first link in a message', () => {
  expect(firstLink('no links here')).toBeNull();
  expect(firstLink('see https://a.com/x and https://b.com')).toBe('https://a.com/x');
  expect(firstLink('try www.google.com.')).toBe('https://www.google.com');
});

it('keeps a preview only while its link is still in the text', () => {
  const p = { url: 'https://a.com/x', title: 'A', image: 'https://a.com/i.png', siteName: 'a.com', extra: 'drop me' };
  expect(previewForSend('look https://a.com/x', p)).toEqual({ url: 'https://a.com/x', title: 'A', image: 'https://a.com/i.png', siteName: 'a.com' });
  expect(previewForSend('link removed', p)).toBeNull();
  expect(previewForSend('anything', null)).toBeNull();
});

it('matches www links typed without https', () => {
  expect(previewForSend('try www.google.com', { url: 'https://www.google.com', title: 'Google' })).toEqual({ url: 'https://www.google.com', title: 'Google' });
});

it('keeps the link as typed even when the server reports the page under another address', async () => {
  const { fetchLinkPreview } = await import('./useLinkPreview');
  const realFetch = globalThis.fetch;
  // youtu.be redirects; the function reports the final page address.
  globalThis.fetch = async () => new Response(JSON.stringify({ url: 'https://www.youtube.com/watch?v=abc&feature=youtu.be', title: 'Video' }));
  try {
    const p = await fetchLinkPreview('https://youtu.be/abc');
    expect(p.url).toBe('https://youtu.be/abc');
    expect(previewForSend('watch https://youtu.be/abc', p)).toMatchObject({ url: 'https://youtu.be/abc', title: 'Video' });
  } finally { globalThis.fetch = realFetch; }
});

it('a link typed without a trailing slash still matches', async () => {
  const { fetchLinkPreview } = await import('./useLinkPreview');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ url: 'https://example.com/', title: 'Example' }));
  try {
    const p = await fetchLinkPreview('https://example.com');
    expect(previewForSend('see https://example.com', p)).not.toBeNull();
  } finally { globalThis.fetch = realFetch; }
});
