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

/**
 * Advanced GitHub options shown under the connected GitHub
 * row in the Integrations tab: hide the sidebar entry and
 * set the API base URL (GitHub Enterprise). The token
 * itself is connected in the Integrations row above.
 */
export function GithubAdvanced(): JSX.Element {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const { data: githubSettings } = useGithubSettings();
  const update = useUpdateGithubSettings();

  const [hidden, setHidden] = useState(() =>
    isGithubNavHidden(),
  );
  const [baseUrl, setBaseUrl] = useState(
    "https://api.github.com",
  );
  // The base URL only matters for GitHub Enterprise; on
  // github.com it is always api.github.com. Keep it tucked
  // behind a disclosure, opened automatically when a custom
  // (Enterprise) host is already configured.
  const [showEnterprise, setShowEnterprise] =
    useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (githubSettings) {
      const url =
        githubSettings.base_url ||
        "https://api.github.com";
      setBaseUrl(url);
      if (url !== "https://api.github.com") {
        setShowEnterprise(true);
      }
    }
  }, [githubSettings]);

  function handleHide(next: boolean) {
    setHidden(next);
    setGithubNavHidden(next);
  }

  function handleSave() {
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

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
        {t("integrations.github.viewOptions")}
      </p>
      <label className="flex items-center gap-3 cursor-pointer mb-3">
        <Toggle checked={hidden} onChange={handleHide} />
        <span className="flex flex-col gap-0.5">
          <span className="text-xs text-fg-strong">
            {t("hideGithubNav")}
          </span>
          <span className="text-[10px] text-fg-subtle">
            {t("hideGithubNavHint")}
          </span>
        </span>
      </label>
      {!showEnterprise ? (
        <button
          type="button"
          onClick={() => setShowEnterprise(true)}
          className="text-[11px] text-fg-subtle hover:text-fg-muted underline"
        >
          {t("githubEnterprise")}
        </button>
      ) : (
        <div>
          <p className="text-[10px] text-fg-subtle mb-1.5">
            {t("githubEnterpriseHint")}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg w-20 shrink-0">
              {t("baseUrl")}
            </span>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.github.com"
              className={inputCls}
            />
            <button
              type="button"
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
          </div>
        </div>
      )}
    </div>
  );
}
