import { it, expect } from 'vitest';
import { formatDuration } from './format';

it('formats seconds as m:ss', () => {
  expect(formatDuration(0)).toBe('0:00');
  expect(formatDuration(7.9)).toBe('0:07');
  expect(formatDuration(65)).toBe('1:05');
  expect(formatDuration(120)).toBe('2:00');
  expect(formatDuration(-3)).toBe('0:00');
  expect(formatDuration(NaN)).toBe('0:00');
});
