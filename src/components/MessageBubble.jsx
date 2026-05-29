import React, { useState, useRef, useCallback } from 'react';

const EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🙏'];

const Ticks = ({ isRead }) => (
  <svg width="16" height="11" viewBox="0 0 16 11" fill="none" style={{ flexShrink: 0 }}>
    {isRead ? (
      <>
        <path d="M1 5.5L4.5 9L10 2" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 5.5L8.5 9L14 2" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </>
    ) : (
      <path d="M3 5.5L6.5 9L13 2" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    )}
  </svg>
);

const ReplyPreview = ({ replyTo, isMine }) => {
  if (!replyTo) return null;
  return (
    <div style={{ borderLeft: `3px solid ${isMine ? 'rgba(255,255,255,0.4)' : '#00a884'}`, paddingLeft: '8px', marginBottom: '5px', opacity: 0.85 }}>
      <div style={{ color: isMine ? 'rgba(255,255,255,0.7)' : '#00a884', fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>
        {replyTo.sender === 'user1' ? 'Instance A' : 'Instance B'}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {replyTo.mediaType ? `📎 ${replyTo.mediaType}` : replyTo.text}
      </div>
    </div>
  );
};

const ReactionsDisplay = ({ reactions, currentUser, onReact, msgId }) => {
  if (!reactions || Object.keys(reactions).length === 0) return null;
  const grouped = {};
  Object.entries(reactions).forEach(([user, emoji]) => {
    if (!grouped[emoji]) grouped[emoji] = [];
    grouped[emoji].push(user);
  });
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
      {Object.entries(grouped).map(([emoji, users]) => (
        <button key={emoji} onClick={() => onReact(msgId, emoji)} style={{
          background: users.includes(currentUser) ? 'rgba(0,168,132,0.2)' : 'rgba(255,255,255,0.1)',
          border: `1px solid ${users.includes(currentUser) ? 'rgba(0,168,132,0.5)' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: '999px', padding: '2px 7px', fontSize: '13px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', color: 'white',
        }}>
          {emoji}{users.length > 1 && <span style={{ fontSize: '11px' }}>{users.length}</span>}
        </button>
      ))}
    </div>
  );
};

const EmojiPicker = ({ onSelect, onClose, isMine }) => (
  <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
    <div style={{
      position: 'absolute',
      [isMine ? 'right' : 'left']: 0,
      bottom: 'calc(100% + 6px)',
      background: '#2a3942',
      borderRadius: '999px',
      padding: '8px 12px',
      display: 'flex', gap: '8px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      zIndex: 51,
    }}>
      {EMOJIS.map(e => (
        <button key={e} onClick={() => onSelect(e)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', padding: '2px', lineHeight: 1 }}>
          {e}
        </button>
      ))}
    </div>
  </>
);

const MessageBubble = React.memo(({ msg, isMine, isRead, onMediaClick, onReply, reactions, currentUser, onReact }) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const longPressTimer = useRef(null);
  const swipeStartX = useRef(null);
  const didLongPress = useRef(false);

  const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msgReactions = reactions?.[msg.id];

  // Long press detection
  const handleTouchStart = useCallback((e) => {
    swipeStartX.current = e.touches[0].clientX;
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setShowEmojiPicker(true);
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  }, []);

  const handleTouchMove = useCallback((e) => {
    const delta = Math.abs(e.touches[0].clientX - swipeStartX.current);
    if (delta > 10) {
      // User is swiping, cancel long press
      clearTimeout(longPressTimer.current);
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    clearTimeout(longPressTimer.current);
    if (didLongPress.current) return; // Was a long press, don't swipe
    const delta = e.changedTouches[0].clientX - swipeStartX.current;
    if (delta > 60) onReply(msg); // Swipe right to reply
  }, [msg, onReply]);

  const handleReact = useCallback((emoji) => {
    onReact(msg.id, emoji);
    setShowEmojiPicker(false);
  }, [msg.id, onReact]);

  const bubbleContent = (
    <div style={{
      background: isMine ? '#005c4b' : '#1f2c34',
      borderRadius: isMine ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
      padding: '7px 10px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
      userSelect: 'none',
    }}>
      {msg.replyTo && <ReplyPreview replyTo={msg.replyTo} isMine={isMine} />}
      {msg.mediaData || msg.mediaUrl && (
        <div onClick={() => onMediaClick(msg)} style={{ marginBottom: '5px', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer' }}>
          {msg.mediaType === 'image'
            ? <img src={msg.mediaData || msg.mediaUrl} alt="" loading="lazy" style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block' }} />
            : <video src={msg.mediaData || msg.mediaUrl} style={{ maxWidth: '100%', maxHeight: '180px' }} />
          }
        </div>
      )}
      {msg.text && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
          <span style={{ color: 'rgba(255,255,255,0.92)', fontSize: '15px', lineHeight: '1.4', flex: '1 1 auto', wordBreak: 'break-word' }}>
            {msg.text}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, paddingBottom: '1px' }}>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', whiteSpace: 'nowrap' }}>{timeStr}</span>
            {isMine && <Ticks isRead={isRead} />}
          </span>
        </div>
      )}
      {/* Timestamp for media-only messages */}
      {msg.mediaData || msg.mediaUrl && !msg.text && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '3px', marginTop: '3px' }}>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px' }}>{timeStr}</span>
          {isMine && <Ticks isRead={isRead} />}
        </div>
      )}
    </div>
  );

  // Pure snap (image/video no text)
  if (msg.mediaData || msg.mediaUrl && !msg.text) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: '4px', position: 'relative' }}>
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div onClick={() => onMediaClick(msg)} style={{
            position: 'relative', cursor: 'pointer',
            borderRadius: isMine ? '16px 16px 3px 16px' : '16px 16px 16px 3px',
            overflow: 'hidden', width: '200px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}>
            {msg.mediaType === 'image' ? (
              <img src={msg.mediaData || msg.mediaUrl} alt="" loading="lazy" style={{ width: '200px', height: '260px', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ width: '200px', height: '260px', background: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Tap to view</span>
              </div>
            )}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 10px 8px', background: 'linear-gradient(transparent,rgba(0,0,0,0.6))', display: 'flex', justifyContent: 'flex-end', gap: '3px' }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>{timeStr}</span>
              {isMine && <Ticks isRead={isRead} />}
            </div>
          </div>
        </div>
        <ReactionsDisplay reactions={msgReactions} msgId={msg.id} currentUser={currentUser} onReact={handleReact} />
        {showEmojiPicker && <EmojiPicker onSelect={handleReact} onClose={() => setShowEmojiPicker(false)} isMine={isMine} />}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: '3px', position: 'relative' }}>
      <div
        style={{ maxWidth: '78%', position: 'relative' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {bubbleContent}
        {showEmojiPicker && <EmojiPicker onSelect={handleReact} onClose={() => setShowEmojiPicker(false)} isMine={isMine} />}
      </div>
      <ReactionsDisplay reactions={msgReactions} msgId={msg.id} currentUser={currentUser} onReact={handleReact} />
    </div>
  );
}, (prev, next) =>
  prev.msg.id === next.msg.id &&
  prev.isRead === next.isRead &&
  JSON.stringify(prev.reactions?.[prev.msg.id]) === JSON.stringify(next.reactions?.[next.msg.id])
);

export default MessageBubble;
