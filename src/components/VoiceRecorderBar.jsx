import React, { useEffect, useRef, useState } from 'react';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { classifyDrag, CANCEL_DISTANCE } from '../voice/gesture';
import { formatDuration } from '../voice/format';

const ICON_BUTTON = {
  width: '44px', height: '44px', flexShrink: 0, padding: 0, border: 'none', background: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};
const ERRORS = {
  permission: 'Allow microphone access in Settings › Safari to send voice messages',
  unavailable: 'Microphone not available',
  empty: "Couldn't record — try again",
};
const HINT = 'Hold to record, release to send';
const point = e => (e.touches?.[0] || e.changedTouches?.[0] || e);

/**
 * WhatsApp-style voice recording: hold the mic to record, release to send, slide left
 * to cancel, slide up to lock (then delete / pause / send). While active it overlays
 * the rest of the footer row (the row must be position: relative).
 */
export default function VoiceRecorderBar({ onSend, onNotice }) {
  const [locked, setLocked] = useState(false);
  const [dragX, setDragX] = useState(0);
  const micRef = useRef(null);
  const gesture = useRef(null); // { x, y, done }
  const recorder = useVoiceRecorder({
    onError: kind => onNotice(ERRORS[kind]),
    onLimit: result => { setLocked(false); onSend(result); },
  });
  const active = recorder.status !== 'idle';

  const finish = async send => {
    setLocked(false);
    setDragX(0);
    if (!send) { recorder.cancel(); return; }
    const result = await recorder.stop();
    if (result?.tooShort) onNotice(HINT);
    else if (result) onSend(result);
  };

  // Native listeners: touch handlers must be non-passive to keep focus in the message box.
  useEffect(() => {
    const el = micRef.current;
    if (!el) return;
    const onStart = e => {
      e.preventDefault();
      const p = point(e);
      gesture.current = { x: p.clientX, y: p.clientY, done: false };
      recorder.start();
    };
    const onMove = e => {
      const g = gesture.current;
      if (!g || g.done) return;
      const p = point(e);
      const dx = p.clientX - g.x;
      const dy = p.clientY - g.y;
      setDragX(Math.min(0, dx));
      const action = classifyDrag(dx, dy);
      if (action === 'cancel') { g.done = true; finish(false); }
      if (action === 'lock') { g.done = true; setDragX(0); setLocked(true); }
    };
    const onEnd = e => {
      e.preventDefault();
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.done) return;
      finish(true);
    };
    const onCancel = () => { gesture.current = null; finish(false); };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onCancel);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  });

  const tap = handler => ({
    onMouseDown: e => e.preventDefault(),
    onTouchEnd: e => { e.preventDefault(); handler(); },
    onClick: handler,
  });

  return (
    <>
      {active && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, right: '50px', background: 'var(--chat-bar)', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 10px', zIndex: 5 }}>
          {locked ? (
            <>
              <button aria-label="Delete recording" style={ICON_BUTTON} {...tap(() => finish(false))}>
                <svg width="22" height="22" fill="none" stroke="var(--icon)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
              </button>
              <span style={{ color: 'var(--bubble-text)', fontSize: '14px', minWidth: '36px' }}>{formatDuration(recorder.elapsed)}</span>
              <div aria-hidden="true" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', height: '28px', overflow: 'hidden', justifyContent: 'flex-end' }}>
                {recorder.levels.map((l, i) => (
                  <span key={i} style={{ width: '2px', borderRadius: '1px', background: 'var(--time-in)', height: `${3 + Math.min(1, l * 4) * 22}px`, flexShrink: 0 }} />
                ))}
              </div>
              <button aria-label={recorder.status === 'paused' ? 'Resume recording' : 'Pause recording'} style={ICON_BUTTON}
                {...tap(() => (recorder.status === 'paused' ? recorder.resume() : recorder.pause()))}>
                {recorder.status === 'paused'
                  ? <svg width="22" height="22" fill="#e5484d" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/></svg>
                  : <svg width="22" height="22" fill="var(--icon)" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>}
              </button>
            </>
          ) : (
            <>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#e5484d', animation: 'voice-blink 1s infinite' }} />
              <span style={{ color: 'var(--bubble-text)', fontSize: '15px', minWidth: '40px' }}>{formatDuration(recorder.elapsed)}</span>
              <span style={{ flex: 1, textAlign: 'center', color: 'var(--time-in)', fontSize: '14px', transform: `translateX(${dragX}px)`, opacity: 1 - Math.min(1, -dragX / CANCEL_DISTANCE) }}>
                ‹ Slide to cancel
              </span>
            </>
          )}
        </div>
      )}

      {/* Lock hint above the mic while holding */}
      {active && !locked && (
        <div aria-hidden="true" style={{ position: 'absolute', right: '10px', bottom: '58px', width: '32px', padding: '8px 0', borderRadius: '16px', background: 'var(--bubble-in)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 5 }}>
          <svg width="16" height="16" fill="none" stroke="var(--icon)" strokeWidth="1.8" strokeLinecap="round" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          <svg width="12" height="12" fill="none" stroke="var(--time-in)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>
        </div>
      )}

      {locked ? (
        <button aria-label="Send voice message" style={ICON_BUTTON} {...tap(() => finish(true))}>
          <span style={{ width: '33px', height: '33px', borderRadius: '50%', background: 'var(--accent-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" fill="#0b1a10" viewBox="0 0 24 24"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.39 1.17L4.5 12l-2.49 7.23a1 1 0 001.39 1.17z"/></svg>
          </span>
        </button>
      ) : (
        <button ref={micRef} aria-label="Record voice message" style={{ ...ICON_BUTTON, touchAction: 'none' }} onClick={() => onNotice(HINT)}>
          <span style={{ width: active ? '44px' : '33px', height: active ? '44px' : '33px', borderRadius: '50%', background: 'var(--accent-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width .12s, height .12s' }}>
            <svg width="20" height="20" fill="none" stroke="#0b1a10" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
              <rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>
            </svg>
          </span>
        </button>
      )}
    </>
  );
}
