import React, { useState } from 'react';

const PASSCODE = 'Azure@12345';

const LoginScreen = ({ onLogin }) => {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    if (!user) { setError('Please select an instance'); return; }
    if (pass !== PASSCODE) { setError('Invalid access token'); return; }
    setLoading(true);
    setTimeout(() => onLogin(user), 300);
  };

  return (
    <div className="login-screen">
      {/* Centered card - uses padding+min-height so it's scrollable when keyboard opens */}
      <div style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '380px',
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '24px',
          padding: '40px 28px',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          {/* Icon + title */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '72px', height: '72px',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              borderRadius: '20px', margin: '0 auto 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '36px', boxShadow: '0 8px 24px rgba(102,126,234,0.4)',
            }}>
              🤖
            </div>
            <h1 style={{ color: 'white', fontSize: '22px', fontWeight: '800', margin: '0 0 6px' }}>
              AI Response Validator
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', margin: 0 }}>
              Select instance and enter access token
            </p>
          </div>

          {/* Instance selector */}
          <div style={{ marginBottom: '20px' }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: '700', letterSpacing: '0.08em', marginBottom: '10px' }}>
              SELECT INSTANCE
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {['user1', 'user2'].map(u => (
                <button
                  key={u}
                  onClick={() => { setUser(u); setError(''); }}
                  style={{
                    flex: 1, padding: '14px 10px',
                    borderRadius: '14px',
                    border: `2px solid ${user === u ? '#667eea' : 'rgba(255,255,255,0.12)'}`,
                    background: user === u ? 'rgba(102,126,234,0.2)' : 'rgba(255,255,255,0.04)',
                    color: 'white', fontWeight: '700', fontSize: '14px',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {u === 'user1' ? 'Instance A' : 'Instance B'}
                </button>
              ))}
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: '24px' }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: '700', letterSpacing: '0.08em', marginBottom: '10px' }}>
              ACCESS TOKEN
            </p>
            <input
              type="password"
              value={pass}
              onChange={e => { setPass(e.target.value); setError(''); }}
              onKeyPress={e => e.key === 'Enter' && handleLogin()}
              placeholder="Enter access token"
              style={{
                width: '100%', padding: '15px 16px',
                borderRadius: '14px',
                border: `2px solid ${error ? '#ef4444' : 'rgba(255,255,255,0.12)'}`,
                background: 'rgba(255,255,255,0.06)',
                color: 'white', fontSize: '16px', outline: 'none',
              }}
            />
            {error && (
              <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '8px', margin: '8px 0 0' }}>{error}</p>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%', padding: '16px',
              borderRadius: '14px', border: 'none',
              background: loading ? 'rgba(102,126,234,0.4)' : 'linear-gradient(135deg, #667eea, #764ba2)',
              color: 'white', fontSize: '16px', fontWeight: '700',
              cursor: loading ? 'default' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 16px rgba(102,126,234,0.35)',
              transition: 'all 0.15s',
            }}
          >
            {loading ? 'Authenticating…' : 'Authenticate'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
