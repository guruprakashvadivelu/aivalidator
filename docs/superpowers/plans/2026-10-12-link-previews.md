# Link Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WhatsApp-style link preview cards (compose + bubble) backed by a safe Netlify Function.

**Architecture:** Pure modules (`parseMeta`, `guard`) hold the parsing and URL-safety rules and are unit-tested. `netlify/functions/link-preview.mjs` composes them with `fetch` + DNS (injected for tests). The client hook `useLinkPreview` fetches the first link's preview while typing; `sendMessage` stores it on the message; `LinkPreviewCard` renders it.

**Tech Stack:** React 18, Vite 5, Netlify Functions (Node 18+, ESM, esbuild bundler), Vitest, Playwright harness.

**Spec:** `docs/superpowers/specs/2026-10-12-link-previews-design.md`

## Global Constraints

- User agent exactly `AIRV-LinkPreview/1.0 (+https://myaivalidator.netlify.app)`; never spoof other crawlers.
- Only `http:`/`https:`, default ports, no credentials in URL; block localhost/`.local`/`.internal`/`.lan`/`.localhost` and private, loopback, link-local, CGNAT, multicast/reserved IPs (v4 and v6, incl. v4-mapped v6) — for literals and DNS results.
- Max 3 redirects, each re-validated; 5 s timeout; ≤ 1 MB read; only `text/html` parsed.
- Allowed callers: `Origin` matching `https://myaivalidator.netlify.app`, `https://<branch>--myaivalidator.netlify.app`, or `http://localhost:<port>`; without `Origin`, `Sec-Fetch-Site: same-origin`.
- Responses: `200 {url,title?,description?,image?,siteName?}` or `{}`; `400` blocked/invalid; `403` disallowed caller. Cache 24 h at the edge via `Netlify-CDN-Cache-Control: public, max-age=86400, durable`.
- Title ≤ 120 chars, description ≤ 200, site name ≤ 60; images only `http(s)`.
- Commit identity/trailer and no `--no-verify`, as in the voice plan.

## Review Focus

1. **Link that redirects to a private address** (e.g. a short link → `http://169.254.169.254/`) → blocked, no fetch of the internal address. (Task 2 handler test.)
2. **Huge or endless page** → stops reading at 1 MB, still answers. (Task 2 handler test with a large body.)
3. **User edits the message so the link is gone before sending** → no stale preview stored. (Task 3: `previewForSend` unit test.)
4. **Preview image fails to load** (expired Instagram CDN URL) → card still shows text, no broken image. (Task 4 harness check.)
5. **Same link pasted again after ✕** in a later message → preview offered again. (Task 3 hook behaviour, harness check.)

---

### Task 1: parseMeta + guard (pure, tested)

**Files:** Create `src/linkPreview/parseMeta.js`, `src/linkPreview/guard.js`; Test `src/linkPreview/parseMeta.test.js`, `src/linkPreview/guard.test.js`.

**Produces:** `parseMeta(html: string, pageUrl: string): {url,title?,description?,image?,siteName?} | {}`, `decodeEntities(s)`, `checkUrl(raw): {ok:true,url:URL}|{ok:false,reason}`, `isPrivateAddress(ip): boolean`, `isIpLiteral(host): boolean`.

- [ ] Step 1: write tests (OG extraction, twitter/title/description fallbacks, entity decoding incl. `&#064;` and `&#x2022;`, relative image resolution, non-http image dropped, truncation with `…`, `{}` when nothing usable; guard: public URLs ok, each blocked class rejected, ports, credentials, schemes, v4-mapped v6).
- [ ] Step 2: run `npx vitest run src/linkPreview` → FAIL (modules missing).
- [ ] Step 3: implement (code below).
- [ ] Step 4: run → PASS; `npm test` all green.
- [ ] Step 5: commit `Add link preview parsing and URL safety checks`.

`parseMeta.js`:
```js
// Extract a link preview (Open Graph, Twitter card, or plain <title>/description) from HTML.
const MAX = { title: 120, description: 200, siteName: 60 };
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const clean = (s, max) => {
  if (!s) return undefined;
  const t = decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

function metaTags(html) {
  const out = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
    }
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content != null && !(key in out)) out[key] = attrs.content;
  }
  return out;
}

export function parseMeta(html, pageUrl) {
  const m = metaTags(html);
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = clean(m['og:title'] || m['twitter:title'] || titleTag, MAX.title);
  const description = clean(m['og:description'] || m['twitter:description'] || m.description, MAX.description);
  let image;
  const rawImage = m['og:image:secure_url'] || m['og:image'] || m['twitter:image'] || m['twitter:image:src'];
  if (rawImage) {
    try {
      const u = new URL(decodeEntities(rawImage.trim()), pageUrl);
      if (u.protocol === 'https:' || u.protocol === 'http:') image = u.href;
    } catch { /* ignore bad image URL */ }
  }
  if (!title && !description && !image) return {};
  const siteName = clean(m['og:site_name'], MAX.siteName) || new URL(pageUrl).hostname.replace(/^www\./, '');
  return Object.fromEntries(Object.entries({ url: pageUrl, title, description, image, siteName }).filter(([, v]) => v));
}
```

