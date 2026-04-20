/**
 * i18next configuration.
 *
 * Loads translation JSON files from ``locales/<lang>/``.
 * Falls back to English for any missing key so partial
 * translations are safe.
 *
 * Language is auto-detected from the browser and
 * persisted in ``localStorage`` under ``kaisho_lang``.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// -- English (default, bundled) --------------------------

import commonEn from "./locales/en/common.json";
import navEn from "./locales/en/nav.json";
import clocksEn from "./locales/en/clocks.json";
import kanbanEn from "./locales/en/kanban.json";
import customersEn from "./locales/en/customers.json";
import settingsEn from "./locales/en/settings.json";
import inboxEn from "./locales/en/inbox.json";
import advisorEn from "./locales/en/advisor.json";
import dashboardEn from "./locales/en/dashboard.json";
import cronEn from "./locales/en/cron.json";
import knowledgeEn from "./locales/en/knowledge.json";
import notesEn from "./locales/en/notes.json";

// -- German ----------------------------------------------

import commonDe from "./locales/de/common.json";
import navDe from "./locales/de/nav.json";
import clocksDe from "./locales/de/clocks.json";
import kanbanDe from "./locales/de/kanban.json";
import customersDe from "./locales/de/customers.json";
import settingsDe from "./locales/de/settings.json";
import inboxDe from "./locales/de/inbox.json";
import advisorDe from "./locales/de/advisor.json";
import dashboardDe from "./locales/de/dashboard.json";
import cronDe from "./locales/de/cron.json";
import knowledgeDe from "./locales/de/knowledge.json";
import notesDe from "./locales/de/notes.json";

// -- Detect language -------------------------------------

const STORAGE_KEY = "kaisho_lang";

function detectLanguage(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  const browser = navigator.language.split("-")[0];
  return ["en", "de"].includes(browser) ? browser : "en";
}

// -- Init ------------------------------------------------

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: commonEn,
      nav: navEn,
      clocks: clocksEn,
      kanban: kanbanEn,
      customers: customersEn,
      settings: settingsEn,
      inbox: inboxEn,
      advisor: advisorEn,
      dashboard: dashboardEn,
      cron: cronEn,
      knowledge: knowledgeEn,
      notes: notesEn,
    },
    de: {
      common: commonDe,
      nav: navDe,
      clocks: clocksDe,
      kanban: kanbanDe,
      customers: customersDe,
      settings: settingsDe,
      inbox: inboxDe,
      advisor: advisorDe,
      dashboard: dashboardDe,
      cron: cronDe,
      knowledge: knowledgeDe,
      notes: notesDe,
    },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: {
    // React already escapes output
    escapeValue: false,
  },
});

/**
 * Switch language and persist the choice.
 *
 * @param lang - ISO language code (e.g. "en", "de").
 */
export function setLanguage(lang: string): void {
  localStorage.setItem(STORAGE_KEY, lang);
  i18n.changeLanguage(lang);
}

export default i18n;
