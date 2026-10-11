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
 * Closing works the other way round: iOS reports the full-height viewport
 * only ~425ms after the keyboard starts sliding away, so the footer would sit
 * mid-screen over an empty gap. The keyboard is only up while a text field is
 * focused, so treat it as closed the moment focus leaves the field.
 *
 * Returns whether the keyboard is open.
 */
const KEYBOARD_THRESHOLD = 120; // px of viewport loss that means a keyboard, not browser chrome

const NON_TEXT_INPUTS = ['file', 'checkbox', 'radio', 'button', 'submit', 'range', 'color'];
const isTextField = el => !!el && (el.tagName === 'TEXTAREA' || el.isContentEditable ||
  (el.tagName === 'INPUT' && !NON_TEXT_INPUTS.includes(el.type)));

export function useKeyboardViewport(screenRef) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // Compare against the layout height. Don't use window.innerHeight: on iPhone it shrinks
      // with the keyboard (measured: 456 with keyboard vs 793 layout), so the gap reads as 0.
      const isOpen = isTextField(document.activeElement) &&
        document.documentElement.clientHeight - vv.height > KEYBOARD_THRESHOLD;
      const el = screenRef.current;
      if (el) {
        el.style.height = isOpen ? `${Math.round(vv.height)}px` : '';
        el.style.transform = isOpen ? `translateY(${Math.round(window.scrollY)}px)` : '';
      }
      setOpen(isOpen);
    };

    // focusout fires before focus moves on, so re-check once activeElement has settled.
    const onFocusChange = () => requestAnimationFrame(update);

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('scroll', update);
    document.addEventListener('focusin', onFocusChange);
    document.addEventListener('focusout', onFocusChange);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
      document.removeEventListener('focusin', onFocusChange);
      document.removeEventListener('focusout', onFocusChange);
    };
  }, [screenRef]);

  return open;
}

/**
 * useFocusWithoutScroll
 *
 * Stops iOS from scrolling the page when the input in `inputRef` is tapped.
 * iOS animates that scroll itself and only reports it afterwards, so
 * correcting it later always shows the header sliding away.
 *
 * iOS decides whether to scroll when the keyboard appears (measured ~120ms
 * after focus on iPhone 15 Pro), from where the focused field is at that
 * moment, and skips the scroll if the field is far off-screen. So on
 * touchstart: move the field out of view, focus it, and keep it there until
 * the keyboard is up plus a frame. By then useKeyboardViewport has sized the
 * screen to sit above the keyboard, so the field comes back already visible
 * and iOS has nothing to scroll to. While it's away, `standInRef` (a look-alike
 * box in the same spot) is shown so nothing visibly disappears.
 *
 * Only for taps on an unfocused field; once focused, iOS doesn't scroll again.
 */
const KEYBOARD_WAIT_MS = 600; // put the field back even if the keyboard never shows

export function useFocusWithoutScroll(inputRef, standInRef) {
  useEffect(() => {
    const el = inputRef.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;

    let pending = null; // cleanup for an in-flight focus

    const restore = () => {
      if (!pending) return;
      pending();
      pending = null;
      el.style.transform = '';
      if (standInRef.current) standInRef.current.style.visibility = 'hidden';
    };

    const onTouchStart = e => {
      if (document.activeElement === el || pending) return;
      e.preventDefault(); // focus ourselves below; the native tap focus would scroll

      const standIn = standInRef.current;
      if (standIn) {
        standIn.textContent = el.value || el.placeholder;
        standIn.style.color = el.value ? 'white' : 'rgba(255,255,255,0.45)';
        standIn.style.visibility = 'visible';
      }
      el.style.transform = 'translateY(-8000px)';
      el.focus();

      const onResize = () => {
        if (document.documentElement.clientHeight - vv.height > KEYBOARD_THRESHOLD) {
          requestAnimationFrame(restore); // after useKeyboardViewport has resized the screen
        }
      };
      vv.addEventListener('resize', onResize);
      el.addEventListener('blur', restore);
      const timer = setTimeout(restore, KEYBOARD_WAIT_MS);
      pending = () => {
        vv.removeEventListener('resize', onResize);
        el.removeEventListener('blur', restore);
        clearTimeout(timer);
      };
    };

    // Not passive: preventDefault must be allowed.
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      restore();
    };
  }, [inputRef, standInRef]);
}
