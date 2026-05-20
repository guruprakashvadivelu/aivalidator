import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useChatLayout
 *
 * Solves the iPhone PWA keyboard problem properly.
 *
 * Strategy:
 * - Measure header and footer heights via ResizeObserver
 * - Set messages area top/bottom to exactly match
 * - visualViewport listener adjusts footer position when keyboard opens
 * - This keeps header fixed at top, footer above keyboard, messages between them
 */
export function useChatLayout() {
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const [layout, setLayout] = useState({ headerH: 0, footerH: 0, footerBottom: 0 });

  const measure = useCallback(() => {
    const headerH = headerRef.current?.offsetHeight ?? 0;
    const footerH = footerRef.current?.offsetHeight ?? 0;
    setLayout(prev => {
      if (prev.headerH === headerH && prev.footerH === footerH) return prev;
      return { headerH, footerH, footerBottom: prev.footerBottom };
    });
  }, []);

  // Handle keyboard open/close via visualViewport
  useEffect(() => {
    if (!window.visualViewport) return;

    const handleViewport = () => {
      const vv = window.visualViewport;
      const windowHeight = window.innerHeight;
      const viewportHeight = vv.height;
      const keyboardHeight = Math.max(0, windowHeight - viewportHeight - vv.offsetTop);

      setLayout(prev => ({
        ...prev,
        footerBottom: keyboardHeight,
      }));
    };

    window.visualViewport.addEventListener('resize', handleViewport);
    window.visualViewport.addEventListener('scroll', handleViewport);
    handleViewport();

    return () => {
      window.visualViewport.removeEventListener('resize', handleViewport);
      window.visualViewport.removeEventListener('scroll', handleViewport);
    };
  }, []);

  // Measure header/footer heights
  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (headerRef.current) ro.observe(headerRef.current);
    if (footerRef.current) ro.observe(footerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const messagesStyle = {
    top: `${layout.headerH}px`,
    bottom: `${layout.footerH + layout.footerBottom}px`,
  };

  const footerStyle = {
    bottom: `${layout.footerBottom}px`,
  };

  return { headerRef, footerRef, messagesStyle, footerStyle };
}
