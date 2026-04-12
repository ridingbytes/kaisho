import { useEffect, useState } from "react";
import {
  useGithubSettings,
  useUpdateGithubSettings,
} from "../../hooks/useSettings";
import { inputCls, saveBtnCls } from "./styles";

export function GithubSection(): JSX.Element {
  const { data: githubSettings, isLoading } =
    useGithubSettings();
  const update = useUpdateGithubSettings();

  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    "https://api.github.com",
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (githubSettings) {
      setToken(githubSettings.token ?? "");
      setBaseUrl(
        githubSettings.base_url ||
          "https://api.github.com",
      );
    }
  }, [githubSettings]);

  function handleSave() {
    const updates: {
      token?: string;
      base_url?: string;
    } = {
      base_url: baseUrl,
    };
    if (token) updates.token = token;
    update.mutate(updates, {
      onSuccess: () => {
        setSaved(true);
        setToken("");
        setTimeout(() => setSaved(false), 2000);
      },
    });
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
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
            Authentication
          </p>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-stone-500 leading-relaxed mb-1">
              A Personal Access Token (PAT) is a GitHub
              credential that grants API access without a
              password. Create a classic PAT at{" "}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cta hover:underline"
              >
                github.com/settings/tokens
              </a>{" "}
              with the following scopes:{" "}
              <span className="font-mono text-[11px] text-stone-600">
                repo, read:org, read:project,
                read:user, read:discussion,
                read:packages
              </span>
            </p>
            {githubSettings?.token_set && (
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                <span className="text-xs text-green-400">
                  Token configured
                </span>
              </div>
            )}
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                Personal Access Token
              </span>
              <input
                type="password"
                value={token}
                onChange={(e) =>
                  setToken(e.target.value)
                }
                placeholder="ghp_..."
                className={inputCls}
              />
            </label>
          </div>
        </div>

        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
            API
          </p>
          <label className="flex items-center gap-3">
            <span className="text-xs text-stone-700 w-32 shrink-0">
              Base URL
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
          {update.isPending ? "Saving..." : "Save"}
        </button>
        {saved && (
          <span className="text-xs text-green-400">
            Saved.
          </span>
        )}
        {update.isError && (
          <span className="text-xs text-red-400">
            Save failed.
          </span>
        )}
      </div>
      <p className="mt-2 text-[10px] text-stone-400">
        Token is stored in settings.yaml. It is never
        sent to the browser in full.
      </p>
    </section>
  );
}
