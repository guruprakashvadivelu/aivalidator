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
  // URL parsing rewrites ::ffff:127.0.0.1 as ::ffff:7f00:1
  const mappedHex = addr.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const [hi, lo] = [parseInt(mappedHex[1], 16), parseInt(mappedHex[2], 16)];
    return privateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
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
