/**
 * Filter-token autocomplete popover.
 *
 * Renders a small dropdown anchored below an input
 * when the caret is inside a scoped token's value
 * (``customer:``, ``task:``, ``type:``, ``tag:``,
 * ``filename:``). Keyboard navigation: ArrowDown/Up to
 * move, Enter to pick, Escape to dismiss. Mouse clicks
 * select directly. Designed to be embedded by
 * {@link TokenFilterInput}.
 */
import {
  useEffect, useMemo, useRef, useState,
} from "react";
import type {
  CaretToken,
} from "../knowledge/filterTokens";

export interface FilterSuggestionSource {
  customers: string[];
  tasks: { id: string; title: string }[];
  types: string[];
  tags: string[];
  /** Optional pool for ``filename:`` -- the leaf file
   *  names visible in the tree. When omitted the
   *  ``filename:`` autocomplete simply doesn't open. */
  filenames?: string[];
}

interface Props {
  token: CaretToken;
  source: FilterSuggestionSource;
  /** Called with the value to insert into the input. */
  onSelect: (value: string) => void;
  /** Dismiss without selecting (Escape). */
  onDismiss: () => void;
}

const MAX_VISIBLE = 8;

export function FilterAutocomplete({
  token, source, onSelect, onDismiss,
}: Props) {
  const items = useMemo(
    () => computeItems(token, source),
    [token, source],
  );
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Reset active row when items change.
  useEffect(() => {
    setActive(0);
  }, [items]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Only intercept when the user is actually typing
      // in a text input. Avoids two ``TokenFilterInput``s
      // on the same page both grabbing Enter / arrows.
      const el = document.activeElement;
      if (
        !(el instanceof HTMLInputElement)
        || el.type !== "text"
      ) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        if (items.length === 0) return;
        e.preventDefault();
        onSelect(items[active]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () =>
      document.removeEventListener("keydown", onKey, true);
  }, [active, items, onSelect, onDismiss]);

  if (items.length === 0) return null;

  return (
    <ul
      ref={listRef}
      className={[
        "absolute left-2 right-2 top-full mt-1 z-50",
        "rounded-md border border-border bg-surface-card",
        "shadow-lg overflow-y-auto py-1",
      ].join(" ")}
      style={{ maxHeight: 32 * MAX_VISIBLE }}
    >
      {items.slice(0, 30).map((item, i) => (
        <li
          key={item}
          onMouseDown={(e) => {
            // Use mousedown to fire before the input's
            // blur tears the popover down.
            e.preventDefault();
            onSelect(item);
          }}
          onMouseEnter={() => setActive(i)}
          className={[
            "px-2 py-1 text-[11px] cursor-pointer",
            i === active
              ? "bg-cta-muted text-cta"
              : "text-stone-700 hover:bg-surface-raised",
          ].join(" ")}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function computeItems(
  token: CaretToken, source: FilterSuggestionSource,
): string[] {
  const partial = token.partial.toLowerCase();
  const pool = pickPool(token.kind, source);
  return pool.filter(
    (v) => v.toLowerCase().includes(partial),
  );
}

function pickPool(
  kind: CaretToken["kind"],
  source: FilterSuggestionSource,
): string[] {
  if (kind === "customer") return source.customers;
  if (kind === "task") {
    return source.tasks.map((t) => t.title);
  }
  if (kind === "type") return source.types;
  if (kind === "tag") return source.tags;
  if (kind === "filename") return source.filenames ?? [];
  return [];
}
