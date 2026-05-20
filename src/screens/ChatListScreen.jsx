import React from 'react';

const ChatListScreen = ({ currentUser, presence, onSelectChat, onLogout, onSettings }) => {
  const other = currentUser === 'user1' ? 'user2' : 'user1';
  const otherName = other === 'user1' ? 'Instance A' : 'Instance B';
  const otherLetter = other === 'user1' ? 'A' : 'B';
  const myLetter = currentUser === 'user1' ? 'A' : 'B';
  const isOnline = !!presence[other]?.online;

  return (
    <div className="chatlist-screen">
      {/* Header - safe-area-aware via CSS */}
      <div className="chatlist-header">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px 12px',
        }}>
          {/* My avatar */}
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #a855f7, #ec4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '700', fontSize: '15px', color: 'white', flexShrink: 0,
          }}>
            {myLetter}
          </div>

          <span style={{ color: 'white', fontWeight: '700', fontSize: '18px' }}>
            Responses
          </span>

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

      {/* List */}
      <div className="chatlist-body">
        <div
          onClick={() => onSelectChat(other)}
          style={{
            display: 'flex', alignItems: 'center',
            padding: '12px 16px', cursor: 'pointer', gap: '14px',
            transition: 'background 0.15s',
          }}
          onTouchStart={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onTouchEnd={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #a855f7, #ec4899)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: '700', fontSize: '22px', color: 'white',
            }}>
              {otherLetter}
            </div>
            {isOnline && (
              <div style={{
                position: 'absolute', bottom: '2px', right: '2px',
                width: '13px', height: '13px', borderRadius: '50%',
                background: '#22c55e', border: '2.5px solid #000',
              }} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'white', fontWeight: '600', fontSize: '16px', marginBottom: '2px' }}>
              {otherName}
            </div>
            <div style={{ color: isOnline ? '#22c55e' : 'rgba(255,255,255,0.38)', fontSize: '13px' }}>
              {isOnline ? 'Online' : 'Offline'}
            </div>
          </div>

          <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
      </div>
    </div>
  );
};

export default ChatListScreen;
