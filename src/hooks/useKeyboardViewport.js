import { useState, useEffect } from 'react';

/**
 * useKeyboardViewport
 *
 * On iPhone, opening the keyboard doesn't resize the page. iOS shrinks the
 * visual viewport and scrolls the document up so the focused field sits above
 * the keyboard, which pushes a fixed header off the top of the screen.
 *
 * While the keyboard is open this pins the element in `screenRef` to the
 * visible area: sized to the visual viewport height and translated down by the
 * document scroll, cancelling iOS's scroll. Header stays at the top, footer
 * sits right above the keyboard.
 *
 * Measured on iPhone 15 Pro after focusing a field: visualViewport resize at
 * ~90ms, window scroll at ~190ms, but visualViewport.offsetTop only catches up
 * at ~490ms. So follow window.scrollY (current immediately), and write the
 * styles straight to the element in the event handler rather than waiting for
 * a React render, so the correction lands in the same frame as iOS's scroll.
 *
 * Returns whether the keyboard is open.
 */
const KEYBOARD_THRESHOLD = 120; // px of viewport loss that means a keyboard, not browser chrome

export function useKeyboardViewport(screenRef) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // Compare against the layout height. Don't use window.innerHeight: on iPhone it shrinks
      // with the keyboard (measured: 456 with keyboard vs 793 layout), so the gap reads as 0.
      const isOpen = document.documentElement.clientHeight - vv.height > KEYBOARD_THRESHOLD;
      const el = screenRef.current;
      if (el) {
        el.style.height = isOpen ? `${Math.round(vv.height)}px` : '';
        el.style.transform = isOpen ? `translateY(${Math.round(window.scrollY)}px)` : '';
      }
      setOpen(isOpen);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
    };
  }, [screenRef]);

  return open;
}
