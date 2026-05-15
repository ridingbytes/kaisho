import { useEffect, useState } from "react";

/**
 * Detect a touch-primary device via media query.
 *
 * True when the device has no hover capability and a
 * coarse pointer (typical mobile/tablet). Used to enable
 * touch-only UI affordances like swipe-to-reveal.
 */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(
      "(hover: none) and (pointer: coarse)",
    ).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(
      "(hover: none) and (pointer: coarse)",
    );
    const handler = (e: MediaQueryListEvent) =>
      setIsTouch(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isTouch;
}
