import { formatDuration } from '../voice/format';

// One active call between the two instances, signalled through calls/active.
export const RING_TIMEOUT_MS = 30000;

export function newCall({ from, to, kind, now }) {
  return {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    from, to, kind, state: 'ringing', startedAt: now,
  };
}

// Ringing for me, and not a leftover from a call that already timed out before the app opened.
export function isIncomingFor(active, me, now) {
  return !!active && active.state === 'ringing' && active.to === me && now - active.startedAt <= RING_TIMEOUT_MS;
}

const UNANSWERED = { missed: 'missed', declined: 'declined', busy: 'declined', cancelled: 'cancelled', failed: 'failed', hangup: 'cancelled' };

export function callOutcome(active) {
  if (active.acceptedAt) {
    return { outcome: 'completed', duration: Math.max(0, Math.round(((active.endedAt ?? active.acceptedAt) - active.acceptedAt) / 1000)) };
  }
  return { outcome: UNANSWERED[active.endReason] || 'cancelled', duration: 0 };
}

export function callLogText({ kind, outcome, duration }) {
  const icon = kind === 'video' ? '📹' : '📞';
  const name = kind === 'video' ? 'video call' : 'audio call';
  const Name = name[0].toUpperCase() + name.slice(1);
  switch (outcome) {
    case 'completed': return `${icon} ${Name} · ${formatDuration(duration)}`;
    case 'missed': return `${icon} Missed ${name}`;
    case 'declined': return `${icon} Declined ${name}`;
    case 'failed': return `${icon} ${Name} failed`;
    default: return `${icon} Cancelled ${name}`;
  }
}

// Browsers block port 53, so those relay URLs only add connection delay.
export function filterIceServers(iceServers) {
  const blocked = url => /:53(\?|$)/.test(url);
  return iceServers.flatMap(server => {
    const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(u => !blocked(u));
    return urls.length ? [{ ...server, urls }] : [];
  });
}
