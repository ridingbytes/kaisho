import {
  useCustomers,
  useCreateCustomer,
} from "../../hooks/useCustomers";
import {
  Autocomplete,
  type AutocompleteItem,
} from "./Autocomplete";

/**
 * Autocomplete input for selecting or creating
 * a customer. Wraps the generic Autocomplete
 * component with customer-specific data fetching
 * and creation logic.
 */

interface Props {
  /** Current customer name text. */
  value: string;
  /** Called when the text or selection changes. */
  onChange: (value: string) => void;
  /** Forwarded to the underlying input. */
  onKeyDown?: (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

const MAX_UNFILTERED = 8;

export function CustomerAutocomplete({
  value,
  onChange,
  onKeyDown,
  className,
  inputClassName = "",
  placeholder = "Customer",
  autoFocus,
}: Props) {
  const { data: customers = [] } = useCustomers(true);
  const createCustomer = useCreateCustomer();

  const allNames = customers.map((c) => c.name);
  const trimmed = value.trim();

  const filtered = trimmed
    ? allNames.filter((n) =>
        n.toLowerCase().includes(
          trimmed.toLowerCase(),
        ),
      )
    : allNames.slice(0, MAX_UNFILTERED);

  const items: AutocompleteItem<string>[] =
    filtered.map((name) => ({
      key: name,
      label: name,
      data: name,
    }));

  const exactMatch = allNames.some(
    (n) =>
      n.toLowerCase() === trimmed.toLowerCase(),
  );
  const showCreate = trimmed.length > 0 && !exactMatch;

  function handleSelect(
    item: AutocompleteItem<string>,
  ) {
    onChange(item.data);
  }

  function handleCreate() {
    createCustomer.mutate(
      { name: trimmed },
      { onSuccess: () => onChange(trimmed) },
    );
  }

  return (
    <Autocomplete
      value={value}
      onChange={onChange}
      items={items}
      onSelect={handleSelect}
      onCreate={handleCreate}
      showCreate={showCreate}
      onKeyDown={onKeyDown}
      className={className}
      inputClassName={inputClassName}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
  );
}
