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
