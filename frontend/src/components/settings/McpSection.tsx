import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  fetchMcpInfo,
  rotateMcpToken,
  setMcpEnabled,
  type McpInfo,
} from "../../api/client";
import { isTauri } from "../../utils/tauri";

type Status = "running" | "disabled" | "down";

const POLL_MS = 10_000;

type ClientKind = "claudeCode" | "claudeDesktop" | "cursor";

const CLIENTS: ClientKind[] = [
  "claudeCode", "claudeDesktop", "cursor",
];

function snippetFor(
  kind: ClientKind, info: McpInfo,
): string {
  if (kind === "claudeCode") {
    return (
      "claude mcp add --transport http kaisho \\\n"
      + `  ${info.url} \\\n`
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
  const [status, setStatus] = useState<Status>("running");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [client, setClient] = useState<ClientKind>(
    "claudeCode",
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(
    null,
  );
  const [installState, setInstallState] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [installError, setInstallError] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const next = await fetchMcpInfo();
        if (cancelled) return;
        setInfo(next);
        setStatus(next.enabled ? "running" : "disabled");
      } catch {
        if (cancelled) return;
        setStatus("down");
      }
    }

    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  async function toggle(enabled: boolean) {
    try {
      const next = await setMcpEnabled(enabled);
      setInfo(next);
      setStatus(next.enabled ? "running" : "disabled");
    } catch {
      setStatus("down");
    }
  }

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

  async function installClaudeCode() {
    if (!info) return;
    setInstallState("running");
    setInstallError(null);
    try {
      const { Command } = await import(
        "@tauri-apps/plugin-shell"
      );
      const cmd = Command.create("claude-mcp-add", [
        "mcp", "add",
        "--transport", "http",
        "kaisho",
        info.url,
        "--header",
        `Authorization: Bearer ${info.token}`,
      ]);
      const out = await cmd.execute();
      if (out.code === 0) {
        setInstallState("done");
        window.setTimeout(
          () => setInstallState("idle"), 3000,
        );
      } else {
        setInstallState("error");
        setInstallError(
          (out.stderr || out.stdout || "exit "
            + out.code).trim().split("\n").pop()
          || `exit ${out.code}`,
        );
      }
    } catch (e) {
      setInstallState("error");
      setInstallError(
        e instanceof Error ? e.message : String(e),
      );
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

  const dot = status === "running"
    ? "bg-green-500"
    : status === "disabled"
    ? "bg-fg-muted"
    : "bg-red-500";

  return (
    <div className="bg-surface-card rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-fg-strong flex items-center gap-2">
            {t("integrations.mcp.title")}
            <span className="inline-flex items-center gap-1 text-2xs text-fg-muted font-normal">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`}
              />
              {t(`integrations.mcp.status.${status}`)}
            </span>
          </p>
          <p className="text-2xs text-fg-muted mt-0.5">
            {t("integrations.mcp.hint")}
          </p>
        </div>
        <label className="flex items-center gap-2 text-2xs text-fg-muted cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={info.enabled}
            onChange={(e) => toggle(e.target.checked)}
            className="accent-cta"
          />
          {t("integrations.mcp.enable")}
        </label>
      </div>

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

      <p className="text-2xs text-fg-muted mt-2">
        {t(`integrations.mcp.howto.${client}`)}
      </p>

      <div className="relative mt-1">
        <pre className="text-2xs bg-surface-raised border border-border rounded-md p-2 overflow-x-auto text-fg whitespace-pre">
          {snippetFor(client, info)}
        </pre>
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          {client === "claudeCode" && isTauri() && (
            <button
              type="button"
              onClick={installClaudeCode}
              disabled={installState === "running"}
              className={
                btn
                + " bg-cta text-white hover:bg-cta-hover"
              }
            >
              {installState === "running"
                ? t("integrations.mcp.installing")
                : installState === "done"
                ? t("integrations.mcp.installed")
                : t("integrations.mcp.install")}
            </button>
          )}
          <button
            type="button"
            onClick={() => copy(
              "snippet", snippetFor(client, info),
            )}
            className={
              btn
              + " bg-surface-card border border-border text-fg hover:bg-surface-raised"
            }
          >
            {copiedKey === "snippet"
              ? t("integrations.mcp.copied")
              : t("integrations.mcp.copy")}
          </button>
        </div>
      </div>
      {installState === "error" && installError && (
        <p className="text-2xs text-red-500 mt-1">
          {t("integrations.mcp.installError", {
            error: installError,
          })}
        </p>
      )}

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
