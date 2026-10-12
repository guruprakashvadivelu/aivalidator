import { allowedRequest } from '../../src/server/origin.js';
import { filterIceServers } from '../../src/calls/callModel.js';

// GET /.netlify/functions/turn-credentials → { iceServers }
// With CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN set in Netlify, returns short-lived (24 h)
// Cloudflare TURN credentials so calls connect over mobile data; otherwise (or if Cloudflare fails)
// public STUN, which works on most Wi-Fi. The Cloudflare key itself never leaves this function.
export const FALLBACK_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];
const TTL_SECONDS = 86400;
const TIMEOUT_MS = 5000;

export async function getIceServers({ env = process.env, fetchFn = fetch } = {}) {
  const keyId = env.CLOUDFLARE_TURN_KEY_ID;
  const token = env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return FALLBACK_ICE_SERVERS;
  try {
    const res = await fetchFn(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return FALLBACK_ICE_SERVERS;
    const servers = filterIceServers((await res.json()).iceServers || []);
    return servers.length ? servers : FALLBACK_ICE_SERVERS;
  } catch {
    return FALLBACK_ICE_SERVERS;
  }
}

export default async req => {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (!allowedRequest(req.headers)) return new Response('{}', { status: 403, headers });
  return new Response(JSON.stringify({ iceServers: await getIceServers() }), { status: 200, headers });
};
