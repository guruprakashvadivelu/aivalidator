// Netlify Functions answer only AIRV's own pages. Deters reuse by other sites; not authentication
// (headers can be forged outside a browser). Shared by every function in netlify/functions.
const ALLOWED_ORIGIN = /^(https:\/\/([a-z0-9-]+--)?myaivalidator\.netlify\.app|http:\/\/localhost(:\d+)?)$/;

export function allowedRequest(headers) {
  const origin = headers.get('origin');
  if (origin) return ALLOWED_ORIGIN.test(origin);
  return headers.get('sec-fetch-site') === 'same-origin';
}