`guard.js`:
```js
// URL safety for the link preview fetcher: public http(s) only.
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

export const isIpLiteral = host => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');

function privateV4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !(n >= 0 && n <= 255))) return true; // malformed: refuse
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}

export function isPrivateAddress(ip) {
  const addr = ip.replace(/^\[|\]$/g, '').toLowerCase();
  if (!addr.includes(':')) return privateV4(addr);
  const mapped = addr.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return privateV4(mapped[1]);
  return addr === '::' || addr === '::1' || /^f[cd]/.test(addr) || /^fe[89ab]/.test(addr) || addr.startsWith('ff');
}

export function checkUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return { ok: false, reason: 'invalid' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'scheme' };
  if (url.username || url.password) return { ok: false, reason: 'credentials' };
  if (url.port && url.port !== '80' && url.port !== '443') return { ok: false, reason: 'port' };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || BLOCKED_SUFFIXES.some(s => host.endsWith(s))) return { ok: false, reason: 'host' };
  if (isIpLiteral(host) && isPrivateAddress(host)) return { ok: false, reason: 'private' };
  return { ok: true, url };
}
```

### Task 2: Netlify Function

**Files:** Create `netlify/functions/link-preview.mjs`, `netlify.toml`; Test `netlify/functions/link-preview.test.js`.

**Consumes:** Task 1. **Produces:** default handler `(req: Request) => Response`; `fetchPreview(url, { fetchFn, lookupFn })`; `allowedRequest(headers)`.

- [ ] Step 1: tests with injected `fetchFn`/`lookupFn`: happy path (HTML with OG → fields; UA header sent), non-HTML → `{}`, private literal → 400, DNS resolving to `10.0.0.5` → 400, redirect chain to `http://169.254.169.254/` → 400 without fetching it, >1 MB body truncated but parsed, `allowedRequest` for each origin case.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement:
```js
import { lookup } from 'node:dns/promises';
import { checkUrl, isIpLiteral, isPrivateAddress } from '../../src/linkPreview/guard.js';
import { parseMeta } from '../../src/linkPreview/parseMeta.js';

const UA = 'AIRV-LinkPreview/1.0 (+https://myaivalidator.netlify.app)';
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const ALLOWED_ORIGIN = /^(https:\/\/([a-z0-9-]+--)?myaivalidator\.netlify\.app|http:\/\/localhost(:\d+)?)$/;

export function allowedRequest(headers) {
  const origin = headers.get('origin');
  if (origin) return ALLOWED_ORIGIN.test(origin);
  return headers.get('sec-fetch-site') === 'same-origin';
}

async function resolvesPublic(hostname, lookupFn) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIpLiteral(host)) return !isPrivateAddress(host);
  const addrs = await lookupFn(host, { all: true });
  return addrs.length > 0 && addrs.every(a => !isPrivateAddress(a.address));
}

async function readLimited(res, max) {
  const reader = res.body?.getReader?.();
  if (!reader) return (await res.text()).slice(0, max);
  const chunks = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(size, max));
  let at = 0;
  for (const c of chunks) { const part = c.subarray(0, all.length - at); all.set(part, at); at += part.length; if (at >= all.length) break; }
  return new TextDecoder().decode(all);
}

export async function fetchPreview(rawUrl, { fetchFn = fetch, lookupFn = lookup } = {}) {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkUrl(current);
    if (!check.ok || !(await resolvesPublic(check.url.hostname, lookupFn))) return { status: 400, body: {} };
    const res = await fetchFn(check.url.href, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) { current = new URL(location, check.url).href; continue; }
    if (!res.ok || !(res.headers.get('content-type') || '').toLowerCase().includes('text/html')) return { status: 200, body: {} };
    return { status: 200, body: parseMeta(await readLimited(res, MAX_BYTES), check.url.href) };
  }
  return { status: 200, body: {} };
}

const json = (status, body, cache) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    ...(cache && { 'netlify-cdn-cache-control': 'public, max-age=86400, durable', 'cache-control': 'public, max-age=3600' }),
  },
});

export default async req => {
  if (!allowedRequest(req.headers)) return json(403, {});
  const url = new URL(req.url).searchParams.get('url') || '';
  try {
    const { status, body } = await fetchPreview(url);
    return json(status, body, status === 200);
  } catch {
    return json(200, {}, false);
  }
};
```
`netlify.toml`:
```toml
[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
```
- [ ] Step 4: run → PASS; `npm test`; `npm run build`.
- [ ] Step 5: commit `Add link preview Netlify Function`.

