import { useEffect, useState } from 'react';
import { linkify } from '../utils/linkify';

const ENDPOINT = '/.netlify/functions/link-preview';
const FIELDS = ['url', 'title', 'description', 'image', 'siteName'];
const cache = new Map(); // url -> Promise<preview | null>

export const firstLink = text => linkify(text).find(p => p.href)?.href ?? null;

// The preview to store with a message: only if its link is still in the text, known fields only.
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
    if (!url) { setDismissed(null); return undefined; }
    if (url === dismissed || result.url === url) return undefined;
    let live = true;
    const t = setTimeout(() => fetchLinkPreview(url).then(preview => { if (live) setResult({ url, preview }); }), delay);
    return () => { live = false; clearTimeout(t); };
  }, [url, dismissed]);

  const preview = url && url !== dismissed && result.url === url ? result.preview : null;
  return { preview, dismiss: () => setDismissed(url) };
}
