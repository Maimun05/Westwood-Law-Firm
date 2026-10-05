import { useEffect, useRef, type DependencyList, type RefObject } from "react";

type UseRevealOptions = {
  /** CSS selector for elements to reveal within the container. */
  selector?: string;
  /** IntersectionObserver threshold. */
  threshold?: number;
  /** IntersectionObserver rootMargin. */
  rootMargin?: string;
  /** Re-scan the container when these change (e.g. after data loads). */
  deps?: DependencyList;
};

/**
 * Reveals elements as they scroll into view by adding `.is-visible`; elements
 * must carry `.reveal` or `.reveal-x` (see index.css). Reveals once per element.
 *
 * Under prefers-reduced-motion — or without IntersectionObserver — every
 * element is shown immediately, so content can never stay hidden.
 *
 * A zero threshold with a negative bottom margin is deliberate: a fractional
 * threshold stalls on sections taller than the viewport, while this fires as
 * the element's top crosses ~90% of the viewport, finishing the motion as it
 * enters rather than before.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>({
  selector = ".reveal, .reveal-x",
  threshold = 0,
  rootMargin = "0px 0px -10% 0px",
  deps = [],
}: UseRevealOptions = {}): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (targets.length === 0) return;

    const revealAll = () => targets.forEach((el) => el.classList.add("is-visible"));

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      revealAll();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold, rootMargin },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // deps are caller-supplied so the observer re-scans after the loading gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
