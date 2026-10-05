import { useCallback, useRef, type MouseEvent } from "react";

/**
 * Pointer handlers for a cursor-tracking highlight. The element's bounding
 * rect is cached on enter so `mousemove` never forces a reflow, and the
 * pointer position is published as `--mx`/`--my` for the `.spotlight`
 * pseudo-element (see index.css). Inert on touch, where these never fire.
 */
export function useSpotlight<T extends HTMLElement = HTMLButtonElement>() {
  const rect = useRef<DOMRect | null>(null);

  const onMouseEnter = useCallback((e: MouseEvent<T>) => {
    rect.current = e.currentTarget.getBoundingClientRect();
  }, []);

  const onMouseMove = useCallback((e: MouseEvent<T>) => {
    const r = rect.current ?? e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, []);

  return { onMouseEnter, onMouseMove };
}
