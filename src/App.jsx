import React, { useState } from 'react';
import { usePresence } from './hooks/usePresence';
import LoginScreen from './screens/LoginScreen';
import ChatListScreen from './screens/ChatListScreen';
import ChatScreen from './screens/ChatScreen';
import SettingsScreen from './screens/SettingsScreen';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState('login');
  const [selectedChat, setSelectedChat] = useState(null);
  const { presence, setOffline } = usePresence(currentUser);

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
  );
}
