import { useEffect, useRef, type RefObject } from "react";

/**
 * Translates an element on scroll for a parallax effect. The listener is
 * rAF-coalesced and only `transform` is written (reading `scrollY`, never
 * layout), so it never thrashes. Disabled under reduced motion.
 *
 * `enabled` gates attachment: the target is often behind a loading gate, so
 * the ref is null on first mount and the effect must re-run once the element
 * exists.
 */
export function useParallax<T extends HTMLElement = HTMLDivElement>(
  speed = 0.2,
  enabled = true,
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      el.style.transform = `translate3d(0, ${window.scrollY * speed}px, 0)`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      el.style.transform = "";
    };
  }, [speed, enabled]);

  return ref;
}
