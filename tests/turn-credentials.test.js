import { describe, it, expect, vi } from 'vitest';
import handler, { getIceServers, FALLBACK_ICE_SERVERS } from '../netlify/functions/turn-credentials.mjs';

const okCloudflare = vi.fn(async () => new Response(JSON.stringify({
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp'], username: 'u', credential: 'c' },
  ],
}), { status: 201, headers: { 'content-type': 'application/json' } }));

describe('getIceServers', () => {
  it('falls back to public STUN when Cloudflare is not configured', async () => {
    const fetchFn = vi.fn();
    expect(await getIceServers({ env: {}, fetchFn })).toEqual(FALLBACK_ICE_SERVERS);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('asks Cloudflare for 24 h credentials and drops port 53', async () => {
    const env = { CLOUDFLARE_TURN_KEY_ID: 'key123', CLOUDFLARE_TURN_API_TOKEN: 'tok456' };
    const servers = await getIceServers({ env, fetchFn: okCloudflare });
    const [url, init] = okCloudflare.mock.calls[0];
    expect(url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/key123/credentials/generate-ice-servers');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer tok456');
    expect(JSON.parse(init.body)).toEqual({ ttl: 86400 });
    expect(servers).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u', credential: 'c' },
    ]);
  });

  it('falls back to STUN if Cloudflare errors or fails', async () => {
    const env = { CLOUDFLARE_TURN_KEY_ID: 'k', CLOUDFLARE_TURN_API_TOKEN: 't' };
    expect(await getIceServers({ env, fetchFn: async () => new Response('nope', { status: 500 }) })).toEqual(FALLBACK_ICE_SERVERS);
    expect(await getIceServers({ env, fetchFn: async () => { throw new Error('timeout'); } })).toEqual(FALLBACK_ICE_SERVERS);
  });
});

describe('handler', () => {
  it('refuses callers other than AIRV', async () => {
    const res = await handler(new Request('https://x/.netlify/functions/turn-credentials', { headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
  });

  it('serves ICE servers to AIRV and never lets them be cached', async () => {
    const res = await handler(new Request('https://x/.netlify/functions/turn-credentials', { headers: { origin: 'https://v2--myaivalidator.netlify.app' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await res.json()).iceServers.length).toBeGreaterThan(0);
  });
});
