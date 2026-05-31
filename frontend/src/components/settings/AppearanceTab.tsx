import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  FONT_PRESETS,
  THEME_PRESETS,
  type DarkPresetId,
  type FontPresetId,
  type LightPresetId,
  type ThemeMode,
} from "../../App";
import { inputCls } from "./styles";


// -----------------------------------------------------------------
// App title — overrides the header label next to the logo.
// Lives in Appearance because it's a visual customisation,
// alongside theme + font choices.
// -----------------------------------------------------------------

function AppTitleSection() {
  const { t } = useTranslation("settings");
  const [title, setTitle] = useState(
    () => localStorage.getItem("kaisho_app_title") || "",
  );

  function commit() {
    const val = title.trim();
    if (val) {
      localStorage.setItem("kaisho_app_title", val);
    } else {
      localStorage.removeItem("kaisho_app_title");
    }
    window.dispatchEvent(new Event("app-title-changed"));
  }

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wider uppercase text-fg-muted mb-3">
        {t("appTitle")}
      </h2>
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          placeholder="KAISHO"
          className={[
            "px-3 py-1.5 rounded text-sm w-48",
            "bg-surface-overlay border border-strong",
            "text-fg-strong placeholder-fg-subtle",
            "focus:outline-none focus:border-cta",
          ].join(" ")}
        />
        <span className="text-[10px] text-fg-subtle">
          {t("appTitleHint")}
        </span>
      </div>
    </section>
  );
}


// -----------------------------------------------------------------
// Appearance — mode (light / dark / system) plus a preset
// per mode and a font choice. Values land in localStorage;
// App.tsx listens for ``kaisho-theme-changed`` to re-apply
// without a reload.
// -----------------------------------------------------------------

function ThemeSection() {
  const { t } = useTranslation("settings");

  const [mode, setMode] = useState<ThemeMode>(() => {
    const v = localStorage.getItem("theme");
    return v === "dark" || v === "light" || v === "system"
      ? v : "system";
  });
  const [lightPreset, setLightPreset] = (
    useState<LightPresetId>(() => {
      const v = localStorage.getItem("themeLight");
      const known = THEME_PRESETS.light
        .find((p) => p.id === v);
      return (known?.id ?? "zinc") as LightPresetId;
    })
  );
  const [darkPreset, setDarkPreset] = (
    useState<DarkPresetId>(() => {
      const v = localStorage.getItem("themeDark");
      const known = THEME_PRESETS.dark
        .find((p) => p.id === v);
      return (known?.id ?? "zinc") as DarkPresetId;
    })
  );
  const [font, setFont] = useState<FontPresetId>(() => {
    const v = localStorage.getItem("themeFont");
    const known = FONT_PRESETS.find((p) => p.id === v);
    return (known?.id ?? "inter") as FontPresetId;
  });

  function commitMode(next: ThemeMode) {
    setMode(next);
    localStorage.setItem("theme", next);
    window.dispatchEvent(new Event("kaisho-theme-changed"));
  }
  function commitLight(next: LightPresetId) {
    setLightPreset(next);
    localStorage.setItem("themeLight", next);
    window.dispatchEvent(new Event("kaisho-theme-changed"));
  }
  function commitDark(next: DarkPresetId) {
    setDarkPreset(next);
    localStorage.setItem("themeDark", next);
    window.dispatchEvent(new Event("kaisho-theme-changed"));
  }
  function commitFont(next: FontPresetId) {
    setFont(next);
    localStorage.setItem("themeFont", next);
    window.dispatchEvent(new Event("kaisho-theme-changed"));
  }

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wider uppercase text-fg-muted mb-3">
        {t("appearance")}
      </h2>
      <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-3 items-center max-w-md">
        <label className="text-xs text-fg-muted">
          {t("themeMode")}
        </label>
        <select
          value={mode}
          onChange={(e) =>
            commitMode(e.target.value as ThemeMode)}
          className={inputCls + " max-w-[12rem]"}
        >
          <option value="light">{t("themeModeLight")}</option>
          <option value="dark">{t("themeModeDark")}</option>
          <option value="system">{t("themeModeSystem")}</option>
        </select>

        <label className="text-xs text-fg-muted">
          {t("themeLight")}
        </label>
        <select
          value={lightPreset}
          onChange={(e) =>
            commitLight(e.target.value as LightPresetId)}
          className={inputCls + " max-w-[12rem]"}
        >
          {THEME_PRESETS.light.map((p) => (
            <option key={p.id} value={p.id}>
              {t(p.labelKey)}
            </option>
          ))}
        </select>

        <label className="text-xs text-fg-muted">
          {t("themeDark")}
        </label>
        <select
          value={darkPreset}
          onChange={(e) =>
            commitDark(e.target.value as DarkPresetId)}
          className={inputCls + " max-w-[12rem]"}
        >
          {THEME_PRESETS.dark.map((p) => (
            <option key={p.id} value={p.id}>
              {t(p.labelKey)}
            </option>
          ))}
        </select>

        <label className="text-xs text-fg-muted">
          {t("themeFont")}
        </label>
        <select
          value={font}
          onChange={(e) =>
            commitFont(e.target.value as FontPresetId)}
          className={inputCls + " max-w-[12rem]"}
          // Live-preview the font in the dropdown itself.
          style={{
            fontFamily: FONT_PRESETS
              .find((p) => p.id === font)?.family,
          }}
        >
          {FONT_PRESETS.map((p) => (
            <option
              key={p.id} value={p.id}
              style={{ fontFamily: p.family }}
            >
              {t(p.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[10px] text-fg-subtle mt-3 max-w-md">
        {t("themeHint")}
      </p>
    </section>
  );
}


export function AppearanceTab(): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <AppTitleSection />
      <ThemeSection />
    </div>
  );
}
