import React, { useState } from 'react';
import { QUICK_REACTIONS, EMOJI_CATEGORIES } from './emojiData';

/**
 * WhatsApp-style long-press actions for one message: the rest of the chat is dimmed and
 * blurred, a reaction bar sits above the message and an action menu below it; "+" opens a
 * categorised emoji panel.
 *
 * Rendered inside the message's wrapper, which raises itself (position: relative, z-index)
 * while this is open: the backdrop uses z-index -1 so it covers everything else on screen
 * but stays beneath the message itself.
 */
export default function MessageActions({ isMine, myReaction, canCopy, onReact, onReply, onCopy, onClose }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [category, setCategory] = useState(0);
  const side = isMine ? { right: 0 } : { left: 0 };

  const reactionButton = (emoji, size = 40, font = 26) => (
    <button key={emoji} aria-label={`React with ${emoji}`} onClick={() => onReact(emoji)}
      style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
        fontSize: `${font}px`, lineHeight: 1, background: myReaction === emoji ? 'rgba(255,255,255,0.18)' : 'none' }}>
      {emoji}
    </button>
  );

  const item = (label, icon, handler) => (
    <button role="menuitem" onClick={handler}
      style={{ width: '100%', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        padding: '0 16px', border: 'none', background: 'none', color: 'var(--bubble-text)', fontSize: '16px', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
      {label}
      <svg width="20" height="20" fill="none" stroke="var(--bubble-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
    </button>
  );

  return (
    <div data-message-actions="">
      <div data-message-actions-backdrop="" onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: -1, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }} />

      {!panelOpen && (
        <>
          <div data-reaction-bar="" style={{ position: 'absolute', bottom: 'calc(100% + 8px)', ...side, display: 'flex', alignItems: 'center', gap: '2px',
            padding: '4px 6px', borderRadius: '999px', background: 'var(--bubble-in)', boxShadow: '0 6px 24px rgba(0,0,0,0.45)', whiteSpace: 'nowrap' }}>
            {QUICK_REACTIONS.map(e => reactionButton(e))}
            <button aria-label="More reactions" onClick={() => setPanelOpen(true)}
              style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" fill="none" stroke="var(--bubble-text)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>

          <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 8px)', ...side, width: '210px', borderRadius: '14px', overflow: 'hidden',
            background: 'var(--bubble-in)', boxShadow: '0 6px 24px rgba(0,0,0,0.45)' }}>
            {item('Reply', <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>, onReply)}
            {canCopy && (
              <>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                {item('Copy', <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></>, onCopy)}
              </>
            )}
          </div>
        </>
      )}

      {panelOpen && (
        <div data-emoji-panel="" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: '48vh', background: '#1b1d1d',
          borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div style={{ width: '36px', height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.25)', margin: '8px auto 4px' }} />
          <div role="tablist" style={{ display: 'flex', justifyContent: 'space-around', padding: '0 6px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {EMOJI_CATEGORIES.map((c, i) => (
              <button key={c.label} role="tab" aria-label={c.label} aria-selected={i === category} onClick={() => setCategory(i)}
                style={{ width: '40px', height: '40px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', padding: 0,
                  opacity: i === category ? 1 : 0.5, borderBottom: i === category ? '2px solid var(--accent-green)' : '2px solid transparent' }}>
                {c.icon}
              </button>
            ))}
          </div>
          <div style={{ color: 'var(--time-in)', fontSize: '12px', padding: '8px 14px 4px' }}>{EMOJI_CATEGORIES[category].label}</div>
          <div data-emoji-grid="" style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', padding: '0 8px 8px', alignContent: 'start' }}>
            {EMOJI_CATEGORIES[category].emoji.map(e => reactionButton(e, 44, 28))}
          </div>
        </div>
      )}
    </div>
  );
}
