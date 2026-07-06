import { useRef, useState } from "react";
import { X } from "lucide-react";
import { tagBadgeStyle } from "../../utils/tagColors";

interface TagDef {
  name: string;
  color?: string;
}

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Existing tags to suggest while typing (with optional
   * colors so chips match the rest of the app). */
  suggestions?: TagDef[];
  placeholder?: string;
}

/** A tag field: selected tags as removable chips plus a text
 * input that autocompletes against existing tags and also
 * accepts brand-new ones. Reused across projects, tasks, and
 * any entity that allows free tagging. */
export function TagInput({
  value, onChange, suggestions = [], placeholder,
}: Props) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const colorOf = (name: string) =>
    suggestions.find((s) => s.name === name)?.color;

  const matches = suggestions.filter(
    (s) =>
      !value.includes(s.name) &&
      s.name.toLowerCase().includes(draft.trim().toLowerCase()),
  );

  function add(tag: string) {
    const t = tag.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
    setOpen(false);
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-1">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs font-semibold"
          style={tagBadgeStyle(colorOf(tag))}
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            className="opacity-70 hover:opacity-100 leading-none"
          >
            <X size={9} />
          </button>
        </span>
      ))}
      <div className="relative">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(matches[0]?.name ?? draft);
            } else if (
              e.key === "Backspace" && !draft && value.length
            ) {
              remove(value[value.length - 1]);
            }
          }}
          placeholder={placeholder ?? "+ tag"}
          className="text-2xs bg-transparent border-b border-border-subtle focus:outline-none focus:border-cta w-24 px-1 py-0.5"
        />
        {open && matches.length > 0 && (
          <div className="absolute top-full left-0 z-20 mt-1 min-w-[140px] bg-surface-overlay border border-border rounded-lg shadow-lg py-1 max-h-48 overflow-auto">
            {matches.map((s) => (
              <button
                key={s.name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s.name);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-fg-muted hover:text-fg-strong hover:bg-surface-raised transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded shrink-0"
                  style={{
                    backgroundColor: s.color || "#a1a1aa",
                  }}
                />
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
