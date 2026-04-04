import { createContext, useContext } from "react";
import type { View } from "../App";

export const ViewContext = createContext<{
  setView: (v: View) => void;
} | null>(null);

export function useSetView() {
  const ctx = useContext(ViewContext);
  if (!ctx) {
    throw new Error("useSetView must be inside ViewContext.Provider");
  }
  return ctx.setView;
}
