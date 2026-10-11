import { it, expect } from 'vitest';
import { classifyDrag, CANCEL_DISTANCE, LOCK_DISTANCE } from './gesture';

it('classifies drags', () => {
  expect(classifyDrag(0, 0)).toBe('none');
  expect(classifyDrag(-CANCEL_DISTANCE, 0)).toBe('cancel');
  expect(classifyDrag(-(CANCEL_DISTANCE - 1), 0)).toBe('none');
  expect(classifyDrag(0, -LOCK_DISTANCE)).toBe('lock');
  expect(classifyDrag(-30, -LOCK_DISTANCE)).toBe('lock');            // mostly upward
  expect(classifyDrag(-CANCEL_DISTANCE, -40)).toBe('cancel');        // mostly left
  expect(classifyDrag(40, 40)).toBe('none');                         // right/down never act
});
