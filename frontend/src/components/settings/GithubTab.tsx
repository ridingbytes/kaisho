import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGithubSettings,
  useUpdateGithubSettings,
} from "../../hooks/useSettings";
import { Toggle } from "../common/Toggle";
import {
  isGithubNavHidden,
  setGithubNavHidden,
} from "../../utils/navPrefs";
import { inputCls, saveBtnCls } from "./styles";

export function GithubSection(): JSX.Element {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const { data: githubSettings, isLoading } =
    useGithubSettings();
  const update = useUpdateGithubSettings();

  const [baseUrl, setBaseUrl] = useState(
    "https://api.github.com",
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (githubSettings) {
      setBaseUrl(
        githubSettings.base_url ||
          "https://api.github.com",
      );
    }
  }, [githubSettings]);

  function handleSave() {
    // The token is managed in the Integrations tab; this
    // page only configures the API base URL (Enterprise).
    update.mutate(
      { base_url: baseUrl },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  }

  if (isLoading) {
    return (
      <p className="text-sm text-stone-500">
        Loading...
      </p>
    );
  }

  return (
    <section>
      <div className="bg-surface-card rounded-xl border border-border p-4 mb-3">
        <p className="text-xs text-stone-600 leading-relaxed">
          {t("githubTokenInIntegrations")}
        </p>
        {githubSettings?.token_set ? (
          <div className="flex items-center gap-2 mt-2">
            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <span className="text-xs text-green-400">
              {t("tokenConfigured")}
            </span>
          </div>
        ) : (
          <p className="text-[10px] text-stone-500 mt-2">
            {t("githubNotConnectedHint")}
          </p>
        )}
      </div>
      <HideGithubNavToggle />
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
            {t("apiSection")}
          </p>
          <label className="flex items-center gap-3">
            <span className="text-xs text-stone-700 w-32 shrink-0">
              {t("baseUrl")}
            </span>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) =>
                setBaseUrl(e.target.value)
              }
              placeholder="https://api.github.com"
              className={inputCls}
            />
          </label>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className={saveBtnCls}
        >
          {update.isPending ? tc("saving") : tc("save")}
        </button>
        {saved && (
          <span className="text-xs text-green-400">
            {tc("saved")}
          </span>
        )}
        {update.isError && (
          <span className="text-xs text-red-400">
            {tc("saveFailed")}
          </span>
        )}
      </div>
    </section>
  );
}

function HideGithubNavToggle() {
  const { t } = useTranslation("settings");
  const [hidden, setHidden] = useState(() =>
    isGithubNavHidden(),
  );

  function handleChange(next: boolean) {
    setHidden(next);
    setGithubNavHidden(next);
  }

  return (
    <label className="flex items-center gap-3 cursor-pointer mb-4">
      <Toggle checked={hidden} onChange={handleChange} />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm text-stone-800">
          {t("hideGithubNav")}
        </span>
        <span className="text-[10px] text-stone-400">
          {t("hideGithubNavHint")}
        </span>
      </span>
    </label>
  );
}
