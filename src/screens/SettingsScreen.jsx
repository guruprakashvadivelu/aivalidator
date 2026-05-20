import React, { useState } from 'react';
import Toggle from '../components/Toggle';

const SettingsScreen = ({ onBack }) => {
  const [sound, setSound] = useState(() => localStorage.getItem('notifSound') !== 'false');
  const [vibration, setVibration] = useState(() => localStorage.getItem('notifVibration') !== 'false');
  const [deleteMode, setDeleteMode] = useState(() => localStorage.getItem('deleteMode') || 'after_read');
  const [notifPerm, setNotifPerm] = useState(() =>
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );

  const save = (key, val) => localStorage.setItem(key, val);

  const handleSound = v => { setSound(v); save('notifSound', v); };
  const handleVibration = v => { setVibration(v); save('notifVibration', v); };
  const handleDeleteMode = v => {
    const m = v ? 'after_24h' : 'after_read';
    setDeleteMode(m);
    save('deleteMode', m);
  };
  const handleNotifPerm = async () => {
    if (typeof Notification === 'undefined') { alert('Notifications not supported'); return; }
    const p = await Notification.requestPermission();
    setNotifPerm(p === 'granted');
    if (p === 'granted') alert('Notifications enabled!');
    else alert('Notifications denied. Please enable in browser settings.');
  };

  const section = (children) => (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', marginBottom: '12px' }}>
      {children}
    </div>
  );

  const row = (label, sub, right) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
      <div>
        <p style={{ color: 'white', fontSize: '15px', margin: '0 0 2px' }}>{label}</p>
        {sub && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: 0 }}>{sub}</p>}
      </div>
      {right}
    </div>
  );

  const divider = () => <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '12px 0' }} />;

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px 12px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}>
            <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ color: 'white', fontWeight: '700', fontSize: '18px' }}>Settings</span>
        </div>
      </div>

      <div className="settings-body" style={{ padding: '16px' }}>
        {section(<>
          <p style={{ color: 'white', fontWeight: '600', fontSize: '16px', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🔔 Notifications
          </p>
          {row('Permission', null,
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '600', background: notifPerm ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', color: notifPerm ? '#22c55e' : '#ef4444' }}>
                {notifPerm ? 'Enabled' : 'Disabled'}
              </span>
              {!notifPerm && (
                <button onClick={handleNotifPerm} style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', border: 'none', borderRadius: '8px', color: 'white', fontSize: '13px', fontWeight: '600', padding: '6px 12px', cursor: 'pointer' }}>
                  Enable
                </button>
              )}
            </div>
          )}
          {divider()}
          {row('Sound', 'Play sound on notification', <Toggle value={sound} onChange={handleSound} />)}
          {divider()}
          {row('Vibration', 'Vibrate on notification', <Toggle value={vibration} onChange={handleVibration} />)}
        </>)}

        {section(<>
          <p style={{ color: 'white', fontWeight: '600', fontSize: '16px', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🕐 Message History
          </p>
          {row(
            'Keep for 24 hours',
            deleteMode === 'after_24h' ? 'Messages delete after 24h' : 'Messages delete after both read',
            <Toggle value={deleteMode === 'after_24h'} onChange={handleDeleteMode} color="#a855f7" />
          )}
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '12px', marginTop: '12px', color: 'rgba(255,255,255,0.45)', fontSize: '13px', lineHeight: '1.5' }}>
            {deleteMode === 'after_read'
              ? '📱 Snapchat mode: Messages disappear after both users read and exit.'
              : '🕐 Time mode: Messages auto-delete 24 hours after being sent.'}
          </div>
        </>)}

        {section(<>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>🔒</span>
            <div>
              <p style={{ color: 'white', fontWeight: '600', margin: '0 0 4px' }}>Privacy First</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', lineHeight: '1.5', margin: 0 }}>
                Notifications show only generic text. No message content, names, or previews are ever shown.
              </p>
            </div>
          </div>
        </>)}
      </div>
    </div>
  );
};

export default SettingsScreen;
