import { useCallback, useEffect, useState } from "react";
import {
  profileGet,
  profileSet,
} from "../utils/profileStorage";

function storageKey(panel: string) {
  return `unread_${panel}`;
}

/**
 * Track unread item counts per panel using localStorage.
 *
 * On first load (no stored baseline) the current count is used as
 * the baseline so no phantom unreads appear.  unread increments
 * whenever currentCount grows above the stored baseline.
 * Call markSeen() to reset the baseline to the current count.
 *
 * isLoading must be passed from the caller's React Query result.
 * Baseline initialization and markSeen are both suppressed while
 * data is still loading to prevent the React Query default value
 * of [] (count=0) from being stored as the baseline.
 */
export function useUnreadBadge(
  panel: string,
  currentCount: number,
  isLoading: boolean,
) {
  const key = storageKey(panel);

  const [lastSeen, setLastSeen] = useState<number | null>(() => {
    const s = profileGet(key);
    return s !== null ? Number(s) : null;
  });

  // First data load: set baseline so no phantom unreads appear.
  // Guard against loading state so count=0 default is never stored.
  useEffect(() => {
    if (!isLoading && lastSeen === null) {
      profileSet(key, String(currentCount));
      setLastSeen(currentCount);
    }
  }, [key, isLoading, lastSeen, currentCount]);

  const unread =
    lastSeen !== null ? Math.max(0, currentCount - lastSeen) : 0;

  const markSeen = useCallback(() => {
    if (isLoading) return;
    profileSet(key, String(currentCount));
    setLastSeen(currentCount);
  }, [key, isLoading, currentCount]);

  return { unread, markSeen };
}
