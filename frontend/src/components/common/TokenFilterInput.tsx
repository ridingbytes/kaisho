/**
 * Unified filter input that renders scoped key:value
 * tokens as removable chips while keeping the rest of
 * the query as live free text. Drives both metadata
 * narrowing (chips) and content search (free text) from
 * a single field.
 *
 * The canonical value is a string -- the same syntax
 * that {@link parseFilter} consumes. Chips are derived
 * on every render via {@link splitChipsAndFree}, so
 * the parent only persists one string.
 *
 * Behaviour:
 * - Typing ``customer:rid`` + space promotes the token
 *   to a chip with whatever value was typed (matches
 *   what would happen on autocomplete selection).
 * - Backspace at caret position 0 with no selection
 *   removes the rightmost chip.
 * - Click X on a chip removes that chip.
 * - Autocomplete popover opens whenever the caret is
 *   inside a scoped token's value portion (handled by
 *   {@link FilterAutocomplete}).
 */
import {
  useEffect, useMemo, useRef, useState,
} from "react";
import { X } from "lucide-react";
import {
  applyTokenValue,
  chipToRaw,
  splitChipsAndFree,
  tokenAtCaret,
  type Chip,
} from "../knowledge/filterTokens";
import {
  FilterAutocomplete,
  type FilterSuggestionSource,
} from "./FilterAutocomplete";

interface Props {
  /** Canonical filter string. */
  value: string;
  /** Called with the new canonical string. */
  onChange: (next: string) => void;
  /** Sources for chip autocomplete. */
  suggestions?: FilterSuggestionSource;
  /** Placeholder for the live input portion. */
  placeholder?: string;
  /** Wrapper className. */
  className?: string;
  /** Input className. */
  inputClassName?: string;
  /** Forward to the input. */
  autoFocus?: boolean;
}

export function TokenFilterInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  inputClassName,
  autoFocus,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const composing = useRef(false);
  const blurTimeout =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autocompleteOpen, setAutocompleteOpen] =
    useState(false);
  const [caretInFree, setCaretInFree] = useState(0);

  const { chips, free } = useMemo(
    () => splitChipsAndFree(value),
    [value],
  );

  // Position of the live ``free`` portion inside the
  // canonical string. Chips render before it.
  const chipsPrefix = useMemo(
    () => chipsToCanonical(chips),
    [chips],
  );
  const canonicalCaret =
    chipsPrefix.length + caretInFree;

  const caretToken = suggestions && autocompleteOpen
    ? tokenAtCaret(value, canonicalCaret)
    : null;

  function commitFreeText(
    newFree: string, rawCaret: number,
  ) {
    const next = joinCanonical(chips, newFree);
    onChange(next);
    // The next render may move a typed scoped token into
    // chips and shrink ``free``; clamp the stored caret
    // so the autocomplete derives sane positions.
    const post = splitChipsAndFree(next);
    setCaretInFree(Math.min(rawCaret, post.free.length));
    setAutocompleteOpen(true);
  }

  function handleFreeChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    if (composing.current) return;
    commitFreeText(
      e.target.value, e.target.selectionStart ?? 0,
    );
  }

  function handleCaret(
    e: React.SyntheticEvent<HTMLInputElement>,
  ) {
    setCaretInFree(
      (e.target as HTMLInputElement).selectionStart ?? 0,
    );
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (
      e.nativeEvent.isComposing
      || composing.current
    ) return;
    const el = e.currentTarget;
    // Only consume Backspace when there's no selection
    // -- otherwise the user is deleting the selected
    // text and we must let the default fire. Note: a
    // Cmd+Backspace (delete-to-line-start) with the
    // caret already at position 0 also falls into this
    // branch and pops the rightmost chip. That's
    // intentional -- the OS no-ops the delete-to-start
    // and the chip-pop becomes a useful fallback.
    if (
      e.key === "Backspace"
      && el.selectionStart === 0
      && el.selectionEnd === 0
      && chips.length > 0
    ) {
      e.preventDefault();
      removeChip(chips.length - 1);
    }
  }

  function removeChip(index: number) {
    const next = chips.filter((_, i) => i !== index);
    onChange(joinCanonical(next, free));
  }

  function handleAutocompleteSelect(selected: string) {
    if (!caretToken) return;
    const result = applyTokenValue(
      value, caretToken.range, selected,
    );
    onChange(result.value);
    setAutocompleteOpen(false);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      // After commit the autocompleted token now sits in
      // chips; place the caret at the start of the now-
      // empty (or unchanged) ``free``. The new ``free``
      // length is computed from the post-change split.
      const post = splitChipsAndFree(result.value);
      const target = Math.min(
        result.caret - chipsToCanonical(post.chips).length,
        post.free.length,
      );
      el.setSelectionRange(target, target);
      setCaretInFree(target);
    });
  }

  // Clicking the wrapper focuses the live input so the
  // empty space between chips still feels active.
  function handleWrapClick(e: React.MouseEvent) {
    if (e.target === wrapRef.current) {
      inputRef.current?.focus();
    }
  }

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div
      ref={wrapRef}
      onClick={handleWrapClick}
      className={[
        "relative flex items-center min-w-0",
        className ?? "",
      ].join(" ")}
    >
      <div
        className={[
          "flex-1 flex items-center gap-1",
          "min-w-0 overflow-hidden",
        ].join(" ")}
      >
        {chips.map((chip, i) => (
          <ChipPill
            key={`${chip.key}:${chip.value}:${i}`}
            chip={chip}
            onRemove={() => removeChip(i)}
          />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={free}
          onChange={handleFreeChange}
          onKeyUp={handleCaret}
          onClick={handleCaret}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            const el = e.currentTarget;
            commitFreeText(
              el.value, el.selectionStart ?? 0,
            );
          }}
          onFocus={() => {
            if (blurTimeout.current) {
              clearTimeout(blurTimeout.current);
              blurTimeout.current = null;
            }
            setAutocompleteOpen(true);
          }}
          onBlur={() => {
            blurTimeout.current = setTimeout(() => {
              setAutocompleteOpen(false);
              blurTimeout.current = null;
            }, 120);
          }}
          placeholder={chips.length === 0
            ? placeholder
            : undefined}
          className={[
            "flex-1 min-w-[80px] bg-transparent",
            "text-[11px] text-stone-700",
            "placeholder:text-stone-400",
            "focus:outline-none",
            inputClassName ?? "",
          ].join(" ")}
        />
      </div>
      {caretToken && suggestions && (
        <FilterAutocomplete
          token={caretToken}
          source={suggestions}
          onSelect={handleAutocompleteSelect}
          onDismiss={() => setAutocompleteOpen(false)}
        />
      )}
    </div>
  );
}

function ChipPill({
  chip, onRemove,
}: {
  chip: Chip;
  onRemove: () => void;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 shrink-0",
        "px-1.5 py-0.5 rounded text-[10px]",
        "bg-cta-muted text-cta-hover",
        "font-medium",
      ].join(" ")}
    >
      <span className="text-stone-500">{chip.key}:</span>
      <span className="truncate max-w-[10rem]">
        {chip.value}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="text-stone-500 hover:text-stone-900"
        title="Remove"
        aria-label="Remove filter"
      >
        <X size={10} />
      </button>
    </span>
  );
}

function chipsToCanonical(chips: Chip[]): string {
  if (chips.length === 0) return "";
  return chips.map(chipToRaw).join(" ") + " ";
}

function joinCanonical(
  chips: Chip[], free: string,
): string {
  return chipsToCanonical(chips) + free;
}
