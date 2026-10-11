// While holding the mic: slide left to cancel, slide up to lock (WhatsApp). Distances in px.
export const CANCEL_DISTANCE = 110;
export const LOCK_DISTANCE = 70;

export function classifyDrag(dx, dy) {
  const left = -dx;
  const up = -dy;
  if (up >= LOCK_DISTANCE && up > left) return 'lock';
  if (left >= CANCEL_DISTANCE && left >= up) return 'cancel';
  return 'none';
}
