import { describe, it, expect } from 'vitest';
import { checkUrl, isPrivateAddress } from './guard';

describe('checkUrl', () => {
  it('allows public http(s) URLs', () => {
    for (const u of ['https://www.instagram.com/p/abc/', 'http://example.com/', 'https://93.184.216.34/', 'https://example.com:443/x']) {
      expect(checkUrl(u).ok, u).toBe(true);
    }
  });
  it('rejects other schemes, credentials and ports', () => {
    expect(checkUrl('ftp://example.com/').ok).toBe(false);
    expect(checkUrl('file:///etc/passwd').ok).toBe(false);
    expect(checkUrl('https://user:pw@example.com/').ok).toBe(false);
    expect(checkUrl('https://example.com:8080/').ok).toBe(false);
    expect(checkUrl('not a url').ok).toBe(false);
  });
  it('rejects local and internal hosts', () => {
    for (const u of ['http://localhost/', 'http://printer.local/', 'http://db.internal/', 'http://x.localhost/',
      'http://127.0.0.1/', 'http://10.1.2.3/', 'http://172.20.0.1/', 'http://192.168.1.1/', 'http://169.254.169.254/latest',
      'http://100.64.0.1/', 'http://0.0.0.0/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/']) {
      expect(checkUrl(u).ok, u).toBe(false);
    }
  });
});

describe('isPrivateAddress', () => {
  it('classifies addresses', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
    expect(isPrivateAddress('10.0.0.5')).toBe(true);
    expect(isPrivateAddress('224.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:192.168.0.1')).toBe(true);
    expect(isPrivateAddress('999.1.1.1')).toBe(true); // malformed: refuse
  });
});
