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
