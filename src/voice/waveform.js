// Voice note waveform: ~10 RMS samples per second while recording, reduced to a fixed
// number of bars so bubbles can draw it without downloading the audio.
export const WAVEFORM_BARS = 40;
export const WAVEFORM_MAX = 31;

export function reduceWaveform(samples, bars = WAVEFORM_BARS) {
  if (!samples.length) return new Array(bars).fill(0);
  const peaks = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.floor((i * samples.length) / bars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / bars));
    let peak = 0;
    for (let j = start; j < end && j < samples.length; j++) peak = Math.max(peak, samples[j]);
    peaks.push(peak);
  }
  const max = Math.max(...peaks);
  return peaks.map(p => (max > 0 ? Math.round((p / max) * WAVEFORM_MAX) : 0));
}

// RMS of an AnalyserNode byte time-domain buffer (128 = silence), 0..1.
export function rmsLevel(timeDomain) {
  let sum = 0;
  for (const v of timeDomain) {
    const x = (v - 128) / 128;
    sum += x * x;
  }
  return Math.sqrt(sum / timeDomain.length);
}
