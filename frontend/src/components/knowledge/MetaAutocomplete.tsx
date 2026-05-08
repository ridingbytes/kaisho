/**
 * @module MetaAutocomplete
 *
 * Single-string autocomplete used by ``FrontmatterCard``
 * for the customer / task / type / status fields. Wraps
 * the generic ``Autocomplete`` and adapts a
 * ``string[]`` of suggestions into the ``items`` API.
 *
 * Free-text values are allowed -- the user can type
 * anything; the dropdown is purely a hint list.
 */
import {
  Autocomplete,
  type AutocompleteItem,
} from "../common/Autocomplete";

interface MetaAutocompleteProps {
  label: string;
  value: string;
  suggestions: string[];
  /** Optional ``id`` for matched entries (e.g. customer
   *  name). When the suggestion list is built from
   *  ``{value, label}`` pairs (task title vs id) the
   *  caller can pass an ``items`` array directly via
   *  the ``richItems`` prop instead. */
  onChange: (next: string) => void;
  placeholder?: string;
}

export function MetaAutocomplete({
  label, value, suggestions, onChange, placeholder,
}: MetaAutocompleteProps) {
  const items: AutocompleteItem<string>[] = filterByPrefix(
    value, suggestions,
  ).map((s) => ({ key: s, label: s, data: s }));
  return (
    <label className="flex flex-col gap-0.5">
      <span
        className={
          "text-[9px] text-stone-500 uppercase " +
          "tracking-wider"
        }
      >
        {label}
      </span>
      <Autocomplete
        value={value}
        onChange={onChange}
        items={items}
        onSelect={(item) => onChange(item.data)}
        placeholder={placeholder}
        inputClassName={
          "px-2 py-1 rounded bg-surface-raised " +
          "border border-border text-xs " +
          "focus:outline-none focus:border-cta"
        }
      />
    </label>
  );
}


export interface RichSuggestion {
  /** Stored frontmatter value (e.g. task id). */
  id: string;
  /** Shown in dropdown (e.g. task title). */
  label: string;
}


interface RichMetaAutocompleteProps {
  label: string;
  value: string;
  suggestions: RichSuggestion[];
  onChange: (id: string) => void;
  placeholder?: string;
}


/** Variant for cases where the stored value differs from
 *  the displayed label (most importantly: tasks, where
 *  we store the id and show the title). */
export function RichMetaAutocomplete({
  label, value, suggestions, onChange, placeholder,
}: RichMetaAutocompleteProps) {
  const items: AutocompleteItem<RichSuggestion>[] =
    filterRichByPrefix(value, suggestions).map((s) => ({
      key: s.id, label: s.label, data: s,
    }));
  return (
    <label className="flex flex-col gap-0.5">
      <span
        className={
          "text-[9px] text-stone-500 uppercase " +
          "tracking-wider"
        }
      >
        {label}
      </span>
      <Autocomplete
        value={value}
        onChange={onChange}
        items={items}
        onSelect={(item) => onChange(item.data.id)}
        placeholder={placeholder}
        inputClassName={
          "px-2 py-1 rounded bg-surface-raised " +
          "border border-border text-xs " +
          "focus:outline-none focus:border-cta"
        }
      />
    </label>
  );
}


function filterByPrefix(
  query: string, options: string[],
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) =>
    o.toLowerCase().includes(q),
  );
}


function filterRichByPrefix(
  query: string, options: RichSuggestion[],
): RichSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (o) =>
      o.label.toLowerCase().includes(q)
      || o.id.toLowerCase().includes(q),
  );
}
