import { it, expect } from 'vitest';
import { linkify } from './linkify';

const links = text => linkify(text).filter(p => p.href).map(p => [p.text, p.href]);

it('returns plain text unchanged', () => {
  expect(linkify('hello there')).toEqual([{ text: 'hello there' }]);
  expect(linkify('')).toEqual([]);
});

it('finds an Instagram post link with its query string', () => {
  const url = 'https://www.instagram.com/p/C9xYz12AbC/?igsh=MWQ1ZGUxMzBkMA==';
  expect(linkify(`look ${url} now`)).toEqual([
    { text: 'look ' }, { text: url, href: url }, { text: ' now' },
  ]);
});

it('leaves trailing punctuation out of the link', () => {
  expect(links('go to https://example.com.')).toEqual([['https://example.com', 'https://example.com']]);
  expect(links('really? https://example.com/a!')).toEqual([['https://example.com/a', 'https://example.com/a']]);
  expect(links('(see https://example.com/x)')).toEqual([['https://example.com/x', 'https://example.com/x']]);
});

it('keeps balanced brackets inside the link', () => {
  const url = 'https://en.wikipedia.org/wiki/Mercury_(planet)';
  expect(links(`read ${url}`)).toEqual([[url, url]]);
});

it('treats www. links as https', () => {
  expect(links('www.google.com')).toEqual([['www.google.com', 'https://www.google.com']]);
});

it('finds several links and keeps the text between them', () => {
  const parts = linkify('a http://x.com b https://y.org/z c');
  expect(parts.map(p => p.text).join('')).toBe('a http://x.com b https://y.org/z c');
  expect(parts.filter(p => p.href)).toHaveLength(2);
});

it('ignores a bare scheme', () => {
  expect(links('type https:// here')).toEqual([]);
});
