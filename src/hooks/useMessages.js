import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, push, set, remove } from 'firebase/database';
import { db } from '../firebase/config';

export function useMessages(currentUser, selectedChat) {
  const [messages, setMessages] = useState([]);
  const [reads, setReads] = useState({});
  const [typing, setTyping] = useState({});
  const deletionMode = localStorage.getItem('deleteMode') || 'after_read';

  useEffect(() => {
    const u1 = onValue(ref(db, 'messages'), snap => {
      const data = snap.val() || {};
      setMessages(
        Object.entries(data)
          .map(([id, m]) => ({ id, ...m }))
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      );
    });
    const u2 = onValue(ref(db, 'reads'), snap => setReads(snap.val() || {}));
    const u3 = onValue(ref(db, 'typing'), snap => setTyping(snap.val() || {}));
    return () => { u1(); u2(); u3(); };
  }, []);

  // Mark incoming messages as read
  useEffect(() => {
    messages.forEach(msg => {
      if (msg.sender !== currentUser && !reads[msg.id]?.[currentUser]) {
        set(ref(db, `reads/${msg.id}/${currentUser}`), true);
      }
    });
  }, [messages, currentUser, reads]);

  // 24h expiry
  useEffect(() => {
    if (deletionMode !== 'after_24h') return;
    const now = Date.now();
    messages.forEach(async msg => {
      if (msg.timestamp && now - msg.timestamp > 86400000) {
        await remove(ref(db, `messages/${msg.id}`));
        await remove(ref(db, `reads/${msg.id}`));
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
    }
  }, [messages, reads, currentUser, selectedChat, deletionMode]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim()) return;
    await push(ref(db, 'messages'), {
      text: text.trim(),
      sender: currentUser,
      timestamp: Date.now(),
      expiresAt: Date.now() + 86400000,
    });
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

  return {
    messages, reads, typing,
    sendMessage, sendMedia, setTypingStatus, deleteReadMessages,
    isOtherTyping: !!typing[selectedChat],
  };
}
