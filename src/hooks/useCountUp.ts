import { useEffect, useState } from "react";

type UseCountUpOptions = {
  duration?: number;
  /** Whether to animate. Pass false for non-numeric values rendered verbatim. */
  start?: boolean;
};

/**
 * Animates an integer from 0 to `target`. Snaps straight to the target when
 * `start` is false or under prefers-reduced-motion, so the final value is
 * always reached.
 */
export function useCountUp(
  target: number,
  { duration = 1400, start = true }: UseCountUpOptions = {},
): number {
  const [value, setValue] = useState(start ? 0 : target);

  useEffect(() => {
    if (!start || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }

    let frame = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(Math.round(target * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // rAF is not driven when there is no compositor (headless) or the tab is
    // backgrounded, which would strand the value at 0. Guarantee the final
    // value regardless.
    const settle = window.setTimeout(() => setValue(target), duration + 100);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [target, duration, start]);

  return value;
}
