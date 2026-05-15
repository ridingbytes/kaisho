import {
  useEffect, useRef, useState, type ReactNode,
} from "react";
import { useIsTouch } from "../../hooks/useIsTouch";

export interface SwipeToRevealProps {
  /** Content shown beneath when swiped open. */
  revealAction: ReactNode;
  /** Width of the revealed action panel in pixels. */
  actionWidth?: number;
  /** The row content. */
  children: ReactNode;
}

const OPEN_THRESHOLD = 40;
const AXIS_LOCK = 8;

/**
 * Swipe-to-reveal wrapper for touch devices.
 *
 * On touch input, swiping the content left exposes the
 * ``revealAction`` slot on the right. Tap outside or tap
 * the content while open to dismiss without firing the
 * underlying click. On non-touch devices the wrapper is
 * a transparent passthrough.
 */
export function SwipeToReveal({
  revealAction,
  actionWidth = 88,
  children,
}: SwipeToRevealProps) {
  const isTouch = useIsTouch();
  const [open, setOpen] = useState(false);
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(true);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const axis = useRef<"none" | "h" | "v">("none");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (
        rootRef.current
        && !rootRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setDx(0);
        setAnimating(true);
      }
    }
    document.addEventListener("pointerdown", onDocPointer);
    return () =>
      document.removeEventListener(
        "pointerdown", onDocPointer,
      );
  }, [open]);

  if (!isTouch) {
    return <>{children}</>;
  }

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axis.current = "none";
    setAnimating(false);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null || startY.current === null) {
      return;
    }
    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = e.touches[0].clientY - startY.current;
    if (axis.current === "none") {
      if (Math.abs(deltaX) < AXIS_LOCK
        && Math.abs(deltaY) < AXIS_LOCK) return;
      axis.current =
        Math.abs(deltaX) > Math.abs(deltaY) ? "h" : "v";
    }
    if (axis.current !== "h") return;
    const base = open ? -actionWidth : 0;
    const next = Math.min(
      0, Math.max(-actionWidth, base + deltaX),
    );
    setDx(next);
  }

  function onTouchEnd() {
    startX.current = null;
    startY.current = null;
    setAnimating(true);
    if (axis.current !== "h") return;
    if (dx < -OPEN_THRESHOLD) {
      setOpen(true);
      setDx(-actionWidth);
    } else {
      setOpen(false);
      setDx(0);
    }
  }

  function onClickCapture(e: React.MouseEvent) {
    if (open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setDx(0);
      setAnimating(true);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative overflow-hidden"
    >
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: actionWidth }}
      >
        {revealAction}
      </div>
      <div
        className="relative bg-surface"
        style={{
          transform: `translateX(${dx}px)`,
          transition: animating
            ? "transform 150ms ease"
            : "none",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
