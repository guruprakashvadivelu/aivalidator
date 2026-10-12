import { lookup } from 'node:dns/promises';
import { checkUrl, isIpLiteral, isPrivateAddress } from '../../src/linkPreview/guard.js';
import { parseMeta } from '../../src/linkPreview/parseMeta.js';

// GET /.netlify/functions/link-preview?url=… → { url, title?, description?, image?, siteName? }
// Fetches public pages only (see guard.js), identifies itself honestly, and reads at most 1 MB.
const UA = 'AIRV-LinkPreview/1.0 (+https://myaivalidator.netlify.app)';
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
// Sites like Instagram send server requests to a login page; that page is not a preview of the link.
const LOGIN_WALL = /\/(accounts\/)?(log-?in|sign-?in)\b/i;
const ALLOWED_ORIGIN = /^(https:\/\/([a-z0-9-]+--)?myaivalidator\.netlify\.app|http:\/\/localhost(:\d+)?)$/;

// Deters reuse by other sites (not authentication: headers can be forged outside a browser).
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
  for (const c of chunks) {
    const part = c.subarray(0, all.length - at);
    all.set(part, at);
    at += part.length;
    if (at >= all.length) break;
  }
  return new TextDecoder().decode(all);
}

export async function fetchPreview(rawUrl, { fetchFn = fetch, lookupFn = lookup } = {}) {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkUrl(current);
    if (!check.ok || !(await resolvesPublic(check.url.hostname, lookupFn))) return { status: 400, body: {} };
    const res = await fetchFn(check.url.href, {
      redirect: 'manual', // every hop is re-checked above
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, check.url);
      if (LOGIN_WALL.test(next.pathname) && !LOGIN_WALL.test(check.url.pathname)) return { status: 200, body: {} };
      current = next.href;
      continue;
    }
    if (!res.ok || !(res.headers.get('content-type') || '').toLowerCase().includes('text/html')) {
      return { status: 200, body: {} };
    }
    return { status: 200, body: parseMeta(await readLimited(res, MAX_BYTES), check.url.href) };
  }
  return { status: 200, body: {} };
}

const json = (status, body, cache) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    // Cache key = the link AND the caller. Setting Netlify-Vary replaces the default (query string), so
    // query=url must be listed; the caller headers stop a cached answer from skipping allowedRequest().
    ...(cache && {
      'netlify-cdn-cache-control': 'public, max-age=86400, durable',
      'netlify-vary': 'query=url,header=Origin|Sec-Fetch-Site', // "," separates rules, "|" separates values
      'cache-control': 'public, max-age=3600',
    }),
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
