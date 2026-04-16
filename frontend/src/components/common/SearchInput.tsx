import { X } from "lucide-react";
import { useRef } from "react";
import { isValidQuery } from "../../utils/filterMatch";

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  /** When true, validate `value` as a filterMatch query
   *  and apply a red outline + tooltip on invalid regex.
   *  Callers that use the shared matcher should set this. */
  validate?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  inputClassName,
  autoFocus,
  validate,
}: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const invalid = validate && !isValidQuery(value);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      onChange("");
      ref.current?.blur();
    }
  }

  return (
    <div className={`relative flex items-center ${className ?? ""}`}>
      <input
        ref={ref}
        type="text"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        title={
          validate
            ? invalid
              ? "Invalid regex \u2014 filter is ignored " +
                "until you fix it"
              : "Filter (case-insensitive regex; " +
                "comma separates OR terms)"
            : undefined
        }
        className={[
          inputClassName ?? "",
          invalid ? "!border-red-400" : "",
        ].join(" ")}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          tabIndex={-1}
          className="absolute right-1.5 text-stone-400 hover:text-stone-700 transition-colors"
          aria-label="Clear search"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}
