/**
 * Main-window paused-timer widget. Hook-backed thin
 * wrapper around the shared ``PausedTimerView``.
 *
 * - Resume creates a fresh sibling entry with the same
 *   metadata; elapsed restarts from 0 and the paused
 *   gap is excluded from billed time.
 * - Stop clears the paused flag without touching the
 *   already-closed entry, dismissing the widget.
 */
import {
  useClearPaused,
  useStartTimer,
} from "../../hooks/useClocks";
import { useCustomerColors } from "../../hooks/useCustomerColors";
import { PausedTimerView } from "../common/PausedTimerView";
import type { ClockEntry } from "../../types";

interface Props {
  entry: ClockEntry;
}

export function PausedTimer({ entry }: Props) {
  const start = useStartTimer();
  const dismiss = useClearPaused();
  const customerColors = useCustomerColors();
  const custColor = entry.customer
    ? customerColors[entry.customer]
    : undefined;

  return (
    <PausedTimerView
      entry={entry}
      customerColor={custColor}
      resumePending={start.isPending}
      stopPending={dismiss.isPending}
      showResumeHint
      onResume={() =>
        start.mutate({
          customer: entry.customer,
          description: entry.description,
          contract: entry.contract ?? undefined,
          taskId: entry.task_id ?? undefined,
        })
      }
      onStop={() => dismiss.mutate()}
    />
  );
}
