import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../i18n";
import "../index.css";
import { TrayPanel } from "./TrayPanel";

const el = document.getElementById("tray-root");
if (!el) throw new Error("No #tray-root element");

createRoot(el).render(
  <StrictMode>
    <TrayPanel />
  </StrictMode>
);
