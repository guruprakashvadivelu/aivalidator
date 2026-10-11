import React, { useEffect, useState } from 'react';

// Temporary diagnostics for the iOS keyboard work: shows the viewport numbers iOS reports.
// Renders only on the v2 preview (v2--*.netlify.app) and localhost, never in production.
const ENABLED = typeof location !== 'undefined' &&
  (location.hostname.startsWith('v2--') || location.hostname === 'localhost');

const read = () => {
  const vv = window.visualViewport;
  const header = document.querySelector('.chat-header')?.getBoundingClientRect();
  const screen = document.querySelector('.chat-screen');
  return {
    innerH: window.innerHeight,
    clientH: document.documentElement.clientHeight,
    vvH: vv ? Math.round(vv.height) : '-',
    vvTop: vv ? Math.round(vv.offsetTop) : '-',
    vvPageTop: vv ? Math.round(vv.pageTop) : '-',
    scrollY: Math.round(window.scrollY),
    headerTop: header ? Math.round(header.top) : '-',
    kbClass: screen?.classList.contains('keyboard-open') ? 'yes' : 'no',
    standalone: window.navigator.standalone ? 'yes' : 'no',
  };
};

export default function ViewportDebug() {
  const [v, setV] = useState(read);
  useEffect(() => {
    if (!ENABLED) return;
    const tick = () => setV(read());
    const id = setInterval(tick, 250);
    window.visualViewport?.addEventListener('resize', tick);
    window.visualViewport?.addEventListener('scroll', tick);
    window.addEventListener('scroll', tick);
    return () => {
      clearInterval(id);
      window.visualViewport?.removeEventListener('resize', tick);
      window.visualViewport?.removeEventListener('scroll', tick);
      window.removeEventListener('scroll', tick);
    };
  }, []);
  if (!ENABLED) return null;
  return (
    <div style={{
      position: 'fixed', top: '50%', right: 4, zIndex: 9999, pointerEvents: 'none',
      background: 'rgba(200,0,0,0.85)', color: '#fff', font: '11px/1.35 monospace',
      padding: '6px 8px', borderRadius: 6, whiteSpace: 'pre',
    }}>
      {'V2 DEBUG\n' + Object.entries(v).map(([k, val]) => `${k}: ${val}`).join('\n')}
    </div>
  );
}
