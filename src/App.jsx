import React, { useMemo, useState } from 'react';
import { usePresence } from './hooks/usePresence';
import LoginScreen from './screens/LoginScreen';
import ChatListScreen from './screens/ChatListScreen';
import ChatScreen from './screens/ChatScreen';
import SettingsScreen from './screens/SettingsScreen';
import CallScreen from './components/CallScreen';
import { CallProvider } from './calls/useCall';
import { createFirebaseSignaling } from './calls/firebaseSignaling';
import { db } from './firebase/config';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState('login');
  const [selectedChat, setSelectedChat] = useState(null);
  const { presence, setOffline } = usePresence(currentUser);
  const signaling = useMemo(() => (currentUser ? createFirebaseSignaling(db, currentUser) : null), [currentUser]);
  const otherUser = currentUser === 'user1' ? 'user2' : 'user1';

  const handleLogin = user => {
    setCurrentUser(user);
    setView('list');
  };

  const handleLogout = () => {
    setOffline();
    setCurrentUser(null);
    setSelectedChat(null);
    setView('login');
  };

  const handleSelectChat = chat => {
    setSelectedChat(chat);
    setView('chat');
  };

  const handleBack = () => {
    setSelectedChat(null);
    setView('list');
  };

  return (
    <CallGate signaling={signaling} me={currentUser} other={otherUser}>
      <div className="app-shell">
        {view === 'login' && <LoginScreen onLogin={handleLogin} />}
        {view === 'list' && (
          <ChatListScreen
            currentUser={currentUser}
            presence={presence}
            onSelectChat={handleSelectChat}
            onLogout={handleLogout}
            onSettings={() => setView('settings')}
          />
        )}
        {view === 'chat' && selectedChat && (
          <ChatScreen
            currentUser={currentUser}
            selectedChat={selectedChat}
            presence={presence}
            onBack={handleBack}
          />
        )}
        {view === 'settings' && (
          <SettingsScreen onBack={() => setView('list')} />
        )}
      </div>
    </CallGate>
  );
}

// Calls (incoming on any screen) only once someone is logged in.
function CallGate({ signaling, me, other, children }) {
  if (!signaling) return children;
  return (<CallProvider me={me} other={other} signaling={signaling}>{children}<CallScreen /></CallProvider>);
}
