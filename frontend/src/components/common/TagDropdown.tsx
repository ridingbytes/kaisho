import { Tag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface TagDef {
  name: string;
  color: string;
}

interface Props {
  selected: string[];
  allTags: TagDef[];
  onChange: (tags: string[]) => void;
}

export function TagDropdown({ selected, allTags, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  function toggle(name: string) {
    onChange(
      selected.includes(name)
        ? selected.filter((t) => t !== name)
        : [...selected, name]
    );
  }

  if (allTags.length === 0) return null;

  return (
    <div ref={ref} className="relative flex items-center gap-1 flex-wrap">
      {selected.map((tagName) => {
        const def = allTags.find((t) => t.name === tagName);
        return (
          <span
            key={tagName}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
            style={{ backgroundColor: def?.color ?? "#64748b" }}
          >
            {tagName}
            <button
              type="button"
              onClick={() => toggle(tagName)}
              className="opacity-70 hover:opacity-100 leading-none"
            >
              <X size={9} />
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "p-1 rounded transition-colors",
          open
            ? "text-accent bg-accent-muted"
            : "text-slate-600 hover:text-slate-400",
        ].join(" ")}
        title="Tags"
      >
        <Tag size={12} />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-20 mt-1 min-w-[140px] bg-surface-overlay border border-border rounded-lg shadow-lg py-1">
          {allTags.map((tag) => {
            const active = selected.includes(tag.name);
            return (
              <button
                key={tag.name}
                type="button"
                onClick={() => toggle(tag.name)}
                className={[
                  "w-full flex items-center gap-2 px-3 py-1.5 text-left",
                  "text-xs transition-colors",
                  active
                    ? "text-slate-200 bg-surface-raised"
                    : "text-slate-500 hover:text-slate-300 hover:bg-surface-raised",
                ].join(" ")}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
                {active && (
                  <span className="ml-auto text-accent">✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
