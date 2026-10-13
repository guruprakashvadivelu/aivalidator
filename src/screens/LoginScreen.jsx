import React, { useEffect, useRef, useState } from 'react';
import { useKeyboardViewport } from '../hooks/useKeyboardViewport';

const PASSCODE = 'Azure@12345';

// Looks like a command-line tool: boot log, tap an instance, then a hidden token prompt.
const BOOT_LINES = [
  [['b', 'airv-cli'], ['dim', ' v2.4.1 (build 7f3c9e2, linux/arm64)']],
  [['dim', `Last login: ${new Date().toUTCString().replace(' GMT', ' UTC')} on ttys004`]],
  [],
  [['dim', '[ 0.000]'], ['', ' loading config ~/.airv/config.toml ... '], ['ok', 'ok']],
  [['dim', '[ 0.142]'], ['', ' resolving validation cluster eu-west-2 ... '], ['ok', 'ok']],
  [['dim', '[ 0.388]'], ['', ' TLS handshake (TLSv1.3, x25519) ... '], ['ok', 'ok']],
  [['dim', '[ 0.511]'], ['', ' model registry: 14 models, 2 instances '], ['ok', 'online']],
  [['dim', '[ 0.604]'], ['warn', ' warn:'], ['', ' response cache 87% full, run '], ['acc', 'airv cache prune']],
  [],
];
const BOOT_STEP_MS = 110;
const INSTANCES = [['user1', 'a', 'Instance A'], ['user2', 'b', 'Instance B']];
const COLORS = { dim: '#6f6f6f', ok: '#3fb950', warn: '#d29922', err: '#f85149', acc: '#58a6ff', b: '#f0f0f0' };

const Line = ({ parts }) => (
  <div>{parts.length ? parts.map(([c, t], i) => <span key={i} style={c ? { color: COLORS[c] } : undefined}>{t}</span>) : ' '}</div>
);
const Cursor = () => <span className="term-cursor" aria-hidden="true" />;

const LoginScreen = ({ onLogin }) => {
  const [booted, setBooted] = useState(0);
  const [user, setUser] = useState(null);
  const [log, setLog] = useState([]); // finished prompt lines after the instance is picked
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef(null);
  const screenRef = useRef(null);
  // With the keyboard up, fit the screen above it and keep the newest line in view, like a terminal.
  const keyboardOpen = useKeyboardViewport(screenRef);
  useEffect(() => {
    const el = screenRef.current;
    if (el && user) el.scrollTop = el.scrollHeight;
  }, [keyboardOpen, user, log, busy]);

  useEffect(() => {
    if (booted >= BOOT_LINES.length) return undefined;
    const t = setTimeout(() => setBooted(n => n + 1), BOOT_STEP_MS);
    return () => clearTimeout(t);
  }, [booted]);

  const name = user && INSTANCES.find(i => i[0] === user)[1];
  const prompt = name && [['', `token for instance-${name}: `]];

  // Focus inside the tap itself, or iOS won't open the keyboard.
  const pick = u => {
    if (user) return;
    setUser(u);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (busy || done) return;
    setBusy(true);
    const entered = token;
    setToken('');
    setTimeout(() => {
      setBusy(false);
      if (entered !== PASSCODE) {
        setLog(l => [...l, prompt, [['err', 'error:'], ['', ' authentication failed (401)']]]);
        inputRef.current?.focus();
        return;
      }
      setDone(true);
      inputRef.current?.blur();
      setLog(l => [...l, prompt, [['ok', 'authenticated'], ['', ` as instance-${name} `], ['dim', '· session 3h · scope: validate,read']]]);
      setTimeout(() => onLogin(user), 400);
    }, 350);
  };

  const bootDone = booted >= BOOT_LINES.length;
  return (
    <div ref={screenRef} className={`login-screen${keyboardOpen ? ' keyboard-open' : ''}`}
      onClick={() => { if (user && !done) inputRef.current?.focus(); }}>
      <div className="term">
        {BOOT_LINES.slice(0, booted).map((parts, i) => <Line key={i} parts={parts} />)}
        {bootDone && (
          <>
            <Line parts={[['ok', 'airv'], ['', ':'], ['acc', '~'], ['', '$ login']]} />
            <Line parts={[['dim', 'select instance:']]} />
            {INSTANCES.map(([u, key, label], i) => (
              <button key={u} type="button" aria-label={label} className="term-option"
                onClick={e => { e.stopPropagation(); pick(u); }}
                style={{ opacity: user && user !== u ? 0.35 : 1 }}>
                {'  '}<span style={{ color: COLORS.acc }}>[{i + 1}]</span> instance-{key}{'  '}
                <span style={{ color: COLORS.dim }}>(eu-west-2, idle)</span>
              </button>
            ))}
            {log.map((parts, i) => <Line key={i} parts={parts} />)}
            {/* The current prompt line. The token is typed into an invisible password field laid over it,
                so iOS opens the keyboard right below the prompt, nothing is echoed, and iOS Passwords can
                fill a saved token with Face ID (matched by the instance as user name). Rendered before an
                instance is picked so the tap can focus it straight away. */}
            <form className="term-line" onSubmit={e => { e.preventDefault(); submit(); }}>
              {user && !done && <>{prompt[0][1]}{!busy && <Cursor />}</>}
              <input type="text" name="username" autoComplete="username" value={name ? `instance-${name}` : ''}
                readOnly tabIndex={-1} aria-hidden="true" className="term-user" />
              <input ref={inputRef} className="term-input" type="password" name="password" value={token} aria-label="Token"
                autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                enterKeyHint="go" tabIndex={user && !done ? 0 : -1}
                onChange={e => setToken(e.target.value)} />
              {/* With two fields, Enter/Go only submits if the form has a submit button. */}
              <button type="submit" tabIndex={-1} aria-hidden="true" className="term-user" />
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginScreen;
