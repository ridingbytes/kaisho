/**
 * Shared contract picker for the time-tracking forms.
 *
 * Centralises three things that had drifted across the
 * five hand-rolled copies (BookForm, QuickBookForm x2,
 * EditForm, TimeEntryRow):
 *
 *  - Invoiced contracts are hidden (you can't book against
 *    an already-invoiced contract). The booking forms did
 *    this; the edit forms did not, so an invoiced contract
 *    was selectable when editing but hidden when booking.
 *  - The currently-selected contract is always shown even
 *    if it's invoiced, so editing an entry that already
 *    points at one doesn't silently blank the field.
 *  - The empty option label and the "(closed)" suffix are
 *    rendered consistently.
 *
 * Renders just the ``<select>``; callers keep their own
 * label / wrapper so existing layouts are untouched.
 */
import { useTranslation } from "react-i18next";

import type { Contract } from "../../types";

interface ContractSelectProps {
  contracts: Contract[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Contracts the user may pick: drop invoiced ones, but
 *  always keep the currently-selected contract so editing
 *  never blanks an existing (possibly invoiced) value. */
export function visibleContracts(
  contracts: Contract[], selected: string,
): Contract[] {
  return contracts.filter(
    (c) => !c.invoiced || c.name === selected,
  );
}

export function ContractSelect({
  contracts,
  value,
  onChange,
  className,
}: ContractSelectProps) {
  const { t: tc } = useTranslation("common");
  const options = visibleContracts(contracts, value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">{tc("noContract")}</option>
      {options.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
          {c.end_date ? ` (${tc("closed")})` : ""}
        </option>
      ))}
    </select>
  );
}
