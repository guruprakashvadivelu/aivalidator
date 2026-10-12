// Split message text into plain parts and link parts: [{ text }, { text, href }, ...].
// Finds http(s):// and www. links; trailing punctuation and unbalanced closing brackets
// stay outside the link ("see example.com." links "example.com").
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const TRAILING = /[.,!?;:'"]+$/;
const HAS_HOST = /^(?:https?:\/\/)?[^\s/?#]+\.[^\s/?#]+/i; // e.g. rejects a bare "https://"

function trimUrl(url) {
  let out = url;
  for (;;) {
    const before = out;
    out = out.replace(TRAILING, '');
    for (const [open, close] of [['(', ')'], ['[', ']']]) {
      if (out.endsWith(close) && out.split(close).length > out.split(open).length) out = out.slice(0, -1);
    }
    if (out === before) return out;
  }
}

export function linkify(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const url = trimUrl(match[0]);
    if (!HAS_HOST.test(url)) continue;
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: url, href: /^www\./i.test(url) ? `https://${url}` : url });
    last = match.index + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
