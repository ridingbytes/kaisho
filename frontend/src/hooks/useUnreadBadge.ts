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
 */
export function useUnreadBadge(
  panel: string,
  currentCount: number,
) {
  const key = storageKey(panel);

  const [lastSeen, setLastSeen] = useState<number | null>(() => {
    const s = profileGet(key);
    return s !== null ? Number(s) : null;
  });

  // First data load: set baseline so no phantom unreads appear.
  useEffect(() => {
    if (lastSeen === null) {
      profileSet(key, String(currentCount));
      setLastSeen(currentCount);
    }
  }, [key, lastSeen, currentCount]);

  const unread =
    lastSeen !== null ? Math.max(0, currentCount - lastSeen) : 0;

  const markSeen = useCallback(() => {
    profileSet(key, String(currentCount));
    setLastSeen(currentCount);
  }, [key, currentCount]);

  return { unread, markSeen };
}
