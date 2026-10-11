import React, { useEffect, useState } from 'react';

// Temporary diagnostics for the iOS keyboard work: shows the viewport numbers iOS reports, and a
// timeline of what happens in the 1.5s after a text field is focused (events + per-frame samples).
// Renders only on the v2 preview (v2--*.netlify.app) and localhost, never in production.
const ENABLED = typeof location !== 'undefined' &&
  (location.hostname.startsWith('v2--') || location.hostname === 'localhost');

const BUILD = 'A2 hold-until-keyboard #3'; // bump when redeploying, to confirm the phone runs this build
const TIMELINE_MS = 1500;
const MAX_ROWS = 28;

const read = () => {
  const vv = window.visualViewport;
  const header = document.querySelector('.chat-header')?.getBoundingClientRect();
  const screen = document.querySelector('.chat-screen');
  return {
    innerH: window.innerHeight,
    clientH: document.documentElement.clientHeight,
    vvH: vv ? Math.round(vv.height) : '-',
    vvTop: vv ? Math.round(vv.offsetTop) : '-',
    scrollY: Math.round(window.scrollY),
    headerTop: header ? Math.round(header.top) : '-',
    kbClass: screen?.classList.contains('keyboard-open') ? 'yes' : 'no',
  };
};

// Top of the message box (shows when it's moved off-screen for focus, and when it's restored).
const fieldTop = () => {
  const el = document.querySelector('.chat-footer input:not([type=file])');
  return el ? Math.round(el.getBoundingClientRect().top) : '-';
};

// One compact timeline row: ms since touch, what happened, then sY / vvH / vvT / hdr / kb / field top.
const row = (t0, what) => {
  const v = read();
  return `${String(Math.round(performance.now() - t0)).padStart(4)} ${what.padEnd(6)} ` +
    `sY${v.scrollY} vH${v.vvH} vT${v.vvTop} hd${v.headerTop} kb${v.kbClass === 'yes' ? 1 : 0} f${fieldTop()}`;
};

export default function ViewportDebug() {
  const [v, setV] = useState(read);
  const [timeline, setTimeline] = useState([]);

  useEffect(() => {
    if (!ENABLED) return;
    const tick = () => setV(read());
    const id = setInterval(tick, 250);

    let t0 = 0, rows = [], raf = 0, lastSample = '';
    const push = what => {
      if (!t0 || performance.now() - t0 > TIMELINE_MS || rows.length >= MAX_ROWS) return;
      rows.push(row(t0, what));
      setTimeline(rows.slice());
    };
    const sample = () => {
      if (performance.now() - t0 > TIMELINE_MS) return;
      const r = row(t0, 'frame');
      const key = r.slice(12); // ignore the timestamp when de-duplicating identical frames
      if (key !== lastSample) { lastSample = key; push('frame'); }
      raf = requestAnimationFrame(sample);
    };
    const isField = t => ['INPUT', 'TEXTAREA'].includes(t.tagName) && t.type !== 'file';
    const start = () => {
      cancelAnimationFrame(raf);
      t0 = performance.now(); rows = []; lastSample = ''; setTimeline([]);
    };
    // Capture phase on document: runs before the field's own touchstart handler.
    const onTouch = e => {
      if (!isField(e.target)) return;
      start();
      push('touch');
      raf = requestAnimationFrame(sample);
    };
    const onFocus = e => {
      if (!isField(e.target)) return;
      if (!t0 || performance.now() - t0 > TIMELINE_MS) { start(); raf = requestAnimationFrame(sample); }
      push('focus');
    };
    const onWinScroll = () => { push('wscrl'); tick(); };
    const onVvResize = () => { push('vvres'); tick(); };
    const onVvScroll = () => { push('vvscr'); tick(); };

    document.addEventListener('touchstart', onTouch, { capture: true, passive: true });
    document.addEventListener('focusin', onFocus);
    window.addEventListener('scroll', onWinScroll);
    window.visualViewport?.addEventListener('resize', onVvResize);
    window.visualViewport?.addEventListener('scroll', onVvScroll);
    return () => {
      clearInterval(id);
      cancelAnimationFrame(raf);
      document.removeEventListener('touchstart', onTouch, { capture: true });
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('scroll', onWinScroll);
      window.visualViewport?.removeEventListener('resize', onVvResize);
      window.visualViewport?.removeEventListener('scroll', onVvScroll);
    };
  }, []);

  if (!ENABLED) return null;
  return (
    <div style={{
      position: 'fixed', top: 70, left: 4, right: 4, zIndex: 9999, pointerEvents: 'none',
      background: 'rgba(200,0,0,0.88)', color: '#fff', font: '9.5px/1.3 monospace',
      padding: '5px 7px', borderRadius: 6, whiteSpace: 'pre', overflow: 'hidden',
    }}>
      {'V2 DEBUG [' + BUILD + ']  ' + Object.entries(v).map(([k, val], i) => (i === 4 ? '\n' : '') + `${k}:${val}`).join(' ') +
        (timeline.length ? '\n--- after tapping message box (ms) ---\n' + timeline.join('\n') : '\n(tap the message box to record a timeline)')}
    </div>
  );
}
