import { useMemo } from "react";
import { useCustomers } from "./useCustomers";

/**
 * Returns a map of customer name -> color hex string.
 * Components can use this to show colored dots next to
 * customer names throughout the app.
 */
export function useCustomerColors(): Record<
  string, string
> {
  const { data: customers } = useCustomers();
  return useMemo(() => {
    const map: Record<string, string> = {};
    if (!customers) return map;
    for (const c of customers) {
      if (c.color) {
        map[c.name] = c.color;
      }
    }
    return map;
  }, [customers]);
}
