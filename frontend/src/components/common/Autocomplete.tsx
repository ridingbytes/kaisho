import { useEffect, useRef, useState } from "react";

/**
 * Generic autocomplete dropdown with keyboard
 * navigation and optional "create new" action.
 *
 * Used by CustomerAutocomplete and TaskAutocomplete
 * as a shared base. Handles open/close state,
 * ArrowUp/Down/Enter/Escape navigation, highlight
 * scrolling, and dropdown rendering.
 */

/** A single item displayed in the dropdown. */
export interface AutocompleteItem<T> {
  /** Unique key for React rendering. */
  key: string;
  /** Label displayed in the dropdown row. */
  label: string;
  /** The original data object. */
  data: T;
}

/** Props for the Autocomplete component. */
interface Props<T> {
  /** Current input text (controlled). */
  value: string;
  /** Called when the input text changes. */
  onChange: (text: string) => void;
  /** Filtered items to show in the dropdown. */
  items: AutocompleteItem<T>[];
  /** Called when the user selects an item. */
  onSelect: (item: AutocompleteItem<T>) => void;
  /** If set, show a "Create ..." option at the
   *  bottom when no exact match exists. */
  onCreate?: () => void;
  /** Whether to show the create option. */
  showCreate?: boolean;
  /** Label for the create option
   *  (default: '+ Create "value"'). */
  createLabel?: string;
  /** Passed through to the <input> element. */
  onKeyDown?: (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => void;
  /** Wrapper div className. */
  className?: string;
  /** Input element className. */
  inputClassName?: string;
  /** Input placeholder text. */
  placeholder?: string;
  /** Auto-focus the input on mount. */
  autoFocus?: boolean;
}

const MAX_VISIBLE = 8;

export function Autocomplete<T>({
  value,
  onChange,
  items,
  onSelect,
  onCreate,
  showCreate = false,
  createLabel,
  onKeyDown,
  className,
  inputClassName = "",
  placeholder,
  autoFocus,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [hlIdx, setHlIdx] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  // Scroll highlighted item into view
  useEffect(() => {
    if (hlIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[hlIdx];
    if (el) {
      (el as HTMLElement).scrollIntoView({
        block: "nearest",
      });
    }
  }, [hlIdx]);

  const total = items.length + (showCreate ? 1 : 0);

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (total > 0 && e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHlIdx(0);
      } else {
        setHlIdx((i) => Math.min(i + 1, total - 1));
      }
      return;
    }
    if (total > 0 && e.key === "ArrowUp") {
      e.preventDefault();
      setHlIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (
      (e.key === "Enter" || e.key === "Tab")
      && hlIdx >= 0
    ) {
      e.preventDefault();
      if (hlIdx < items.length) {
        onSelect(items[hlIdx]);
        setOpen(false);
        setHlIdx(-1);
      } else if (showCreate && onCreate) {
        onCreate();
      }
      return;
    }
    if (e.key === "Escape" && open) {
      setOpen(false);
      setHlIdx(-1);
      return;
    }
    onKeyDown?.(e);
  }

  const dropdownCls = [
    "absolute z-50 left-0 right-0 top-full",
    "mt-0.5 max-h-48 overflow-y-auto rounded-md",
    "border border-border bg-surface-raised",
    "shadow-card-hover",
  ].join(" ");

  const itemCls = (highlighted: boolean) => [
    "w-full text-left px-2 py-1.5 text-xs",
    "transition-colors truncate",
    highlighted
      ? "bg-surface-overlay text-stone-900 font-medium"
      : "text-stone-800 hover:bg-surface-overlay/50",
  ].join(" ");

  const createCls = (highlighted: boolean) => [
    "w-full text-left px-2 py-1.5 text-xs",
    "transition-colors border-t border-border-subtle",
    highlighted
      ? "bg-surface-overlay text-cta font-medium"
      : "text-cta hover:bg-surface-overlay/50",
  ].join(" ");

  return (
    <div
      className={
        `relative${className ? ` ${className}` : ""}`
      }
    >
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHlIdx(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() =>
          setTimeout(() => setOpen(false), 150)
        }
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className={`w-full ${inputClassName}`}
      />
      {open && total > 0 && (
        <ul ref={listRef} className={dropdownCls}>
          {items.slice(0, MAX_VISIBLE).map((item, i) => (
            <li key={item.key}>
              <button
                type="button"
                title={item.label}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(item);
                  setOpen(false);
                  setHlIdx(-1);
                }}
                className={itemCls(i === hlIdx)}
              >
                {item.label}
              </button>
            </li>
          ))}
          {showCreate && onCreate && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onCreate();
                }}
                className={createCls(
                  hlIdx === items.length,
                )}
              >
                {createLabel
                  ?? `+ Create "${value.trim()}"`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
