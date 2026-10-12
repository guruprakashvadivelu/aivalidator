import { describe, it, expect, vi } from 'vitest';
import handler, { fetchPreview, allowedRequest } from '../netlify/functions/link-preview.mjs';

const html = (head, pad = 0) => `<html><head>${head}</head><body>${'x'.repeat(pad)}</body></html>`;
const page = (body, type = 'text/html; charset=utf-8') => new Response(body, { status: 200, headers: { 'content-type': type } });
const publicDns = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);

describe('fetchPreview', () => {
  it('returns preview fields and identifies itself honestly', async () => {
    const fetchFn = vi.fn(async () => page(html('<meta property="og:title" content="Hello"><meta property="og:image" content="https://a.com/i.png">')));
    const r = await fetchPreview('https://a.com/post', { fetchFn, lookupFn: publicDns });
    expect(r).toEqual({ status: 200, body: { url: 'https://a.com/post', title: 'Hello', image: 'https://a.com/i.png', siteName: 'a.com' } });
    expect(fetchFn.mock.calls[0][1].headers['user-agent']).toBe('AIRV-LinkPreview/1.0 (+https://myaivalidator.netlify.app)');
    expect(fetchFn.mock.calls[0][1].redirect).toBe('manual');
  });

  it('ignores non-HTML responses', async () => {
    const fetchFn = vi.fn(async () => page('%PDF', 'application/pdf'));
    expect(await fetchPreview('https://a.com/file.pdf', { fetchFn, lookupFn: publicDns })).toEqual({ status: 200, body: {} });
  });

  it('blocks private address literals without fetching', async () => {
    const fetchFn = vi.fn();
    expect((await fetchPreview('http://127.0.0.1/', { fetchFn, lookupFn: publicDns })).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('blocks hostnames that resolve to private addresses', async () => {
    const fetchFn = vi.fn();
    const lookupFn = vi.fn(async () => [{ address: '10.0.0.5', family: 4 }]);
    expect((await fetchPreview('https://sneaky.example.com/', { fetchFn, lookupFn })).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('re-checks every redirect and refuses one to an internal address', async () => {
    const fetchFn = vi.fn(async url => (url.startsWith('https://short.ly')
      ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } })
      : page(html('<title>secret</title>'))));
    expect((await fetchPreview('https://short.ly/abc', { fetchFn, lookupFn: publicDns })).status).toBe(400);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('follows a normal redirect', async () => {
    const fetchFn = vi.fn(async url => (url === 'https://a.com/old'
      ? new Response(null, { status: 301, headers: { location: '/new' } })
      : page(html('<meta property="og:title" content="New page">'))));
    expect((await fetchPreview('https://a.com/old', { fetchFn, lookupFn: publicDns })).body)
      .toMatchObject({ url: 'https://a.com/new', title: 'New page' });
  });

  it('stops reading after 1 MB but still parses the head', async () => {
    const fetchFn = vi.fn(async () => page(html('<meta property="og:title" content="Big">', 3_000_000)));
    expect((await fetchPreview('https://a.com/big', { fetchFn, lookupFn: publicDns })).body).toMatchObject({ title: 'Big' });
  });
});

it('gives no preview when the site redirects to a login wall', async () => {
  const fetchFn = vi.fn(async url => (url.includes('/accounts/login')
    ? page(html('<meta property="og:title" content="Instagram"><meta property="og:description" content="Create an account or log in">'))
    : new Response(null, { status: 302, headers: { location: 'https://www.instagram.com/accounts/login/?next=%2Finstagram%2F' } })));
  expect(await fetchPreview('https://www.instagram.com/instagram/', { fetchFn, lookupFn: publicDns })).toEqual({ status: 200, body: {} });
});

it('cached answers vary by caller so the edge cache cannot skip the caller check', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => page(html('<meta property="og:title" content="Hi">')));
  try {
    const res = await handler(new Request('https://x/.netlify/functions/link-preview?url=https://93.184.216.34/', {
      headers: { origin: 'https://myaivalidator.netlify.app' },
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get('netlify-vary')).toBe('header=Origin|Sec-Fetch-Site');
  } finally { globalThis.fetch = realFetch; }
});

describe('allowedRequest', () => {
  const h = obj => new Headers(obj);
  it('accepts AIRV origins and same-origin requests', () => {
    expect(allowedRequest(h({ origin: 'https://myaivalidator.netlify.app' }))).toBe(true);
    expect(allowedRequest(h({ origin: 'https://v2--myaivalidator.netlify.app' }))).toBe(true);
    expect(allowedRequest(h({ origin: 'http://localhost:5173' }))).toBe(true);
    expect(allowedRequest(h({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });
  it('rejects other callers', () => {
    expect(allowedRequest(h({ origin: 'https://evil.example' }))).toBe(false);
    expect(allowedRequest(h({ origin: 'https://myaivalidator.netlify.app.evil.example' }))).toBe(false);
    expect(allowedRequest(h({}))).toBe(false);
    expect(allowedRequest(h({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
  });
});

it('handler answers 403 to unknown callers', async () => {
  const res = await handler(new Request('https://x/.netlify/functions/link-preview?url=https://a.com'));
  expect(res.status).toBe(403);
});
