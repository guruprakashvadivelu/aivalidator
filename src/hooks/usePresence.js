import { useState, useEffect } from 'react';
import { ref, set, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { db } from '../firebase/config';

export function usePresence(currentUser) {
  const [presence, setPresence] = useState({});

  useEffect(() => {
    if (!currentUser) return;

    const presRef = ref(db, `presence/${currentUser}`);
    set(presRef, { online: true, lastSeen: Date.now() });
    onDisconnect(presRef).set({ online: false, lastSeen: serverTimestamp() });

    const allPresRef = ref(db, 'presence');
    const unsub = onValue(allPresRef, snap => setPresence(snap.val() || {}));
    return () => unsub();
  }, [currentUser]);

  const setOffline = () => {
    if (!currentUser) return;
    set(ref(db, `presence/${currentUser}`), { online: false, lastSeen: Date.now() });
  };

  return { presence, setOffline };
}
