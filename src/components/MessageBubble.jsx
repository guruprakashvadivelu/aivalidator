import React from 'react';

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

const MessageBubble = React.memo(({ msg, isMine, isRead, onMediaClick }) => {
  const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Pure snap (media only)
  if (msg.mediaUrl && !msg.text) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: isMine ? 'flex-end' : 'flex-start',
        marginBottom: '3px',
        paddingLeft: isMine ? '48px' : '0',
        paddingRight: isMine ? '0' : '48px',
      }}>
        <div
          onClick={() => onMediaClick(msg)}
          style={{
            position: 'relative',
            cursor: 'pointer',
            borderRadius: isMine ? '16px 16px 3px 16px' : '16px 16px 16px 3px',
            overflow: 'hidden',
            width: '200px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          {msg.mediaType === 'image' ? (
            <img
              src={msg.mediaUrl}
              alt=""
              loading="lazy"
              style={{ width: '200px', height: '260px', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{ width: '200px', height: '260px', background: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Tap to view</span>
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 10px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '3px' }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>{timeStr}</span>
            {isMine && <Ticks isRead={isRead} />}
          </div>
        </div>
      </div>
    );
  }

  // Text bubble
  return (
    <div style={{
      display: 'flex',
      justifyContent: isMine ? 'flex-end' : 'flex-start',
      marginBottom: '2px',
    }}>
      <div style={{
        maxWidth: '78%',
        background: isMine ? '#005c4b' : '#1f2c34',
        borderRadius: isMine ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        padding: '7px 10px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
      }}>
        {/* Inline media */}
        {msg.mediaUrl && msg.text && (
          <div onClick={() => onMediaClick(msg)} style={{ marginBottom: '5px', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer' }}>
            {msg.mediaType === 'image'
              ? <img src={msg.mediaUrl} alt="" loading="lazy" style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block' }} />
              : <video src={msg.mediaUrl} style={{ maxWidth: '100%', maxHeight: '180px' }} />
            }
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
          <span style={{ color: 'rgba(255,255,255,0.92)', fontSize: '15px', lineHeight: '1.4', flex: '1 1 auto', wordBreak: 'break-word' }}>
            {msg.text}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, paddingBottom: '1px' }}>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', whiteSpace: 'nowrap' }}>{timeStr}</span>
            {isMine && <Ticks isRead={isRead} />}
          </span>
        </div>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.msg.id === next.msg.id &&
  prev.isRead === next.isRead
);

export default MessageBubble;
