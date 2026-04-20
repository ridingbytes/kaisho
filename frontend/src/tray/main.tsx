import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import i18n from "../i18n";
import "../index.css";
import { TrayPanel } from "./TrayPanel";

// Expose i18n so the inline theme/lang sync script
// in tray.html can switch language on storage events.
(window as unknown as Record<string, unknown>)
  .__i18n = i18n;

const el = document.getElementById("tray-root");
if (!el) throw new Error("No #tray-root element");

createRoot(el).render(
  <StrictMode>
    <TrayPanel />
  </StrictMode>
);
