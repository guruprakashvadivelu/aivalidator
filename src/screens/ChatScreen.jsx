import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMessages } from '../hooks/useMessages';
import { uploadMedia } from '../services/mediaService';
import MessageBubble from '../components/MessageBubble';
import SnapViewer from '../components/SnapViewer';

// Date separator helper
const getDateLabel = (timestamp) => {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

const DateSeparator = ({ label }) => (
  <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
    <span style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '12px', padding: '3px 10px', borderRadius: '999px' }}>
      {label}
    </span>
  </div>
);

const ReplyBar = ({ replyTo, onCancel }) => {
  if (!replyTo) return null;
  return (
    <div style={{ background: '#1a2830', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '3px solid #00a884' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#00a884', fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>
          {replyTo.sender === 'user1' ? 'Instance A' : 'Instance B'}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {replyTo.mediaType ? `📎 ${replyTo.mediaType}` : replyTo.text}
        </div>
      </div>
      <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'rgba(255,255,255,0.5)' }}>
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  );
};

const ChatScreen = ({ currentUser, selectedChat, presence, onBack }) => {
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [snapViewer, setSnapViewer] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [mediaPreview, setMediaPreview] = useState(null);

  const messagesEndRef = useRef(null);
  const messagesBodyRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const typingTimer = useRef(null);
  const inputRef = useRef(null);

  const {
    messages, reads, isOtherTyping, reactions,
    sendMessage, sendMedia, setTypingStatus,
    deleteReadMessages, addReaction, removeReaction,
  } = useMessages(currentUser, selectedChat);

  const otherName = selectedChat === 'user1' ? 'Instance A' : 'Instance B';
  const otherLetter = selectedChat === 'user1' ? 'A' : 'B';
  const otherPresence = presence[selectedChat];

  // Last seen formatting
  const presenceText = otherPresence?.online
    ? 'Online'
    : otherPresence?.lastSeen
      ? (() => {
          const diff = Date.now() - otherPresence.lastSeen;
          if (diff < 60000) return 'Last seen just now';
          if (diff < 3600000) return `Last seen ${Math.floor(diff / 60000)}m ago`;
          if (diff < 86400000) return `Last seen ${Math.floor(diff / 3600000)}h ago`;
          return `Last seen ${new Date(otherPresence.lastSeen).toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
        })()
      : 'Offline';

  // Scroll behavior
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const handleScroll = () => {
    const el = messagesBodyRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 150);
  };

  const handleBack = async () => {
    await deleteReadMessages();
    setTypingStatus(false);
    onBack();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setReplyTo(null);
    setTypingStatus(false);
    clearTimeout(typingTimer.current);
    await sendMessage(text, replyTo);
  };

  const handleInputChange = e => {
    setInput(e.target.value);
    setTypingStatus(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTypingStatus(false), 1500);
  };

  // File select → show preview before sending
  const handleFileSelected = async (file) => {
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { alert('Please select an image or video'); return; }
    const url = URL.createObjectURL(file);
    setMediaPreview({ file, url, type: isImage ? 'image' : 'video' });
  };

  const handleSendMedia = async () => {
    if (!mediaPreview) return;
    setUploading(true);
    setMediaPreview(null);
    try {
      const { url, type } = await uploadMedia(mediaPreview.file, currentUser);
      await sendMedia(url, type);
    } catch {
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleReact = async (msgId, emoji) => {
    if (!emoji) {
      await removeReaction(msgId);
    } else {
      const current = reactions?.[msgId]?.[currentUser];
      if (current === emoji) {
        await removeReaction(msgId);
      } else {
        await addReaction(msgId, emoji);
      }
    }
  };

  // Group messages by date
  const grouped = [];
  let lastDate = null;
  messages.forEach(msg => {
    const label = getDateLabel(msg.timestamp);
    if (label !== lastDate) {
      grouped.push({ type: 'separator', label, key: `sep-${msg.timestamp}` });
      lastDate = label;
    }
    grouped.push({ type: 'message', msg, key: msg.id });
  });

  return (
    <div className="chat-screen">
      {snapViewer && <SnapViewer snap={snapViewer} onClose={() => setSnapViewer(null)} />}

      {/* Media Preview Modal */}
      {mediaPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          {mediaPreview.type === 'image'
            ? <img src={mediaPreview.url} alt="" style={{ maxWidth: '90vw', maxHeight: '65vh', objectFit: 'contain', borderRadius: '12px' }} />
            : <video src={mediaPreview.url} controls style={{ maxWidth: '90vw', maxHeight: '65vh', borderRadius: '12px' }} />
          }
          <div style={{ display: 'flex', gap: '16px' }}>
            <button onClick={() => setMediaPreview(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '999px', color: 'white', padding: '12px 28px', fontSize: '15px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSendMedia} style={{ background: '#00a884', border: 'none', borderRadius: '999px', color: 'white', padding: '12px 28px', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
              Send
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={handleBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px 4px 2px', display: 'flex' }}>
              <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>
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

      {/* MESSAGES */}
      <div ref={messagesBodyRef} className="chat-messages" style={{ padding: '8px 12px' }} onScroll={handleScroll}>
        {grouped.map(item =>
          item.type === 'separator'
            ? <DateSeparator key={item.key} label={item.label} />
            : <MessageBubble
                key={item.key}
                msg={item.msg}
                isMine={item.msg.sender === currentUser}
                isRead={!!(reads[item.msg.id]?.[selectedChat])}
                onMediaClick={setSnapViewer}
                onReply={msg => { setReplyTo(msg); inputRef.current?.focus(); }}
                reactions={reactions}
                currentUser={currentUser}
                onReact={handleReact}
              />
        )}
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

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={() => scrollToBottom()}
          style={{
            position: 'absolute', bottom: '80px', right: '16px',
            background: '#1f2c34', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '50%', width: '40px', height: '40px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)', zIndex: 10,
          }}
        >
          <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
      )}

      {/* FOOTER */}
      <div className="chat-footer">
        <ReplyBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px' }}>
          {/* Hidden file inputs */}
          <input type="file" ref={fileInputRef} onChange={e => { handleFileSelected(e.target.files[0]); e.target.value=''; }} accept="image/*,video/*" style={{ display: 'none' }} />
          <input type="file" ref={cameraInputRef} onChange={e => { handleFileSelected(e.target.files[0]); e.target.value=''; }} accept="image/*,video/*" capture="environment" style={{ display: 'none' }} />

          {/* Camera button */}
          <button onClick={() => cameraInputRef.current?.click()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex' }}>
            <svg width="22" height="22" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>

          {/* Attachment button */}
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', opacity: uploading ? 0.5 : 1 }}>
            {uploading
              ? <div style={{ width: '22px', height: '22px', border: '2px solid rgba(255,255,255,0.25)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              : <svg width="22" height="22" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
            }
          </button>

          <input
            ref={inputRef}
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
