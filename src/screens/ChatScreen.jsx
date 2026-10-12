import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useMessages } from '../hooks/useMessages';
import { useKeyboardViewport, useFocusWithoutScroll } from '../hooks/useKeyboardViewport';
import { processMedia } from '../services/mediaService';
import MessageBubble from '../components/MessageBubble';
import VoiceRecorderBar from '../components/VoiceRecorderBar';
import LinkPreviewCard from '../components/LinkPreviewCard';
import { useLinkPreview } from '../linkPreview/useLinkPreview';
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
    <span style={{ background: '#1d1f1f', color: 'var(--time-in)', fontSize: '12px', fontWeight: 500, padding: '4px 10px', borderRadius: '8px' }}>
      {label}
    </span>
  </div>
);

const ReplyBar = ({ replyTo, onCancel }) => {
  if (!replyTo) return null;
  return (
    <div style={{ background: 'var(--bubble-in)', margin: '6px 8px 0', borderRadius: '10px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '3px solid var(--accent-green)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--accent-green)', fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>
          {replyTo.sender === 'user1' ? 'Instance A' : 'Instance B'}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {replyTo.type === 'voice' ? '🎤 Voice message' : replyTo.mediaType ? `📎 ${replyTo.mediaType}` : replyTo.text}
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

// Message box: 20px lines + 8px padding top and bottom; grows to 5 lines, then scrolls.
const INPUT_LINE_HEIGHT = 20;
const INPUT_PADDING_Y = 7;
const MAX_INPUT_HEIGHT = INPUT_LINE_HEIGHT * 5 + INPUT_PADDING_Y * 2;

// Icon buttons keep a 44pt tap area (iOS minimum) around smaller glyphs.
const ICON_BUTTON = {
  width: '44px', height: '44px', flexShrink: 0, padding: 0, border: 'none', background: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};
// WhatsApp-style rounded "glass" header controls.
const HEADER_PILL = {
  background: 'var(--chat-pill)', border: '1px solid var(--chat-pill-border)', borderRadius: '999px',
};
// Placeholder controls (stickers, voice notes, calls) must not take focus from the message box,
// or iOS closes the keyboard; handle the tap on touchend and cancel it, like the send button.
const keepKeyboard = handler => ({
  onMouseDown: e => e.preventDefault(),
  onTouchEnd: e => { e.preventDefault(); handler(); },
  onClick: handler,
});

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
  const screenRef = useRef(null);
  const inputStandInRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const showNotice = (text, ms = 1600) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), ms);
  };
  const showComingSoon = feature => showNotice(`${feature} — coming soon`);
  const hasText = !!input.trim();
  const { preview: linkPreview, dismiss: dismissLinkPreview } = useLinkPreview(input);
  // While a voice note is recording, keep the recorder mounted and the message box read-only,
  // so a stray keystroke can't swap the mic for Send and discard the recording.
  const [voiceActive, setVoiceActive] = useState(false);

  const {
    messages, reads, isOtherTyping, reactions,
    sendMessage, sendMedia, setTypingStatus, sendVoice, played, loadVoice, markVoicePlayed,
    deleteReadMessages, addReaction, removeReaction,
  } = useMessages(currentUser, selectedChat);

  const keyboardOpen = useKeyboardViewport(screenRef);
  const focusMessageBox = useFocusWithoutScroll(inputRef, inputStandInRef);

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

  // The message list gets shorter when the keyboard opens; keep the latest message in view.
  useEffect(() => {
    if (keyboardOpen && !showScrollBtn) scrollToBottom(false);
  }, [keyboardOpen]);

  const handleScroll = () => {
    const el = messagesBodyRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 150);
  };

  const handleBack = async () => {
    // With the keyboard open, the first tap only closes it; the next tap goes back.
    if (keyboardOpen || document.activeElement === inputRef.current) {
      inputRef.current?.blur();
      return;
    }
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
    await sendMessage(text, replyTo, linkPreview);
  };

  // Tapping a button moves focus off the message box, and iOS closes the keyboard when the
  // field loses focus. Send on touchend and cancel it, so the button never takes focus and the
  // keyboard stays up for the next message. (A finger dragged off the button doesn't send.)
  const handleSendTouchEnd = e => {
    const t = e.changedTouches[0];
    const r = e.currentTarget.getBoundingClientRect();
    if (t.clientX < r.left || t.clientX > r.right || t.clientY < r.top || t.clientY > r.bottom) return;
    e.preventDefault(); // no synthesized mousedown/click, so focus stays in the message box
    handleSend();
  };

  // Grow the message box with its text, up to MAX_INPUT_HEIGHT, then scroll inside it.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [input]);

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
    const fileToUpload = mediaPreview.file;
    setMediaPreview(null);
    setUploading(true);
    try {
      const { dataUrl, type } = await processMedia(fileToUpload);
      await sendMedia(dataUrl, type);
    } catch (err) {
      console.error('Media error:', err);
      alert(err?.message || 'Failed to send media. Please try again.');
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
  grouped.forEach((item, i) => {
    if (item.type !== 'message') return;
    const next = grouped[i + 1];
    item.isGroupEnd = !next || next.type !== 'message' || next.msg.sender !== item.msg.sender;
  });

  return (
    <div ref={screenRef} className={`chat-screen${keyboardOpen ? ' keyboard-open' : ''}`}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px 8px' }}>
          <button onClick={handleBack} aria-label="Back" style={{ ...ICON_BUTTON, ...HEADER_PILL }}>
            <svg width="22" height="22" fill="none" stroke="var(--icon)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>
          </button>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg,#a855f7,#ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '16px', color: 'white' }}>
              {otherLetter}
            </div>
            {otherPresence?.online && (
              <div style={{ position: 'absolute', bottom: '0', right: '0', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-green)', border: '2px solid var(--chat-bar)' }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--bubble-text)', fontWeight: 700, fontSize: '17px', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{otherName}</div>
            <div style={{ color: otherPresence?.online ? 'var(--accent-green)' : 'var(--text-muted)', fontSize: '12px', lineHeight: 1.3 }}>{presenceText}</div>
          </div>
          <div style={{ ...HEADER_PILL, display: 'flex', flexShrink: 0, padding: '0 4px' }}>
            <button aria-label="Video call" style={ICON_BUTTON} {...keepKeyboard(() => showComingSoon('Video calls'))}>
              <svg width="26" height="26" fill="none" stroke="var(--icon)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </button>
            <button aria-label="Voice call" style={ICON_BUTTON} {...keepKeyboard(() => showComingSoon('Voice calls'))}>
              <svg width="22" height="22" fill="none" stroke="var(--icon)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      <div ref={messagesBodyRef} className="chat-messages" style={{ padding: '8px 14px' }} onScroll={handleScroll}>
        {grouped.map(item =>
          item.type === 'separator'
            ? <DateSeparator key={item.key} label={item.label} />
            : <MessageBubble
                key={item.key}
                msg={item.msg}
                isMine={item.msg.sender === currentUser}
                isGroupEnd={item.isGroupEnd}
                voiceListened={!!played[item.msg.id]?.[item.msg.sender === currentUser ? selectedChat : currentUser]}
                loadVoice={loadVoice}
                onVoicePlayed={markVoicePlayed}
                isRead={!!(reads[item.msg.id]?.[selectedChat])}
                onMediaClick={setSnapViewer}
                onReply={msg => { setReplyTo(msg); focusMessageBox(); }}
                onCopy={msg => navigator.clipboard.writeText(msg.text)
                  .then(() => showNotice('Copied'))
                  .catch(() => showNotice("Couldn't copy"))}
                reactions={reactions}
                currentUser={currentUser}
                onReact={handleReact}
              />
        )}
        {isOtherTyping && (
          <div style={{ display: 'flex', marginBottom: '4px' }}>
            <div style={{ background: 'var(--bubble-in)', borderRadius: '18px', padding: '12px 16px', display: 'flex', gap: '4px', alignItems: 'center' }}>
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
          aria-label="Scroll to latest message"
          style={{
            position: 'absolute', bottom: '80px', right: '16px',
            background: 'var(--bubble-in)', border: '1px solid var(--chat-pill-border)',
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

      {/* "Coming soon" note for placeholder controls */}
      {notice && (
        <div role="status" style={{ position: 'absolute', left: '50%', bottom: '84px', transform: 'translateX(-50%)', background: 'var(--bubble-in)', color: 'var(--bubble-text)', fontSize: '13px', padding: '8px 14px', borderRadius: '999px', border: '1px solid var(--chat-pill-border)', whiteSpace: 'nowrap', zIndex: 20, pointerEvents: 'none' }}>
          {notice}
        </div>
      )}

      {/* FOOTER (WhatsApp layout: + · message field with sticker · camera · mic; send while typing) */}
      <div className="chat-footer">
        <ReplyBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />
        {linkPreview && <LinkPreviewCard preview={linkPreview} variant="compose" onDismiss={dismissLinkPreview} />}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', padding: '6px 6px', position: 'relative' }}>
          {/* Hidden file inputs */}
          <input type="file" ref={fileInputRef} onChange={e => { handleFileSelected(e.target.files[0]); e.target.value=''; }} accept="image/*,video/*" style={{ display: 'none' }} />
          <input type="file" ref={cameraInputRef} onChange={e => { handleFileSelected(e.target.files[0]); e.target.value=''; }} accept="image/*,video/*" capture="environment" style={{ display: 'none' }} />

          {/* + : attach a photo or video */}
          <button aria-label="Attach photo or video" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ ...ICON_BUTTON, opacity: uploading ? 0.5 : 1 }}>
            {uploading
              ? <div style={{ width: '22px', height: '22px', border: '2px solid rgba(255,255,255,0.25)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              : <svg width="26" height="26" fill="none" stroke="var(--icon)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16"/></svg>
            }
          </button>

          <div style={{ flex: 1, position: 'relative', minWidth: 0, display: 'flex', marginBottom: '5px' }}>
            {/* Return adds a new line (as in iMessage); messages are sent with the send button. */}
            <textarea
              ref={inputRef}
              rows={1} value={input} onChange={handleInputChange} readOnly={voiceActive}
              aria-label="Message"
              style={{ flex: 1, minWidth: 0, display: 'block', background: 'var(--input-field)', border: 'none', borderRadius: '18px', padding: `${INPUT_PADDING_Y}px 40px ${INPUT_PADDING_Y}px 14px`, color: 'var(--bubble-text)', fontSize: '16px', lineHeight: `${INPUT_LINE_HEIGHT}px`, fontFamily: 'inherit', outline: 'none', resize: 'none', overflowY: 'auto', maxHeight: `${MAX_INPUT_HEIGHT}px` }}
            />
            {/* Look-alike shown while useFocusWithoutScroll holds the real input off-screen. */}
            <div ref={inputStandInRef} aria-hidden="true"
              style={{ visibility: 'hidden', position: 'absolute', inset: 0, background: 'var(--input-field)', borderRadius: '18px', padding: `${INPUT_PADDING_Y}px 40px ${INPUT_PADDING_Y}px 14px`, fontSize: '16px', lineHeight: `${INPUT_LINE_HEIGHT}px`, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'hidden', pointerEvents: 'none' }} />
            {/* Sticker (placeholder) inside the field, bottom-right */}
            <button aria-label="Stickers" {...keepKeyboard(() => showComingSoon('Stickers'))}
              style={{ ...ICON_BUTTON, width: '40px', height: '34px', position: 'absolute', right: 0, bottom: 0 }}>
              <svg width="22" height="22" fill="none" stroke="var(--icon)" strokeWidth="1.8" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M20 13V8a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h5z"/>
                <path d="M20 13h-3a4 4 0 0 0-4 4v3"/>
              </svg>
            </button>
          </div>

          {!hasText && (
            <button aria-label="Camera" onClick={() => cameraInputRef.current?.click()} style={ICON_BUTTON}>
              <svg width="27" height="27" fill="none" stroke="var(--icon)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
          )}

          {hasText && !voiceActive ? (
            <button aria-label="Send" onClick={handleSend} onTouchEnd={handleSendTouchEnd} onMouseDown={e => e.preventDefault()} style={ICON_BUTTON}>
              <span style={{ width: '33px', height: '33px', borderRadius: '50%', background: 'var(--accent-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" fill="#0b1a10" viewBox="0 0 24 24"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.39 1.17L4.5 12l-2.49 7.23a1 1 0 001.39 1.17z"/></svg>
              </span>
            </button>
          ) : (
            <VoiceRecorderBar
              onSend={result => sendVoice(result).catch(() => showNotice("Couldn't send voice message", 2500))}
              onNotice={text => showNotice(text, 2500)}
              onActiveChange={setVoiceActive}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatScreen;
