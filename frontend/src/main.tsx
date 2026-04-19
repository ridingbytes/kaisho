import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./index.css";
import { App } from "./App";

const el = document.getElementById("root");
if (!el) throw new Error("No #root element");

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>
);
