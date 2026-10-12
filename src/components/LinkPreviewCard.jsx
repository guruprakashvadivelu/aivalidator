import React, { useState } from 'react';

/**
 * WhatsApp-style link preview.
 * - variant "compose": compact card above the message box, with ✕ to send without it.
 * - variant "bubble": inside a sent message, image on top; the whole card opens the link.
 * The image is hidden if it fails to load (e.g. an expired Instagram image URL).
 */
export default function LinkPreviewCard({ preview, variant, onDismiss }) {
  const [imageOk, setImageOk] = useState(true);
  const { url, title, description, image, siteName } = preview;
  const showImage = image && imageOk;
  const img = style => <img src={image} alt="" onError={() => setImageOk(false)} style={{ objectFit: 'cover', display: 'block', ...style }} />;
  const text = (
    <div style={{ minWidth: 0, flex: 1 }}>
      {siteName && <div style={{ color: 'var(--time-in)', fontSize: '12px', marginBottom: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{siteName}</div>}
      {title && <div style={{ color: 'var(--bubble-text)', fontSize: '14px', fontWeight: 600, lineHeight: '18px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{title}</div>}
      {description && <div style={{ color: 'var(--time-in)', fontSize: '13px', lineHeight: '17px', marginTop: '2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{description}</div>}
    </div>
  );

  if (variant === 'compose') {
    return (
      <div data-link-preview="compose" style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '6px 8px 0', padding: '8px', borderRadius: '10px', background: 'var(--bubble-in)', borderLeft: '3px solid var(--accent-green)' }}>
        {showImage && img({ width: '56px', height: '56px', borderRadius: '6px', flexShrink: 0 })}
        {text}
        <button aria-label="Remove link preview" onMouseDown={e => e.preventDefault()} onTouchEnd={e => { e.preventDefault(); onDismiss(); }} onClick={onDismiss}
          style={{ width: '32px', height: '32px', flexShrink: 0, border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--time-in)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    );
  }

  return (
    <a data-link-preview="bubble" href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: 'block', margin: '-2px -6px 6px', borderRadius: '12px', overflow: 'hidden', background: 'rgba(0,0,0,0.22)', textDecoration: 'none' }}>
      {showImage && img({ width: '100%', maxHeight: '150px' })}
      <div style={{ padding: '8px 10px' }}>{text}</div>
    </a>
  );
}
