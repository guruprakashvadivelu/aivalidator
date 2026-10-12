import React, { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../voice/format';
import { WAVEFORM_MAX } from '../voice/waveform';

const SPEEDS = [1, 1.5, 2];
let nowPlaying = null; // only one voice note plays at a time

/** Voice note playback inside a message bubble (WhatsApp style). */
export default function VoiceBubble({ msg, isMine, listened, loadVoice, onPlayed }) {
  const { duration = 0, waveform = [] } = msg.voice || {};
  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const [url, setUrl] = useState(null);
  const [wantPlay, setWantPlay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);

  const audio = () => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = 'auto';
      a.ontimeupdate = () => setTime(a.currentTime);
      a.onplay = () => setPlaying(true);
      a.onpause = () => setPlaying(false);
      a.onended = () => { setPlaying(false); setTime(0); };
      audioRef.current = a;
    }
    return audioRef.current;
  };

  const load = () => loadVoice(msg.id).then(u => { if (audio().src !== u) audio().src = u; setUrl(u); });

  // Prefetch when the bubble scrolls into view, so a tap can start playback immediately
  // (iOS only lets audio start directly from a tap, not after an await).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || url) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        io.disconnect();
        load().catch(() => {});
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [msg.id, url]);

  const play = () => {
    const a = audio();
    if (nowPlaying && nowPlaying !== a) nowPlaying.pause();
    nowPlaying = a;
    a.playbackRate = speed;
    a.play().then(() => { if (!isMine && !listened) onPlayed(msg.id); }).catch(() => {});
  };

  // Tapped before the audio arrived: start as soon as it does.
  useEffect(() => {
    if (url && wantPlay) { setWantPlay(false); play(); }
  }, [url, wantPlay]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = () => {
    if (playing) { audio().pause(); return; }
    if (!url) { setWantPlay(true); load().catch(() => setWantPlay(false)); return; }
    play();
  };

  const seek = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.touches?.[0] || e.changedTouches?.[0] || e).clientX;
    const ratio = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
    if (url) { audio().currentTime = ratio * duration; setTime(ratio * duration); }
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const progress = duration ? time / duration : 0;
  const loading = wantPlay && !url;
  const micColor = isMine
    ? (listened ? 'var(--tick-read)' : 'var(--time-out)')
    : (listened ? 'var(--time-in)' : 'var(--accent-green)');

  return (
    <div ref={rootRef} style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px', padding: '2px 0' }}>
      <button aria-label={playing ? 'Pause voice message' : 'Play voice message'} onClick={toggle} {...(loading && { 'data-voice-loading': '' })}
        style={{ width: '36px', height: '36px', flexShrink: 0, border: 'none', background: 'none', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        {loading
          ? <span style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          : playing
            ? <svg width="24" height="24" fill="var(--bubble-text)" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
            : <svg width="24" height="24" fill="var(--bubble-text)" viewBox="0 0 24 24"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div role="slider" aria-label="Voice message position" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)}
          onClick={seek} onTouchMove={seek}
          style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '26px', cursor: 'pointer' }}>
          {waveform.map((v, i) => (
            <span key={i} style={{ flex: 1, maxWidth: '3px', borderRadius: '1.5px', height: `${3 + (v / WAVEFORM_MAX) * 21}px`, background: i / waveform.length < progress ? 'var(--bubble-text)' : 'rgba(255,255,255,0.4)' }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
          <svg aria-label={listened ? 'Listened' : 'Not listened yet'} width="12" height="12" fill="none" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" stroke={micColor}>
            <rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>
          </svg>
          <span style={{ color: isMine ? 'var(--time-out)' : 'var(--time-in)', fontSize: '11px' }}>{formatDuration(playing || time ? time : duration)}</span>
        </div>
      </div>
      <button aria-label={`Playback speed ${speed}×`} onClick={cycleSpeed}
        style={{ flexShrink: 0, minWidth: '36px', height: '24px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.15)', color: 'var(--bubble-text)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
        {speed}×
      </button>
    </div>
  );
}
