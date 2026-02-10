import React, { useEffect, useState } from "react";

const SCROLL_THRESHOLD_PX = 300;

function scrollToTop() {
  const prefersReducedMotion = globalThis.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  )?.matches;

  globalThis.scrollTo?.({
    top: 0,
    behavior: prefersReducedMotion ? "auto" : "smooth",
  });
}

export default function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!globalThis?.addEventListener) return undefined;

    function onScroll() {
      setIsVisible((globalThis.scrollY || 0) > SCROLL_THRESHOLD_PX);
    }

    onScroll();
    globalThis.addEventListener("scroll", onScroll, { passive: true });
    return () => globalThis.removeEventListener("scroll", onScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className="fixed bottom-6 right-6 z-50 rounded-full border border-slate-200 bg-white p-3 text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
    >
      <span className="text-lg leading-none">↑</span>
    </button>
  );
}