### Task 3: Client hook + send wiring

**Files:** Create `src/linkPreview/useLinkPreview.js` (+ test for pure helpers); modify `src/hooks/useMessages.js` (`sendMessage(text, replyTo, preview)`), harness mock.

**Produces:** `firstLink(text): string|null`, `previewForSend(text, preview): object|null`, `useLinkPreview(text) → { preview, dismiss }`, `fetchLinkPreview(url): Promise<object|null>`.

- [ ] Step 1: tests for `firstLink` and `previewForSend` (returns null when the preview URL is no longer in the text; strips unknown fields).
- [ ] Step 2: run → FAIL. Step 3: implement:
```js
import { useEffect, useState } from 'react';
import { linkify } from '../utils/linkify';

const ENDPOINT = '/.netlify/functions/link-preview';
const FIELDS = ['url', 'title', 'description', 'image', 'siteName'];
const cache = new Map(); // url -> Promise<preview | null>

export const firstLink = text => linkify(text).find(p => p.href)?.href ?? null;

export function previewForSend(text, preview) {
  if (!preview?.url || !text.includes(preview.url.replace(/^https:\/\/(?=www\.)/, ''))) return null;
  return Object.fromEntries(FIELDS.filter(f => preview[f]).map(f => [f, preview[f]]));
}

export function fetchLinkPreview(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(`${ENDPOINT}?url=${encodeURIComponent(url)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => (d && (d.title || d.description || d.image) ? d : null))
      .catch(() => null));
  }
  return cache.get(url);
}

/** Preview for the first link in the message being typed (debounced); ✕ hides it for that link. */
export function useLinkPreview(text, delay = 600) {
  const url = firstLink(text);
  const [result, setResult] = useState({ url: null, preview: null });
  const [dismissed, setDismissed] = useState(null);

  useEffect(() => {
    if (!url) { setDismissed(null); return; }
    if (url === dismissed || result.url === url) return;
    let live = true;
    const t = setTimeout(() => fetchLinkPreview(url).then(preview => { if (live) setResult({ url, preview }); }), delay);
    return () => { live = false; clearTimeout(t); };
  }, [url, dismissed]);

  const preview = url && url !== dismissed && result.url === url ? result.preview : null;
  return { preview, dismiss: () => setDismissed(url) };
}
```
`useMessages.sendMessage(text, replyTo = null, preview = null)`: after building `msg`, `const p = previewForSend(text.trim(), preview); if (p) msg.preview = p;`.
- [ ] Step 4: PASS; build. Step 5: commit `Fetch link previews while typing and store them with the message`.

### Task 4: LinkPreviewCard (compose + bubble)

**Files:** Create `src/components/LinkPreviewCard.jsx`; modify `src/screens/ChatScreen.jsx` (compose card above the footer row, pass preview to send, dismiss on ✕, clear after send), `src/components/MessageBubble.jsx` (card above text when `msg.preview`). Harness `verify-preview.mjs` mocks the function with `page.route`.

- [ ] Step 1: harness checks: typing a link shows `[data-link-preview="compose"]` with the mocked title; ✕ removes it; pasting the same link in a new message shows it again; sending stores and renders `[data-link-preview="bubble"]` as an `<a href=url target=_blank>`; a broken image URL leaves the card with no `<img>`; site with `{}` shows no card.
- [ ] Step 2: run → FAIL. Step 3: implement the card (compose: 56px thumbnail + site/title/description + ✕; bubble: full-width image ≤150px tall, then site/title/description on a darker panel; image hidden on error). Step 4: PASS + regressions (voice, long-press, keyboard). Step 5: commit `Show WhatsApp-style link preview cards`.

### Task 5: Deploy + verify the real function

- [ ] Push `v2`; wait for the preview; `curl` the deployed function with `Origin: https://v2--myaivalidator.netlify.app`: YouTube URL → title; `http://127.0.0.1/` → 400; no Origin and no Sec-Fetch-Site → 403. Device check with a real Instagram post.
