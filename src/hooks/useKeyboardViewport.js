import { useState, useEffect } from 'react';

/**
 * useKeyboardViewport
 *
 * On iPhone, opening the keyboard doesn't resize the page. iOS shrinks the
 * *visual* viewport and scrolls it down (visualViewport.offsetTop) so the
 * focused field sits above the keyboard, which pushes a fixed header off
 * the top of the screen.
 *
 * This reports the visible area while the keyboard is open, so a screen can
 * pin itself to it: translate down by offsetTop (cancelling iOS's scroll) and
 * size itself to the visible height. Header stays at the top, footer sits
 * right above the keyboard.
 */
const KEYBOARD_THRESHOLD = 120; // px of viewport loss that means a keyboard, not browser chrome

export function useKeyboardViewport() {
  const [viewport, setViewport] = useState({ open: false, height: 0, offsetTop: 0 });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const open = window.innerHeight - vv.height > KEYBOARD_THRESHOLD;
      setViewport(prev => {
        const next = open
          ? { open, height: Math.round(vv.height), offsetTop: Math.round(vv.offsetTop) }
          : { open, height: 0, offsetTop: 0 };
        return prev.open === next.open && prev.height === next.height && prev.offsetTop === next.offsetTop
          ? prev
          : next;
      });
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return viewport;
}
