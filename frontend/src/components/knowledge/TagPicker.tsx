/**
 * @module TagPicker
 *
 * Free-text tag input with autocomplete from a known-tags
 * list. Tags are added on Enter or Tab; Backspace on an
 * empty input removes the last chip. Suggestions are
 * filtered by the live prefix and dedup'd against the
 * already-selected tags.
 */
import { X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { freeTagBadgeStyle } from "../../utils/tagColors";

interface TagPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder?: string;
}

export function TagPicker({
  value, onChange, suggestions, placeholder,
}: TagPickerProps) {
  const { t } = useTranslation("knowledge");
  const [draft, setDraft] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const candidates = useMemo(() => {
    const selected = new Set(value);
    const prefix = draft.trim().toLowerCase();
    return suggestions
      .filter((tag) => !selected.has(tag))
      .filter((tag) =>
        prefix === ""
          || tag.toLowerCase().includes(prefix),
      )
      .slice(0, 8);
  }, [draft, suggestions, value]);

  function commitTag(tag: string) {
    const cleaned = tag.trim();
    if (!cleaned || value.includes(cleaned)) {
      setDraft("");
      return;
    }
    onChange([...value, cleaned]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault();
        commitTag(draft);
      }
      return;
    }
    if (e.key === "Backspace" && !draft && value.length) {
      removeTag(value[value.length - 1]);
    }
  }

  return (
    <div
      className={
        "relative flex flex-wrap items-center gap-1 " +
        "px-2 py-1 rounded bg-surface-raised " +
        "border border-border focus-within:border-cta"
      }
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag) => (
        <span
          key={tag}
          style={freeTagBadgeStyle(tag)}
          className={
            "inline-flex items-center gap-0.5 " +
            "px-1.5 py-0.5 rounded text-[10px] " +
            "font-medium"
          }
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={(e) => {
              e.stopPropagation();
              removeTag(tag);
            }}
            className="hover:opacity-70"
          >
            <X size={9} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setShowMenu(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowMenu(true)}
        onBlur={() => setShowMenu(false)}
        placeholder={placeholder ?? t("addTag")}
        className={
          "flex-1 min-w-[100px] bg-transparent " +
          "text-xs focus:outline-none"
        }
      />
      {showMenu && candidates.length > 0 && (
        <ul
          className={
            "absolute left-0 top-full mt-1 z-50 " +
            "w-full max-h-48 overflow-y-auto " +
            "rounded border border-border " +
            "bg-surface-overlay shadow-lg"
          }
        >
          {candidates.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitTag(tag)}
                className={
                  "w-full text-left px-2 py-1 text-xs " +
                  "hover:bg-surface-raised flex " +
                  "items-center gap-1.5"
                }
              >
                <span
                  style={freeTagBadgeStyle(tag)}
                  className={
                    "px-1.5 py-0.5 rounded " +
                    "text-[10px]"
                  }
                >
                  {tag}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
