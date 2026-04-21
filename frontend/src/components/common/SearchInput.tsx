import { Search, X } from "lucide-react";
import { useRef } from "react";
import { isValidQuery } from "../../utils/filterMatch";
import { smallInputCls } from "../../styles/formStyles";

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  /** When true, validate `value` as a filterMatch
   *  query and apply a red outline on invalid regex. */
  validate?: boolean;
}

const defaultInputCls = [
  smallInputCls,
  "!pl-7 !pr-6",
].join(" ");

export function SearchInput({
  value,
  onChange,
  placeholder = "Search\u2026",
  className,
  inputClassName,
  autoFocus,
  validate,
}: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const invalid = validate && !isValidQuery(value);

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Escape") {
      onChange("");
      ref.current?.blur();
    }
  }

  return (
    <div
      className={[
        "relative flex items-center",
        className ?? "",
      ].join(" ")}
    >
      <Search
        size={11}
        className={[
          "absolute left-2 pointer-events-none",
          "text-stone-400",
        ].join(" ")}
      />
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
              ? "Invalid regex"
              : "Regex filter (comma = OR)"
            : undefined
        }
        className={[
          inputClassName ?? defaultInputCls,
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
          className={[
            "absolute right-1.5",
            "text-stone-400 hover:text-stone-700",
            "transition-colors",
          ].join(" ")}
          aria-label="Clear search"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}
