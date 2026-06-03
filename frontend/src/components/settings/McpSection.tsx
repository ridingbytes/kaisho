import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  fetchMcpInfo,
  rotateMcpToken,
  type McpInfo,
} from "../../api/client";

type ClientKind = "claudeCode" | "claudeDesktop" | "cursor";

const CLIENTS: ClientKind[] = [
  "claudeCode", "claudeDesktop", "cursor",
];

function snippetFor(
  kind: ClientKind, info: McpInfo,
): string {
  if (kind === "claudeCode") {
    return (
      "claude mcp add kaisho \\\n"
      + "  --transport http \\\n"
      + `  --url ${info.url} \\\n`
      + `  --header "Authorization: Bearer ${info.token}"`
    );
  }
  const json = {
    mcpServers: {
      kaisho: {
        url: info.url,
        headers: {
          Authorization: `Bearer ${info.token}`,
        },
      },
    },
  };
  return JSON.stringify(json, null, 2);
}

const btn =
  "px-3 py-1 rounded-lg text-xs font-medium "
  + "transition-colors disabled:opacity-50";


export function McpSection() {
  const { t } = useTranslation("settings");
  const [info, setInfo] = useState<McpInfo | null>(null);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [client, setClient] = useState<ClientKind>(
    "claudeCode",
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(
    null,
  );

  useEffect(() => {
    fetchMcpInfo().then(setInfo).catch(() => {});
  }, []);

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // Clipboard may be unavailable in some webviews; the
      // user can select+copy from the visible text.
    }
  }

  async function rotate() {
    if (!window.confirm(t("integrations.mcp.rotateConfirm"))) {
      return;
    }
    setBusy(true);
    try {
      const next = await rotateMcpToken();
      setInfo(next);
      setReveal(true);
    } finally {
      setBusy(false);
    }
  }

  if (!info) return null;

  const maskedToken = "•".repeat(
    Math.min(40, info.token.length),
  );

  return (
    <div className="bg-surface-card rounded-lg border border-border p-4">
      <p className="font-semibold text-sm text-fg-strong">
        {t("integrations.mcp.title")}
      </p>
      <p className="text-2xs text-fg-muted mt-0.5">
        {t("integrations.mcp.hint")}
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <Field
          label={t("integrations.mcp.urlLabel")}
          value={info.url}
          copyKey="url"
          copiedKey={copiedKey}
          onCopy={() => copy("url", info.url)}
          t={t}
        />
        <Field
          label={t("integrations.mcp.tokenLabel")}
          value={reveal ? info.token : maskedToken}
          copyValue={info.token}
          copyKey="token"
          copiedKey={copiedKey}
          onCopy={() => copy("token", info.token)}
          extraButton={(
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className={`${btn} bg-surface-raised border border-border text-fg hover:bg-surface-card`}
            >
              {reveal
                ? t("integrations.mcp.hide")
                : t("integrations.mcp.reveal")}
            </button>
          )}
          t={t}
        />
      </div>

      <div className="mt-3 flex items-center gap-1">
        {CLIENTS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setClient(kind)}
            className={
              "px-2.5 py-1 rounded-md text-2xs font-medium "
              + "transition-colors "
              + (kind === client
                ? "bg-surface-raised border border-border text-fg-strong"
                : "text-fg-muted hover:text-fg")
            }
          >
            {t(`integrations.mcp.client.${kind}`)}
          </button>
        ))}
      </div>

      <div className="relative mt-2">
        <pre className="text-2xs bg-surface-raised border border-border rounded-md p-2 overflow-x-auto text-fg whitespace-pre">
          {snippetFor(client, info)}
        </pre>
        <button
          type="button"
          onClick={() => copy(
            "snippet", snippetFor(client, info),
          )}
          className={
            "absolute top-1.5 right-1.5 "
            + btn
            + " bg-surface-card border border-border text-fg hover:bg-surface-raised"
          }
        >
          {copiedKey === "snippet"
            ? t("integrations.mcp.copied")
            : t("integrations.mcp.copy")}
        </button>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={rotate}
          disabled={busy}
          className={`${btn} bg-surface-raised border border-border text-fg hover:bg-surface-card`}
        >
          {t("integrations.mcp.rotate")}
        </button>
      </div>
    </div>
  );
}


interface FieldProps {
  label: string;
  value: string;
  copyValue?: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: () => void;
  extraButton?: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}

function Field({
  label, value, copyKey, copiedKey, onCopy, extraButton, t,
}: FieldProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs text-fg-muted w-20 shrink-0">
        {label}
      </span>
      <code className="flex-1 text-2xs bg-surface-raised border border-border rounded-md px-2 py-1 text-fg-strong truncate font-mono">
        {value}
      </code>
      {extraButton}
      <button
        type="button"
        onClick={onCopy}
        className={`${btn} bg-surface-raised border border-border text-fg hover:bg-surface-card`}
      >
        {copiedKey === copyKey
          ? t("integrations.mcp.copied")
          : t("integrations.mcp.copy")}
      </button>
    </div>
  );
}
