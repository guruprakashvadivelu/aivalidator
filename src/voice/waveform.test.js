import { describe, it, expect } from 'vitest';
import { reduceWaveform, rmsLevel, WAVEFORM_BARS, WAVEFORM_MAX } from './waveform';

describe('reduceWaveform', () => {
  it('returns 40 zero bars for no samples', () => {
    expect(reduceWaveform([])).toEqual(new Array(WAVEFORM_BARS).fill(0));
  });
  it('scales the loudest bar to the max and keeps the bar count', () => {
    const samples = Array.from({ length: 200 }, (_, i) => (i === 150 ? 0.8 : 0.1));
    const bars = reduceWaveform(samples);
    expect(bars).toHaveLength(WAVEFORM_BARS);
    expect(Math.max(...bars)).toBe(WAVEFORM_MAX);
    expect(bars.every(b => Number.isInteger(b) && b >= 0 && b <= WAVEFORM_MAX)).toBe(true);
  });
  it('stretches fewer samples than bars', () => {
    expect(reduceWaveform([0.5, 1])).toHaveLength(WAVEFORM_BARS);
  });
});

describe('rmsLevel', () => {
  it('is 0 for silence (128) and >0 for signal', () => {
    expect(rmsLevel(new Uint8Array(64).fill(128))).toBe(0);
    expect(rmsLevel(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0)))).toBeGreaterThan(0.9);
  });
});
