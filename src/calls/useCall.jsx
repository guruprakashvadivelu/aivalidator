import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { RING_TIMEOUT_MS, newCall, isIncomingFor, callOutcome } from './callModel';

// One WebRTC call at a time between the two instances. Mounted at App level so an incoming call
// shows on any screen. Signaling is injected (Firebase in the app, a shared fake in the harness).
const FALLBACK_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const DISCONNECT_GRACE_MS = 8000;
const CONNECT_TIMEOUT_MS = 30000; // answered but media never connects
const ICE_MAX_AGE_MS = 12 * 3600 * 1000; // relay credentials last 24 h; refresh well before
const ENDED_SHOW_MS = 1500;
const IDLE = { phase: 'idle' };

const CallContext = createContext(null);
export const useCallState = () => useContext(CallContext)?.state ?? IDLE;
export const useCallActions = () => useContext(CallContext)?.actions ?? null;

const ringTimeout = () => window.__ringTimeoutMs ?? RING_TIMEOUT_MS;
const connectTimeout = () => window.__connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
const iceMaxAge = () => window.__iceMaxAgeMs ?? ICE_MAX_AGE_MS;

function getMedia(kind, facingMode = 'user') {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: kind === 'video' ? { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
}

export function CallProvider({ me, other, signaling, children }) {
  const [state, setState] = useState(IDLE);
  const stateRef = useRef(IDLE);
  const update = useCallback(next => {
    stateRef.current = typeof next === 'function' ? next(stateRef.current) : next;
    setState(stateRef.current);
  }, []);

  const activeRef = useRef(null);
  const iceRef = useRef(FALLBACK_ICE);
  const session = useRef(null); // per-call resources

  const iceFetchedAt = useRef(0);
  const refreshIce = useCallback(() => fetch('/.netlify/functions/turn-credentials')
    .then(r => (r.ok ? r.json() : null))
    .then(j => { if (j?.iceServers?.length) { iceRef.current = j.iceServers; iceFetchedAt.current = Date.now(); } })
    .catch(() => {}), []);
  const iceStale = () => Date.now() - iceFetchedAt.current > iceMaxAge();
  // An iPhone home-screen app can sit suspended for days without reloading, so the relay
  // credentials are refreshed when the app returns and before a call if they're getting old.
  const freshIce = () => (iceStale() ? Promise.race([refreshIce(), new Promise(r => setTimeout(r, 3000))]) : null);
  useEffect(() => {
    refreshIce();
    const onVisible = () => { if (document.visibilityState === 'visible' && iceStale()) refreshIce(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshIce]); // eslint-disable-line react-hooks/exhaustive-deps

  const notify = useCallback(text => {
    update(s => ({ ...s, notice: text }));
    setTimeout(() => update(s => (s.notice === text ? { ...s, notice: null } : s)), 2500);
  }, [update]);

  // Everything a call holds, released in one place.
  const teardown = useCallback(() => {
    const s = session.current;
    session.current = null;
    if (!s) return;
    s.unsubs.forEach(u => { try { u(); } catch {} });
    s.timers.forEach(clearTimeout);
    s.pc?.close();
    s.local?.getTracks().forEach(t => t.stop());
    s.wakeLock?.release().catch(() => {});
  }, []);

  const newSession = id => {
    teardown();
    session.current = { id, unsubs: [], timers: [], pendingLocal: [], pendingRemote: [], signalReady: false, finished: false };
    return session.current;
  };

  // Drop the current call on this phone only (its record was replaced or is gone).
  const abandon = useCallback(() => { teardown(); update(IDLE); }, [teardown, update]);

  const endCall = useCallback(reason => {
    const id = stateRef.current.id;
    if (!id) return;
    // If the record no longer belongs to this call, nothing will report the end: finish here.
    Promise.resolve(signaling.end(id, reason, Date.now())).then(ok => {
      if (!ok && session.current?.id === id && !session.current.finished) abandon();
    });
  }, [signaling, abandon]);

  // The call record says ended: release media, log it (caller only), show a short status.
  const finish = useCallback(active => {
    const s = session.current;
    const cur = stateRef.current;
    if (!s || s.finished || s.id !== active.id) return;
    s.finished = true;
    teardown();
    refreshIce();
    if (cur.role === 'caller') {
      signaling.logCall({ from: me, kind: active.kind, ...callOutcome(active) });
      signaling.clear(active.id);
    }
    const reason = active.endReason;
    if (cur.role === 'callee' && !active.acceptedAt && reason !== 'failed') { update(IDLE); return; }
    const endText = reason === 'declined' || reason === 'busy' ? 'Declined'
      : reason === 'missed' ? 'No answer'
      : reason === 'failed' ? 'Call failed'
      : 'Call ended';
    update({ ...cur, phase: 'ended', endText, remote: null });
    setTimeout(() => { if (stateRef.current.phase === 'ended') update(IDLE); }, ENDED_SHOW_MS);
  }, [me, signaling, teardown, refreshIce, update]);

  const sendCandidate = (s, cand) => {
    if (s.signalReady) signaling.addCandidate(s.id, me, cand);
    else s.pendingLocal.push(cand);
  };
  const markSignalReady = s => {
    s.signalReady = true;
    s.pendingLocal.splice(0).forEach(c => signaling.addCandidate(s.id, me, c));
  };
  const addRemoteCandidate = (s, cand) => {
    if (s.pc?.remoteDescription) s.pc.addIceCandidate(cand).catch(() => {});
    else s.pendingRemote.push(cand);
  };
  const setRemote = async (s, desc) => {
    await s.pc.setRemoteDescription(desc);
    s.pendingRemote.splice(0).forEach(c => s.pc.addIceCandidate(c).catch(() => {}));
  };

  const armConnectTimeout = s => {
    s.timers.push(setTimeout(() => {
      if (session.current === s && stateRef.current.phase !== 'connected') endCall('failed');
    }, connectTimeout()));
  };

  const createPeer = (s, stream) => {
    const pc = new RTCPeerConnection({ iceServers: iceRef.current });
    s.pc = pc;
    s.local = stream;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.onicecandidate = e => { if (e.candidate) sendCandidate(s, e.candidate.toJSON()); };
    pc.ontrack = e => {
      const remote = e.streams[0] || new MediaStream([e.track]);
      if (session.current === s) update(st => ({ ...st, remote }));
    };
    let graceTimer;
    pc.onconnectionstatechange = () => {
      if (session.current !== s) return;
      const cs = pc.connectionState;
      if (cs === 'connected') {
        clearTimeout(graceTimer);
        if (stateRef.current.phase !== 'connected') update(st => ({ ...st, phase: 'connected', connectedAt: Date.now() }));
      } else if (cs === 'failed') {
        endCall('failed');
      } else if (cs === 'disconnected') {
        clearTimeout(graceTimer);
        graceTimer = setTimeout(() => { if (pc.connectionState !== 'connected') endCall('failed'); }, DISCONNECT_GRACE_MS);
        s.timers.push(graceTimer);
      }
    };
    s.unsubs.push(signaling.watchCandidates(s.id, other, c => addRemoteCandidate(s, c)));
    navigator.wakeLock?.request('screen').then(l => { if (session.current === s) s.wakeLock = l; else l.release(); }).catch(() => {});
    return pc;
  };

  const showIncoming = useCallback(active => {
    const s = newSession(active.id);
    // If the caller's app vanished, stop ringing when the ring time is up.
    s.timers.push(setTimeout(() => {
      if (stateRef.current.phase === 'incoming' && stateRef.current.id === active.id) signaling.end(active.id, 'missed', Date.now());
    }, Math.max(0, active.startedAt + RING_TIMEOUT_MS - Date.now())));
    update({ phase: 'incoming', role: 'callee', kind: active.kind, id: active.id, local: null, remote: null });
  }, [signaling, update]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => signaling.watchActive(active => {
    activeRef.current = active;
    const cur = stateRef.current;
    if (cur.phase === 'idle' || cur.phase === 'ended') {
      if (isIncomingFor(active, me, Date.now())) showIncoming(active);
      return;
    }
    if (!cur.id) return; // still placing our own call (glare is settled when it commits)
    if (!active || active.id !== cur.id) {
      // Our call's record was replaced (the other app restarted and called again) or the end was
      // missed: this call is over. Follow a newer call that is ringing for us.
      abandon();
      if (isIncomingFor(active, me, Date.now())) showIncoming(active);
      return;
    }
    if (active.state === 'ended') finish(active);
    else if (active.state === 'accepted' && cur.phase === 'incoming') abandon(); // answered on another device
    else if (active.state === 'accepted' && cur.phase === 'outgoing') {
      update(s => ({ ...s, phase: 'connecting' }));
    }
  }), [signaling, me, showIncoming, finish, update, abandon]);

  // Closing the app ends the call for the other side straight away.
  useEffect(() => {
    const onHide = () => {
      const cur = stateRef.current;
      if (!cur.id) return;
      if (cur.phase === 'incoming') endCall('declined');
      else if (cur.phase === 'outgoing') endCall('cancelled');
      else if (cur.phase === 'connecting' || cur.phase === 'connected') endCall('hangup');
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [endCall]);

  const startCall = useCallback(async kind => {
    if (stateRef.current.phase !== 'idle') return;
    document.activeElement?.blur?.();
    update({ phase: 'outgoing', role: 'caller', kind, id: null, local: null, remote: null });
    let stream;
    try {
      stream = await getMedia(kind); // first await: still inside the tap, as iOS requires
    } catch {
      update(IDLE);
      notify(kind === 'video' ? 'Allow camera and microphone to call' : 'Allow microphone to call');
      return;
    }
    await freshIce();
    if (stateRef.current.phase !== 'outgoing') { stream.getTracks().forEach(t => t.stop()); return; }
    const active = newCall({ from: me, to: other, kind, now: Date.now() });
    const s = newSession(active.id);
    update(st => ({ ...st, local: stream }));
    const pc = createPeer(s, stream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const ok = await signaling.startCall(active, { type: offer.type, sdp: offer.sdp });
    if (session.current !== s) {
      // Hung up while the call was being placed: don't leave the other phone ringing.
      if (ok) signaling.end(active.id, 'cancelled', Date.now());
      return;
    }
    if (!ok) {
      // The other phone called first (or a call is ringing): take that call instead.
      teardown();
      update(IDLE);
      if (isIncomingFor(activeRef.current, me, Date.now())) showIncoming(activeRef.current);
      else notify('Line busy — try again');
      return;
    }
    update(st => ({ ...st, id: active.id }));
    markSignalReady(s);
    if (stateRef.current.phase !== 'outgoing') { signaling.end(active.id, 'cancelled', Date.now()); return; }
    s.unsubs.push(signaling.watchSignal(active.id, sig => {
      if (sig.answer && !pc.remoteDescription) {
        armConnectTimeout(s);
        setRemote(s, sig.answer).catch(() => endCall('failed'));
      }
    }));
    s.timers.push(setTimeout(() => {
      if (stateRef.current.phase === 'outgoing' && stateRef.current.id === active.id) signaling.end(active.id, 'missed', Date.now());
    }, ringTimeout()));
  }, [me, other, signaling, update, notify, teardown, showIncoming, endCall]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptCall = useCallback(async () => {
    const cur = stateRef.current;
    if (cur.phase !== 'incoming') return;
    const s = session.current;
    update({ ...cur, phase: 'connecting' });
    let stream;
    try {
      stream = await getMedia(cur.kind);
    } catch {
      signaling.end(cur.id, 'declined', Date.now());
      notify(cur.kind === 'video' ? 'Camera and microphone are blocked' : 'Microphone is blocked');
      return;
    }
    await freshIce();
    if (session.current !== s || stateRef.current.phase !== 'connecting') { stream.getTracks().forEach(t => t.stop()); return; }
    update(st => ({ ...st, local: stream }));
    const pc = createPeer(s, stream);
    armConnectTimeout(s);
    try {
      const offer = await new Promise(resolve => {
        s.unsubs.push(signaling.watchSignal(cur.id, sig => { if (sig.offer) resolve(sig.offer); }));
      });
      if (session.current !== s) return;
      await setRemote(s, offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const ok = await signaling.accept(cur.id, { type: answer.type, sdp: answer.sdp }, Date.now());
      if (session.current !== s) return;
      if (ok) markSignalReady(s);
      else { teardown(); update(IDLE); }
    } catch {
      endCall('failed');
    }
  }, [signaling, update, notify, teardown, endCall]); // eslint-disable-line react-hooks/exhaustive-deps

  const declineCall = useCallback(() => {
    if (stateRef.current.phase === 'incoming') endCall('declined');
  }, [endCall]);

  const hangUp = useCallback(() => {
    const cur = stateRef.current;
    if (cur.phase === 'incoming') endCall('declined');
    else if (cur.phase === 'outgoing') {
      if (cur.id) endCall('cancelled');
      else { teardown(); update(IDLE); } // still asking for camera/mic, or not yet ringing
    } else if (cur.phase === 'connecting' || cur.phase === 'connected') endCall('hangup');
  }, [endCall, teardown, update]);

  const setTrackEnabled = useCallback((kind, enabled) => {
    const s = session.current;
    if (!s?.local) return;
    (kind === 'audio' ? s.local.getAudioTracks() : s.local.getVideoTracks()).forEach(t => { t.enabled = enabled; });
    update(st => ({ ...st, [kind === 'audio' ? 'muted' : 'cameraOff']: !enabled }));
  }, [update]);

  const switchCamera = useCallback(async () => {
    const s = session.current;
    const old = s?.local?.getVideoTracks()[0];
    if (!old) return;
    const facingMode = (stateRef.current.facingMode || 'user') === 'user' ? 'environment' : 'user';
    try {
      const fresh = (await navigator.mediaDevices.getUserMedia({ video: { facingMode } })).getVideoTracks()[0];
      if (session.current !== s) { fresh.stop(); return; }
      fresh.enabled = old.enabled;
      await s.pc.getSenders().find(x => x.track === old)?.replaceTrack(fresh);
      s.local.removeTrack(old); old.stop();
      s.local.addTrack(fresh);
      update(st => ({ ...st, facingMode, local: new MediaStream(s.local.getTracks()) }));
    } catch {}
  }, [update]);

  const actions = useMemo(() => ({
    startCall, acceptCall, declineCall, hangUp, switchCamera,
    setMuted: m => setTrackEnabled('audio', !m),
    setCameraOff: off => setTrackEnabled('video', !off),
  }), [startCall, acceptCall, declineCall, hangUp, switchCamera, setTrackEnabled]);

  useEffect(() => teardown, [teardown]);

  const value = useMemo(() => ({ state: { ...state, other }, actions }), [state, other, actions]);
  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
