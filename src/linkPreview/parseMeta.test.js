import { describe, it, expect } from 'vitest';
import { parseMeta, decodeEntities } from './parseMeta';

const page = head => `<!doctype html><html><head>${head}</head><body>hi</body></html>`;

describe('parseMeta', () => {
  it('reads Open Graph tags', () => {
    const html = page(`
      <meta property="og:title" content="Rick Astley - Never Gonna Give You Up">
      <meta property="og:description" content="The official video">
      <meta property="og:image" content="https://i.ytimg.com/vi/x/maxresdefault.jpg">
      <meta property="og:site_name" content="YouTube">`);
    expect(parseMeta(html, 'https://www.youtube.com/watch?v=x')).toEqual({
      url: 'https://www.youtube.com/watch?v=x',
      title: 'Rick Astley - Never Gonna Give You Up',
      description: 'The official video',
      image: 'https://i.ytimg.com/vi/x/maxresdefault.jpg',
      siteName: 'YouTube',
    });
  });

  it('decodes entities Instagram uses and falls back to the hostname for the site', () => {
    const html = page(`<meta property="og:title" content="Instagram (&#064;instagram) &#x2022; Instagram photos" />`);
    expect(parseMeta(html, 'https://www.instagram.com/instagram/')).toMatchObject({
      title: 'Instagram (@instagram) • Instagram photos', siteName: 'instagram.com',
    });
  });

  it('falls back to twitter tags, <title> and meta description', () => {
    expect(parseMeta(page('<title> Plain  page </title><meta name="description" content="About it">'), 'https://a.com/'))
      .toMatchObject({ title: 'Plain page', description: 'About it' });
    expect(parseMeta(page('<meta name="twitter:title" content="T"><meta name="twitter:image" content="/img.png">'), 'https://a.com/x/'))
      .toMatchObject({ title: 'T', image: 'https://a.com/img.png' });
  });

  it('accepts single-quoted and reordered attributes', () => {
    expect(parseMeta(page(`<meta content='Hello' property='og:title'>`), 'https://a.com/')).toMatchObject({ title: 'Hello' });
  });

  it('drops non-http images and truncates long text', () => {
    const long = 'x'.repeat(300);
    const r = parseMeta(page(`<meta property="og:title" content="${long}"><meta property="og:image" content="javascript:alert(1)">`), 'https://a.com/');
    expect(r.image).toBeUndefined();
    expect(r.title).toHaveLength(120);
    expect(r.title.endsWith('…')).toBe(true);
  });

  it('returns {} when nothing usable', () => {
    expect(parseMeta(page('<meta charset="utf-8">'), 'https://a.com/')).toEqual({});
  });
});

it('decodeEntities handles named, decimal and hex', () => {
  expect(decodeEntities('a &amp; b &quot;c&quot; &#39;d&#39; &#x1F600;')).toBe('a & b "c" \'d\' 😀');
});
