import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMessages } from '../hooks/useMessages';
import { uploadMedia } from '../services/mediaService';
import MessageBubble from '../components/MessageBubble';
import SnapViewer from '../components/SnapViewer';

const ChatScreen = ({ currentUser, selectedChat, presence, onBack }) => {
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [snapViewer, setSnapViewer] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimer = useRef(null);

  const {
    messages, reads, isOtherTyping,
    sendMessage, sendMedia, setTypingStatus, deleteReadMessages
  } = useMessages(currentUser, selectedChat);

  const otherName = selectedChat === 'user1' ? 'Instance A' : 'Instance B';
  const otherLetter = selectedChat === 'user1' ? 'A' : 'B';
  const otherPresence = presence[selectedChat];
  const presenceText = otherPresence?.online
    ? 'Online'
    : otherPresence?.lastSeen
      ? `Last seen ${new Date(otherPresence.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Offline';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const fn = () => { if (document.hidden) deleteReadMessages(); };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, [deleteReadMessages]);

  const handleBack = async () => {
    await deleteReadMessages();
    setTypingStatus(false);
    onBack();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setTypingStatus(false);
    clearTimeout(typingTimer.current);
    await sendMessage(text);
  };

  const handleInputChange = e => {
    setInput(e.target.value);
    setTypingStatus(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTypingStatus(false), 1500);
  };

  const handleFileSelect = async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const { url, type } = await uploadMedia(file, currentUser);
      await sendMedia(url, type);
    } catch {
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    /* 
      chat-screen = flex column, height:100dvh
      iOS with interactive-widget=resizes-content:
        keyboard opens → dvh shrinks → flex column shrinks
        header (flex:0 0 auto) stays full size at top ✓
        footer (flex:0 0 auto) stays full size at bottom ✓
        messages (flex:1) shrinks to fill remaining space ✓
    */
    <div className="chat-screen">
      {snapViewer && <SnapViewer snap={snapViewer} onClose={() => setSnapViewer(null)} />}

      {/* HEADER - flex:0 0 auto - never shrinks */}
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={handleBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px 4px 2px', display: 'flex' }}>
              <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <div style={{ position: 'relative' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg,#a855f7,#ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '15px', color: 'white' }}>
                {otherLetter}
              </div>
              {otherPresence?.online && (
                <div style={{ position: 'absolute', bottom: '1px', right: '1px', width: '10px', height: '10px', borderRadius: '50%', background: '#25d366', border: '2px solid #1f2c34' }} />
              )}
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: '600', fontSize: '15px', lineHeight: 1.2 }}>{otherName}</div>
              <div style={{ color: otherPresence?.online ? '#25d366' : 'rgba(255,255,255,0.45)', fontSize: '12px' }}>{presenceText}</div>
            </div>
          </div>
          <div style={{ display: 'flex' }}>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', opacity: otherPresence?.online ? 1 : 0.3 }}>
              <svg width="20" height="20" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </button>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', opacity: otherPresence?.online ? 1 : 0.3 }}>
              <svg width="20" height="20" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* MESSAGES - flex:1 - takes all space between header and footer */}
      <div className="chat-messages" style={{ padding: '8px 12px' }}>
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isMine={msg.sender === currentUser}
            isRead={!!(reads[msg.id]?.[selectedChat])}
            onMediaClick={setSnapViewer}
          />
        ))}
        {isOtherTyping && (
          <div style={{ display: 'flex', marginBottom: '4px' }}>
            <div style={{ background: '#1f2c34', borderRadius: '12px 12px 12px 2px', padding: '12px 16px', display: 'flex', gap: '4px', alignItems: 'center' }}>
              {[0, 0.2, 0.4].map((d, i) => (
                <span key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'rgba(255,255,255,0.5)', display: 'inline-block', animation: `bounce 1s ${d}s infinite` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* FOOTER - flex:0 0 auto - never shrinks, stays above keyboard */}
      <div className="chat-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px' }}>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,video/*" style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', opacity: uploading ? 0.5 : 1 }}>
            {uploading
              ? <div style={{ width: '22px', height: '22px', border: '2px solid rgba(255,255,255,0.25)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              : <svg width="22" height="22" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
            }
          </button>
          <input
            type="text" value={input} onChange={handleInputChange}
            onKeyPress={e => e.key === 'Enter' && handleSend()}
            placeholder="Message"
            style={{ flex: 1, background: '#2a3942', border: 'none', borderRadius: '24px', padding: '10px 16px', color: 'white', fontSize: '16px', outline: 'none' }}
          />
          <button onClick={handleSend} disabled={!input.trim()}
            style={{ width: '40px', height: '40px', borderRadius: '50%', background: input.trim() ? '#00a884' : '#2a3942', border: 'none', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s', flexShrink: 0 }}>
            <svg width="17" height="17" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatScreen;
