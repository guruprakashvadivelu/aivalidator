import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase/config';

const ChatListScreen = ({ currentUser, presence, onSelectChat, onLogout, onSettings }) => {
  const other = currentUser === 'user1' ? 'user2' : 'user1';
  const otherName = other === 'user1' ? 'Instance A' : 'Instance B';
  const otherLetter = other === 'user1' ? 'A' : 'B';
  const myLetter = currentUser === 'user1' ? 'A' : 'B';
  const isOnline = !!presence[other]?.online;

  const [unreadCount, setUnreadCount] = useState(0);
  const [lastMessage, setLastMessage] = useState(null);

  useEffect(() => {
    // Listen to messages and reads together
    let messages = {};
    let reads = {};

    const recalculate = () => {
      const list = Object.entries(messages)
        .map(([id, m]) => ({ id, ...m }))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      // Last message
      if (list.length > 0) setLastMessage(list[list.length - 1]);

      // Unread = messages from other user that I haven't read
      const count = list.filter(msg =>
        msg.sender !== currentUser && !reads[msg.id]?.[currentUser]
      ).length;
      setUnreadCount(count);
    };

    const u1 = onValue(ref(db, 'messages'), snap => {
      messages = snap.val() || {};
      recalculate();
    });

    const u2 = onValue(ref(db, 'reads'), snap => {
      reads = snap.val() || {};
      recalculate();
    });

    return () => { u1(); u2(); };
  }, [currentUser]);

  const formatLastMsg = (msg) => {
    if (!msg) return '';
    if (msg.mediaType === 'image' || msg.mediaData) return '📷 Photo';
    if (msg.mediaType === 'video') return '🎥 Video';
    return msg.text || '';
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  return (
    <div className="chatlist-screen">
      <div className="chatlist-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg,#a855f7,#ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '15px', color: 'white', flexShrink: 0 }}>
            {myLetter}
          </div>
          <span style={{ color: 'white', fontWeight: '700', fontSize: '18px' }}>Responses</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={onSettings} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex' }}>
              <svg width="22" height="22" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </button>
            <button onClick={onLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex' }}>
              <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="chatlist-body">
        <div
          onClick={() => onSelectChat(other)}
          style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', gap: '14px' }}
          onTouchStart={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onTouchEnd={e => e.currentTarget.style.background = 'transparent'}
        >
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg,#a855f7,#ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '22px', color: 'white' }}>
              {otherLetter}
            </div>
            {isOnline && (
              <div style={{ position: 'absolute', bottom: '2px', right: '2px', width: '13px', height: '13px', borderRadius: '50%', background: '#22c55e', border: '2.5px solid #000' }} />
            )}
          </div>

          {/* Text area */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <span style={{ color: 'white', fontWeight: unreadCount > 0 ? '700' : '600', fontSize: '16px' }}>
                {otherName}
              </span>
              {lastMessage && (
                <span style={{ color: unreadCount > 0 ? '#00a884' : 'rgba(255,255,255,0.38)', fontSize: '12px', fontWeight: unreadCount > 0 ? '600' : '400' }}>
                  {formatTime(lastMessage.timestamp)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: unreadCount > 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px', fontWeight: unreadCount > 0 ? '500' : '400' }}>
                {lastMessage ? formatLastMsg(lastMessage) : (isOnline ? 'Online' : 'Offline')}
              </span>
              {/* Unread badge */}
              {unreadCount > 0 && (
                <div style={{ background: '#00a884', borderRadius: '999px', minWidth: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', flexShrink: 0, marginLeft: '8px' }}>
                  <span style={{ color: 'white', fontSize: '12px', fontWeight: '700' }}>{unreadCount}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatListScreen;
