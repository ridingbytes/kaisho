import { useQuery } from "@tanstack/react-query";
import {
  listCalendarEvents,
  listCalendarSources,
} from "../api/client";

/** Connected calendar sources for the panel header. */
export function useCalendarSources() {
  return useQuery({
    queryKey: ["calendar", "sources"],
    queryFn: listCalendarSources,
    staleTime: 30_000,
  });
}

/** Events in a window, merged across CalDAV + Google.
 *
 *  ``from`` / ``to`` are ISO datetime strings; the query
 *  key includes them so navigating week-to-week creates
 *  separate cache entries (no re-fetch when going back).
 */
export function useCalendarEvents(args: {
  from: string;
  to: string;
  source?: string;
  enabled?: boolean;
}) {
  const { from, to, source, enabled = true } = args;
  return useQuery({
    queryKey: ["calendar", "events", from, to, source],
    queryFn: () =>
      listCalendarEvents({ from, to, source }),
    staleTime: 60_000,
    enabled,
  });
}
