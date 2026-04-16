/**
 * TimeEntriesSection renders a collapsible list of clock
 * entries for a customer with pagination.
 */
import { useState } from "react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { TimeEntryRow } from "./TimeEntryRow";
import { useCustomerClockEntries } from "../../hooks/useClocks";
import type { Contract } from "../../types";

const PAGE_SIZE = 5;

export interface TimeEntriesSectionProps {
  /** Customer name to fetch entries for. */
  customerName: string;
  /** Contracts available for the entry editor. */
  contracts: Contract[];
}

/** Collapsible time entries list with pagination. */
export function TimeEntriesSection({
  customerName,
  contracts,
}: TimeEntriesSectionProps) {
  const { data: entries = [] } =
    useCustomerClockEntries(customerName);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const sorted = [...entries].sort((a, b) =>
    (b.start ?? "").localeCompare(a.start ?? ""),
  );
  const visible = sorted.slice(0, limit);
  const hasMore = sorted.length > limit;

  return (
    <CollapsibleSection
      label="Time Entries"
      count={entries.length}
    >
      <div className="ml-5">
        {entries.length === 0 ? (
          <p
            className={
              "text-[10px] text-stone-500 py-1"
            }
          >
            No entries
          </p>
        ) : (
          <>
            {visible.map((e) => (
              <TimeEntryRow
                key={e.start}
                entry={e}
                contracts={contracts}
              />
            ))}
            {hasMore && (
              <button
                onClick={() =>
                  setLimit((l) => l + PAGE_SIZE)
                }
                className={[
                  "w-full text-center py-1.5",
                  "text-[10px] text-stone-500",
                  "hover:text-cta transition-colors",
                ].join(" ")}
              >
                Show{" "}
                {Math.min(
                  PAGE_SIZE,
                  entries.length - limit,
                )}{" "}
                more
              </button>
            )}
          </>
        )}
      </div>
    </CollapsibleSection>
  );
}
