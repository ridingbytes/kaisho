import { createContext, useContext } from "react";
import type { View } from "../App";

interface ViewContextValue {
  setView: (v: View, search?: string) => void;
  pendingSearch: string;
  clearPendingSearch: () => void;
}

export const ViewContext = createContext<ViewContextValue | null>(null);

export function useSetView() {
  const ctx = useContext(ViewContext);
  if (!ctx) {
    throw new Error("useSetView must be inside ViewContext.Provider");
  }
  return ctx.setView;
}

export function usePendingSearch() {
  const ctx = useContext(ViewContext);
  if (!ctx) {
    throw new Error(
      "usePendingSearch must be inside ViewContext.Provider"
    );
  }
  return {
    pendingSearch: ctx.pendingSearch,
    clearPendingSearch: ctx.clearPendingSearch,
  };
}
