import { useCustomers } from "./useCustomers";

/**
 * Returns a Set of "customer|contract" keys for all
 * invoiced contracts. Use to check if a clock entry's
 * contract is invoiced without per-entry API calls.
 */
export function useInvoicedContracts(): Set<string> {
  const { data: customers = [] } = useCustomers(true);
  const set = new Set<string>();
  for (const c of customers) {
    for (const con of c.contracts ?? []) {
      if (con.invoiced) {
        set.add(`${c.name}|${con.name}`);
      }
    }
  }
  return set;
}

export function isInvoiced(
  invoicedSet: Set<string>,
  customer: string,
  contract: string | null | undefined,
): boolean {
  if (!contract) return false;
  return invoicedSet.has(`${customer}|${contract}`);
}
