# Link previews (V2) — design

Status: approved in chat, 2026-10-12. Branch: `v2`.

## Goal

Show WhatsApp-style preview cards for links in messages: while composing and inside the sent bubble.

## Findings that shape the design

- Browsers can't read other sites' preview data (CORS), so a server-side helper is required.
- An honestly-labelled fetcher (`AIRV-LinkPreview/1.0`) gets Open Graph data from Instagram profiles,
  YouTube and Wikipedia. Instagram posts are unverified (test link was made up). We do not spoof
  other crawlers' user agents; sites that don't share data simply get no card.

## User experience

- Composing: when the message contains a link, a card appears above the message box after a short
  pause (image thumbnail, title, description, site) with an **✕** to send without it.
- Sent bubble: the card sits above the text inside the bubble; tapping it opens the link in a new tab.
  The recipient sees the same card immediately (the preview is stored with the message).
- No card when the site shares nothing usable; the text link still works.
- If the preview image fails to load (e.g. expired Instagram image URL), the card shows without it.

## Architecture

- **Netlify Function** `netlify/functions/link-preview.mjs`, `GET /.netlify/functions/link-preview?url=…`
  → `200 { url, title?, description?, image?, siteName? }` (empty object when nothing usable),
  `400` invalid/blocked URL, `403` request not from AIRV.
- Pure, unit-tested modules in `src/linkPreview/`:
  - `parseMeta.js` — extract `og:*` / `twitter:*` / `<title>` / meta description, decode HTML
    entities, resolve relative image URLs, trim lengths (title 120, description 200).
  - `guard.js` — URL validation and private/internal address blocking.
- Client: `useLinkPreview(text)` (debounced fetch of the first link's preview, dismissable) and
  `LinkPreviewCard` (compose + bubble variants). `sendMessage` stores `preview` on the message only
  when its URL is still in the text.

## Safety (the function must not be an open proxy)

- Only `http:`/`https:`, default ports; hostname must not be `localhost`/`*.local`/`*.internal` or an
  IP literal in private, loopback, link-local, CGNAT or multicast ranges; resolved addresses (DNS) are
  checked the same way.
- Redirects followed manually (max 3), each hop re-validated.
- 5 s timeout; reads at most 1 MB; only `text/html` responses are parsed.
- Answers only requests from AIRV pages (`Sec-Fetch-Site: same-origin`, or `Origin` of
  `myaivalidator.netlify.app`, its branch/preview subdomains, or localhost). This deters casual reuse;
  it is not authentication.
- Responses cached at Netlify's edge for 24 h (`Netlify-CDN-Cache-Control`) to save invocations.
- Output is plain strings rendered as React text; images only if `http(s)`.

## Cost

One small function call per new link (edge-cached repeats are free); within Netlify free credits.

## Testing

- Vitest: `parseMeta`, `guard`, and the function handler (mocked `fetch`/DNS): blocked URL, non-HTML,
  redirect to a private address, origin rejected, happy path.
- Harness (Chromium, function mocked with `page.route`): compose card appears, ✕ dismisses, sent
  bubble shows the card, card links to the URL; keyboard/voice/long-press regressions.
- Deployed: call the real function on the v2 preview (YouTube → title; `http://127.0.0.1` → 400);
  device check with a real Instagram post link.

## Out of scope

Image proxying, video previews/inline players, previews in the live V1 app.
