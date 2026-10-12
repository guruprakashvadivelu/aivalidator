import { useCallback, useEffect, useRef, useState } from 'react';
import { reduceWaveform, rmsLevel } from '../voice/waveform';
import { VOICE_MIN_SECONDS, VOICE_MAX_SECONDS } from '../services/voiceService';

const MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
const pickMime = () =>
  typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported
    ? MIME_CANDIDATES.find(m => MediaRecorder.isTypeSupported(m)) || ''
    : '';

/**
 * Microphone recording for voice notes. A fresh stream per recording, fully released
 * afterwards (also works around iOS home-screen apps failing to record after reopening).
 * stop() resolves { blob, duration, waveform, mime }, { tooShort: true }, or null.
 */
export function useVoiceRecorder({ onError, onLimit } = {}) {
  const [status, setStatus] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState([]);
  const rec = useRef({});
  const callbacks = useRef({ onError, onLimit });
  callbacks.current = { onError, onLimit };

  const seconds = () => {
    const s = rec.current;
    return (s.accumulated || 0) + (s.runningSince ? (performance.now() - s.runningSince) / 1000 : 0);
  };

  const release = () => {
    const s = rec.current;
    clearInterval(s.timer);
    clearInterval(s.sampler);
    s.stream?.getTracks().forEach(t => t.stop());
    s.ctx?.close().catch(() => {});
    rec.current = {};
    setStatus('idle');
    setElapsed(0);
    setLevels([]);
  };

  const stop = useCallback(() => {
    const s = rec.current;
    if (s.stopping) return s.stopping; // limit timer and a tap can both ask to stop
    if (!s.recorder) { // finger lifted before the mic was ready
      if (s.starting) s.abandoned = true;
      release();
      return Promise.resolve(s.starting ? { tooShort: true } : null);
    }
    clearInterval(s.timer);
    const duration = seconds();
    s.runningSince = null;
    s.stopping = new Promise(resolve => {
      const finish = () => {
        const blob = new Blob(s.chunks, { type: s.mime });
        const waveform = reduceWaveform(s.samples);
        release();
        if (duration < VOICE_MIN_SECONDS) { resolve({ tooShort: true }); return; }
        if (!blob.size) { callbacks.current.onError?.('empty'); resolve(null); return; }
        resolve({ blob, duration: Math.round(duration * 10) / 10, waveform, mime: s.mime });
      };
      // Already stopped by the system (call, Siri, app backgrounded): no stop event will come.
      if (s.recorder.state === 'inactive') { finish(); return; }
      s.recorder.onstop = finish;
      try { s.recorder.stop(); } catch { finish(); }
    });
    return s.stopping;
  }, []);

  const start = useCallback(async () => {
    if (rec.current.recorder || rec.current.starting) return false;
    const attempt = { starting: true };
    rec.current = attempt;
    setStatus('starting');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      if (rec.current === attempt) release();
      callbacks.current.onError?.(err?.name === 'NotAllowedError' ? 'permission' : 'unavailable');
      return false;
    }
    if (attempt.abandoned || rec.current !== attempt) { stream.getTracks().forEach(t => t.stop()); return false; }

    const mime = pickMime();
    const recorder = new MediaRecorder(stream, { ...(mime && { mimeType: mime }), audioBitsPerSecond: 32000 });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    // The system can end capture on its own (a call, Siri, the app going to the background).
    // Freeze the timer and keep what was recorded; send or delete then works as usual.
    const interrupted = () => {
      const s = rec.current;
      if (s.recorder !== recorder || s.stopping) return;
      if (s.runningSince) { s.accumulated += (performance.now() - s.runningSince) / 1000; s.runningSince = null; }
      clearInterval(s.timer);
      setElapsed(s.accumulated);
      callbacks.current.onError?.('interrupted');
    };
    recorder.onstop = interrupted;
    recorder.onerror = interrupted;

    let ctx, analyser, buffer;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      buffer = new Uint8Array(analyser.fftSize);
    } catch { analyser = null; }

    const samples = [];
    rec.current = {
      stream, recorder, chunks, ctx, samples, accumulated: 0,
      runningSince: performance.now(), mime: recorder.mimeType || mime || 'audio/mp4',
    };
    rec.current.sampler = setInterval(() => {
      if (!rec.current.runningSince) return;
      const level = analyser ? (analyser.getByteTimeDomainData(buffer), rmsLevel(buffer)) : 0;
      samples.push(level);
      setLevels(l => [...l.slice(-59), level]);
    }, 100);
    rec.current.timer = setInterval(() => {
      const s = seconds();
      setElapsed(s);
      if (s >= VOICE_MAX_SECONDS) stop().then(r => r && !r.tooShort && callbacks.current.onLimit?.(r));
    }, 200);
    recorder.start(250);
    setStatus('recording');
    return true;
  }, [stop]);

  const cancel = useCallback(() => {
    const s = rec.current;
    if (s.recorder) { s.recorder.onstop = () => {}; try { s.recorder.stop(); } catch {} }
    else if (s.starting) s.abandoned = true;
    release();
  }, []);

  const pause = useCallback(() => {
    const s = rec.current;
    if (!s.recorder || !s.runningSince || s.recorder.state !== 'recording') return;
    s.recorder.pause();
    s.accumulated += (performance.now() - s.runningSince) / 1000;
    s.runningSince = null;
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    const s = rec.current;
    if (!s.recorder || s.runningSince || s.recorder.state !== 'paused') return;
    s.recorder.resume();
    s.runningSince = performance.now();
    setStatus('recording');
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { status, elapsed, levels, start, stop, cancel, pause, resume };
}
