import { useState, useEffect, useCallback, useRef } from 'react';
import { ref, onValue, push, set, remove, update } from 'firebase/database';
import { db } from '../firebase/config';

export function useMessages(currentUser, selectedChat) {
  const [messages, setMessages] = useState([]);
  const [reads, setReads] = useState({});
  const [typing, setTyping] = useState({});
  const [reactions, setReactions] = useState({});
  const prevCountRef = useRef(0);
  const deletionMode = localStorage.getItem('deleteMode') || 'after_read';

  useEffect(() => {
    const u1 = onValue(ref(db, 'messages'), snap => {
      const data = snap.val() || {};
      const list = Object.entries(data)
        .map(([id, m]) => ({ id, ...m }))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      // Sound on new incoming message
      if (list.length > prevCountRef.current) {
        const newest = list[list.length - 1];
        if (newest?.sender !== currentUser && prevCountRef.current > 0) {
          playNotifSound();
        }
      }
      prevCountRef.current = list.length;
      setMessages(list);
    });
    const u2 = onValue(ref(db, 'reads'), snap => setReads(snap.val() || {}));
    const u3 = onValue(ref(db, 'typing'), snap => setTyping(snap.val() || {}));
    const u4 = onValue(ref(db, 'reactions'), snap => setReactions(snap.val() || {}));
    return () => { u1(); u2(); u3(); u4(); };
  }, [currentUser]);

  // Play subtle notification sound
  const playNotifSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      o.type = 'sine';
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  };

  // Mark as read + update last seen
  useEffect(() => {
    messages.forEach(msg => {
      if (msg.sender !== currentUser && !reads[msg.id]?.[currentUser]) {
        set(ref(db, `reads/${msg.id}/${currentUser}`), true);
      }
    });
    // Update last seen
    if (currentUser) {
      set(ref(db, `presence/${currentUser}/lastSeen`), Date.now());
    }
  }, [messages, currentUser, reads]);

  // 24h expiry
  useEffect(() => {
    if (deletionMode !== 'after_24h') return;
    const now = Date.now();
    messages.forEach(async msg => {
      if (msg.timestamp && now - msg.timestamp > 86400000) {
        await remove(ref(db, `messages/${msg.id}`));
        await remove(ref(db, `reads/${msg.id}`));
        await remove(ref(db, `reactions/${msg.id}`));
      }
    });
  }, [messages, deletionMode]);

  const deleteReadMessages = useCallback(async () => {
    if (deletionMode !== 'after_read') return;
    const toDelete = messages.filter(msg =>
      msg.sender !== currentUser
        ? reads[msg.id]?.[currentUser]
        : reads[msg.id]?.[selectedChat]
    );
    for (const msg of toDelete) {
      await remove(ref(db, `messages/${msg.id}`));
      await remove(ref(db, `reads/${msg.id}`));
      await remove(ref(db, `reactions/${msg.id}`));
    }
  }, [messages, reads, currentUser, selectedChat, deletionMode]);

  const sendMessage = useCallback(async (text, replyTo = null) => {
    if (!text.trim()) return;
    const msg = {
      text: text.trim(),
      sender: currentUser,
      timestamp: Date.now(),
      expiresAt: Date.now() + 86400000,
    };
    if (replyTo) {
      msg.replyTo = {
        id: replyTo.id,
        text: replyTo.text || '',
        mediaType: replyTo.mediaType || null,
        sender: replyTo.sender,
      };
    }
    await push(ref(db, 'messages'), msg);
  }, [currentUser]);

  const sendMedia = useCallback(async (mediaUrl, mediaType) => {
    await push(ref(db, 'messages'), {
      mediaUrl, mediaType,
      sender: currentUser,
      timestamp: Date.now(),
      expiresAt: Date.now() + 86400000,
    });
  }, [currentUser]);

  const setTypingStatus = useCallback((isTyping) => {
    set(ref(db, `typing/${currentUser}`), isTyping);
  }, [currentUser]);

  const addReaction = useCallback(async (msgId, emoji) => {
    await set(ref(db, `reactions/${msgId}/${currentUser}`), emoji);
  }, [currentUser]);

  const removeReaction = useCallback(async (msgId) => {
    await remove(ref(db, `reactions/${msgId}/${currentUser}`));
  }, [currentUser]);

  // Unread count - messages from other user not yet read by me
  const unreadCount = messages.filter(msg =>
    msg.sender !== currentUser && !reads[msg.id]?.[currentUser]
  ).length;

  return {
    messages, reads, typing, reactions,
    sendMessage, sendMedia, setTypingStatus,
    deleteReadMessages, addReaction, removeReaction,
    isOtherTyping: !!typing[selectedChat],
    unreadCount,
  };
}
