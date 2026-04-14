/**
 * ContractsSection renders the list of active and
 * invoiced contracts for a customer.
 */
import { CollapsibleSection } from "../common/CollapsibleSection";
import { ContractRow } from "./ContractRow";
import { useContracts } from "../../hooks/useContracts";
import type { Customer } from "../../types";

export interface ContractsSectionProps {
  /** The customer whose contracts to display. */
  customer: Customer;
}

/** Grouped contract list (active + collapsible invoiced). */
export function ContractsSection({
  customer,
}: ContractsSectionProps) {
  const hasContracts = customer.contracts.length > 0;
  const { data: contracts = [] } = useContracts(
    hasContracts ? customer.name : null,
  );

  if (!hasContracts) return null;

  const active = contracts.filter((c) => !c.invoiced);
  const invoiced = contracts.filter((c) => c.invoiced);

  return (
    <div className="flex flex-col gap-1.5">
      {active.map((c) => (
        <ContractRow
          key={c.name}
          contract={c}
          customerName={customer.name}
        />
      ))}
      {invoiced.length > 0 && (
        <CollapsibleSection
          label="Invoiced"
          count={invoiced.length}
        >
          {invoiced.map((c) => (
            <ContractRow
              key={c.name}
              contract={c}
              customerName={customer.name}
            />
          ))}
        </CollapsibleSection>
      )}
    </div>
  );
}
