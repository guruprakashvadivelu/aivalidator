import React, { useRef, useState, useEffect } from 'react';

const SnapViewer = ({ snap, onClose }) => {
  const [dragY, setDragY] = useState(0);
  const [closing, setClosing] = useState(false);
  const startY = useRef(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const close = () => { setClosing(true); setTimeout(onClose, 180); };

  const onTouchStart = e => { startY.current = e.touches[0].clientY; };
  const onTouchMove = e => {
    const d = e.touches[0].clientY - startY.current;
    if (d > 0) setDragY(d);
  };
  const onTouchEnd = () => { dragY > 90 ? close() : setDragY(0); };

  const opacity = Math.max(0, 1 - dragY / 280);
  const scale = Math.max(0.88, 1 - dragY / 900);

  return (
    <div
      className="snap-viewer fade-in"
      style={{ opacity: closing ? 0 : opacity, transition: closing ? 'opacity 0.18s' : 'none' }}
      onClick={close}
    >
      <div
        style={{
          transform: `translateY(${dragY}px) scale(${scale})`,
          transition: dragY === 0 && !closing ? 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={e => e.stopPropagation()}
      >
        {snap.mediaType === 'image' ? (
          <img
            src={snap.mediaData || snap.mediaUrl} alt=""
            className="snap-open"
            style={{ maxWidth: '100vw', maxHeight: '100dvh', objectFit: 'contain', userSelect: 'none' }}
          />
        ) : (
          <video
            src={snap.mediaData || snap.mediaUrl} autoPlay controls playsInline
            className="snap-open"
            style={{ maxWidth: '100vw', maxHeight: '100dvh', objectFit: 'contain' }}
          />
        )}
      </div>

      <button
        onClick={close}
        style={{
          position: 'absolute',
          top: `calc(${getComputedStyle(document.documentElement).getPropertyValue('--sat') || '16px'} + 16px)`,
          right: '16px',
          background: 'rgba(0,0,0,0.55)',
          border: 'none', borderRadius: '50%',
          width: '36px', height: '36px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', backdropFilter: 'blur(8px)',
        }}
      >
        <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>

      <p style={{
        position: 'absolute',
        bottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)',
        left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.35)', fontSize: '12px', margin: 0,
        pointerEvents: 'none',
      }}>
        Swipe down to close
      </p>
    </div>
  );
};

export default SnapViewer;
