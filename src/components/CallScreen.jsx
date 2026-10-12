import React, { useEffect, useRef, useState } from 'react';
import { useCallActions, useCallState } from '../calls/useCall';
import { formatDuration } from '../voice/format';

// WhatsApp-style full-screen call UI: outgoing, incoming, connected and a short "ended" status.
const ICONS = {
  phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3',
  micOff: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3M3 3l18 18',
  video: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  videoOff: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2zM3 3l18 18',
  flip: 'M4 4v5h5M20 20v-5h-5M5.6 15A7 7 0 0018.4 15M18.4 9A7 7 0 005.6 9',
};

const Icon = ({ d, size = 28, rotate }) => (
  <svg width={size} height={size} fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
    viewBox="0 0 24 24" style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined} aria-hidden="true">
    <path d={d} />
  </svg>
);

const RoundButton = ({ label, onClick, bg = 'rgba(255,255,255,0.18)', children, size = 64 }) => (
  <button aria-label={label} onClick={onClick}
    style={{ width: size, height: size, borderRadius: '50%', border: 'none', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}>
    {children}
  </button>
);

// Keep a media element bound to a stream and playing.
function Media({ stream, as: Tag = 'video', ...props }) {
  const el = useRef(null);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (node.srcObject !== stream) node.srcObject = stream || null;
    if (stream) node.play?.().catch(() => {});
  }, [stream]);
  return <Tag ref={el} autoPlay playsInline {...props} />;
}

function useTimer(since) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since ? formatDuration(Math.max(0, Math.floor((now - since) / 1000))) : '';
}

export default function CallScreen() {
  const call = useCallState();
  const actions = useCallActions();
  const timer = useTimer(call.phase === 'connected' ? call.connectedAt : null);

  const notice = call.notice && (
    <div role="status" style={{ position: 'fixed', left: '50%', bottom: 'calc(env(safe-area-inset-bottom) + 96px)', transform: 'translateX(-50%)', zIndex: 2001, background: 'rgba(40,40,40,0.95)', color: 'white', padding: '10px 16px', borderRadius: '18px', fontSize: '14px', whiteSpace: 'nowrap' }}>
      {call.notice}
    </div>
  );
  if (call.phase === 'idle' || !actions) return notice || null;

  const { phase, kind, other } = call;
  const video = kind === 'video';
  const name = other === 'user1' ? 'Instance A' : 'Instance B';
  const letter = other === 'user1' ? 'A' : 'B';
  const remoteVideo = video && call.remote && (phase === 'connecting' || phase === 'connected');
  const status = {
    outgoing: 'Calling…',
    incoming: video ? 'Video call' : 'Audio call',
    connecting: 'Connecting…',
    connected: timer,
    ended: call.endText,
  }[phase];
  const mirrored = (call.facingMode || 'user') === 'user';
  const localFull = video && call.local && !remoteVideo;
  const inCall = phase === 'connecting' || phase === 'connected';

  return (
    <div data-call-phase={phase} role="dialog" aria-label={`${video ? 'Video' : 'Audio'} call with ${name}`}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#0b141a', color: 'white', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}>
      {remoteVideo && <Media data-remote stream={call.remote} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />}
      {!video && call.remote && <Media as="audio" data-remote stream={call.remote} />}
      {video && call.local && (
        <Media data-local muted stream={call.local}
          style={localFull
            ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: mirrored ? 'scaleX(-1)' : undefined, opacity: call.cameraOff ? 0 : 1 }
            : { position: 'absolute', right: 16, top: 'calc(env(safe-area-inset-top) + 16px)', width: 104, height: 156, objectFit: 'cover', borderRadius: 14, transform: mirrored ? 'scaleX(-1)' : undefined, background: '#222', opacity: call.cameraOff ? 0.25 : 1, boxShadow: '0 4px 16px rgba(0,0,0,0.5)', zIndex: 2 }} />
      )}
      {(remoteVideo || localFull) && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(rgba(0,0,0,0.45), transparent 30%, transparent 65%, rgba(0,0,0,0.55))', pointerEvents: 'none' }} />}

      <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(env(safe-area-inset-top) + 48px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, zIndex: 1, textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
        {!remoteVideo && !localFull && (
          <div style={{ width: 112, height: 112, borderRadius: '50%', background: 'linear-gradient(135deg,#a855f7,#ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, fontWeight: 700, marginBottom: 12 }}>{letter}</div>
        )}
        <div style={{ fontSize: 26, fontWeight: 600 }}>{name}</div>
        <div aria-live="polite" style={{ fontSize: 16, opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>{status}</div>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 40px)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 22, zIndex: 3 }}>
        {phase === 'incoming' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 300 }}>
            <RoundButton label="Decline call" bg="#ea0038" size={72} onClick={actions.declineCall}><Icon d={ICONS.phone} size={30} rotate={135} /></RoundButton>
            <RoundButton label="Accept call" bg="#25d366" size={72} onClick={actions.acceptCall}><Icon d={video ? ICONS.video : ICONS.phone} size={30} /></RoundButton>
          </div>
        )}
        {(phase === 'outgoing' || inCall) && (
          <>
            {video && (
              <RoundButton label={call.cameraOff ? 'Turn camera on' : 'Turn camera off'} bg={call.cameraOff ? 'white' : undefined} onClick={() => actions.setCameraOff(!call.cameraOff)}>
                <svg width="28" height="28" fill="none" stroke={call.cameraOff ? '#111' : 'white'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d={call.cameraOff ? ICONS.videoOff : ICONS.video} /></svg>
              </RoundButton>
            )}
            {video && <RoundButton label="Switch camera" onClick={actions.switchCamera}><Icon d={ICONS.flip} /></RoundButton>}
            <RoundButton label={call.muted ? 'Unmute' : 'Mute'} bg={call.muted ? 'white' : undefined} onClick={() => actions.setMuted(!call.muted)}>
              <svg width="28" height="28" fill="none" stroke={call.muted ? '#111' : 'white'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d={call.muted ? ICONS.micOff : ICONS.mic} /></svg>
            </RoundButton>
            <RoundButton label="End call" bg="#ea0038" onClick={actions.hangUp}><Icon d={ICONS.phone} rotate={135} /></RoundButton>
          </>
        )}
      </div>
      {notice}
    </div>
  );
}
