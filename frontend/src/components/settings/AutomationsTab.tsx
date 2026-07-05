import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Trash2 } from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { ToggleField } from "../common/ToggleField";
import { useToast } from "../../context/ToastContext";
import {
  useCreateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useUpdateWebhook,
  useWebhookDeliveries,
  useWebhooks,
} from "../../hooks/useWebhooks";
import type { Webhook, WebhookDelivery } from "../../types";
import { fieldCls, inputCls, saveBtnCls } from "./styles";

/** Colored badge for a delivery status. */
function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "success"
      ? "bg-emerald-500/10 text-emerald-600"
      : status === "blocked"
        ? "bg-amber-500/10 text-amber-600"
        : "bg-red-500/10 text-red-500";
  return (
    <span
      className={[
        "px-1.5 py-0.5 rounded text-2xs font-semibold",
        "uppercase tracking-wider",
        tone,
      ].join(" ")}
    >
      {status}
    </span>
  );
}

/** Multi-select checkbox grid over the event catalog. */
function EventPicker({
  events,
  selected,
  onToggle,
}: {
  events: string[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {events.map((name) => (
        <label
          key={name}
          className={[
            "flex items-center gap-1.5 text-xs",
            "text-fg cursor-pointer",
          ].join(" ")}
        >
          <input
            type="checkbox"
            checked={selected.includes(name)}
            onChange={() => onToggle(name)}
            className="rounded border-border text-cta"
          />
          <span className="font-mono">{name}</span>
        </label>
      ))}
    </div>
  );
}

/** The add-endpoint form. */
function AddWebhookForm({ events }: { events: string[] }) {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const create = useCreateWebhook();
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  function toggle(name: string) {
    setPicked((cur) =>
      cur.includes(name)
        ? cur.filter((n) => n !== name)
        : [...cur, name],
    );
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    create.mutate(
      {
        url: url.trim(),
        events: picked,
        secret: secret.trim(),
        active: true,
      },
      {
        onSuccess: () => {
          toast(t("automations.created"), "success");
          setUrl("");
          setSecret("");
          setPicked([]);
        },
        onError: (err) =>
          toast((err as Error).message, "error"),
      },
    );
  }

  return (
    <form onSubmit={handleAdd} className="space-y-2">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t("automations.urlPlaceholder")}
        className={`${inputCls} w-full`}
      />
      <div>
        <div
          className={[
            "text-2xs uppercase tracking-wider",
            "text-fg-muted mb-1",
          ].join(" ")}
        >
          {t("automations.eventsLabel")}
        </div>
        <EventPicker
          events={events}
          selected={picked}
          onToggle={toggle}
        />
        <div className="text-2xs text-fg-muted mt-1">
          {t("automations.allEventsHint")}
        </div>
      </div>
      <input
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        placeholder={t("automations.secretPlaceholder")}
        className={`${inputCls} w-full`}
      />
      <div>
        <button
          type="submit"
          disabled={!url.trim() || create.isPending}
          className={saveBtnCls}
        >
          {t("automations.addWebhook")}
        </button>
      </div>
    </form>
  );
}

/** One subscription row with inline controls. */
function WebhookRow({
  webhook,
  events,
}: {
  webhook: Webhook;
  events: string[];
}) {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const update = useUpdateWebhook();
  const remove = useDeleteWebhook();
  const test = useTestWebhook();
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>(
    webhook.events,
  );

  function toggleActive(active: boolean) {
    update.mutate({ id: webhook.id, updates: { active } });
  }

  function toggleEvent(name: string) {
    setPicked((cur) =>
      cur.includes(name)
        ? cur.filter((n) => n !== name)
        : [...cur, name],
    );
  }

  function saveEvents() {
    update.mutate(
      { id: webhook.id, updates: { events: picked } },
      {
        onSuccess: () => setEditing(false),
      },
    );
  }

  function handleTest() {
    test.mutate(webhook.id, {
      onSuccess: (d) =>
        toast(
          d.status === "success"
            ? t("automations.tested")
            : t("automations.testFailed", {
                status: d.status,
              }),
          d.status === "success" ? "success" : "error",
        ),
      onError: (err) =>
        toast((err as Error).message, "error"),
    });
  }

  const summary =
    webhook.events.length === 0
      ? t("automations.allEvents")
      : webhook.events.join(", ");

  return (
    <div className="py-3 border-b border-border-subtle">
      <div className="flex items-center gap-2">
        <span
          className="flex-1 text-sm font-mono truncate"
          title={webhook.url}
        >
          {webhook.url}
        </span>
        {webhook.secret_set && (
          <span
            className={[
              "px-1.5 py-0.5 rounded text-2xs",
              "bg-cta-muted text-cta",
            ].join(" ")}
          >
            {t("automations.signed")}
          </span>
        )}
        <button
          onClick={handleTest}
          disabled={test.isPending}
          title={t("automations.test")}
          className={[
            "p-1 rounded text-fg-muted",
            "hover:text-cta disabled:opacity-40",
          ].join(" ")}
        >
          <Send size={13} />
        </button>
        <ConfirmPopover
          onConfirm={() =>
            remove.mutate(webhook.id, {
              onSuccess: () =>
                toast(t("automations.deleted"), "success"),
            })
          }
          disabled={remove.isPending}
        >
          <button
            title={t("automations.delete")}
            className={[
              "p-1 rounded text-fg-muted",
              "hover:text-red-400",
            ].join(" ")}
          >
            <Trash2 size={13} />
          </button>
        </ConfirmPopover>
      </div>

      <ToggleField
        checked={webhook.active}
        onChange={toggleActive}
        label={t("automations.active")}
        description={summary}
      />

      {editing ? (
        <div className="mt-1 space-y-2">
          <EventPicker
            events={events}
            selected={picked}
            onToggle={toggleEvent}
          />
          <div className="flex gap-2">
            <button
              onClick={saveEvents}
              disabled={update.isPending}
              className={saveBtnCls}
            >
              {t("automations.save")}
            </button>
            <button
              onClick={() => {
                setPicked(webhook.events);
                setEditing(false);
              }}
              className={fieldCls}
            >
              {t("automations.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-2xs text-cta hover:underline"
        >
          {t("automations.editEvents")}
        </button>
      )}
    </div>
  );
}

/** Recent delivery log. */
function DeliveriesList() {
  const { t } = useTranslation("settings");
  const { data } = useWebhookDeliveries();
  const deliveries: WebhookDelivery[] =
    data?.deliveries ?? [];

  if (deliveries.length === 0) {
    return (
      <div className="text-xs text-fg-muted">
        {t("automations.noDeliveries")}
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {deliveries.map((d) => (
        <li
          key={d.id}
          className="flex items-center gap-2 text-xs"
        >
          <StatusBadge status={d.status} />
          <span className="font-mono">{d.event}</span>
          <span className="text-fg-muted truncate flex-1">
            {d.error
              ? d.error
              : d.http_status
                ? `HTTP ${d.http_status}`
                : ""}
          </span>
          <span className="text-fg-subtle tabular-nums">
            {d.at.slice(11, 19)}
          </span>
        </li>
      ))}
    </ul>
  );
}

const panelCls = [
  "bg-surface-card rounded-lg border border-border",
].join(" ");
const subCls = "px-4 py-3 border-b border-border-subtle";
const headCls = [
  "text-2xs uppercase tracking-wider text-fg-muted mb-2",
].join(" ");

/** Settings tab: outbound webhooks / workflow automation. */
export function AutomationsSection() {
  const { t } = useTranslation("settings");
  const { data, isLoading } = useWebhooks();
  const webhooks = data?.webhooks ?? [];
  const events = data?.events ?? [];

  return (
    <section className="space-y-4">
      <p className="text-sm text-fg-muted">
        {t("automations.hint")}
      </p>

      <div className={panelCls}>
        <div className={subCls}>
          <div className={headCls}>
            {t("automations.endpoints")}
          </div>
          {isLoading ? (
            <div className="text-xs text-fg-muted">
              {t("automations.loading")}
            </div>
          ) : webhooks.length === 0 ? (
            <div className="text-xs text-fg-muted">
              {t("automations.noWebhooks")}
            </div>
          ) : (
            <div>
              {webhooks.map((w) => (
                <WebhookRow
                  key={w.id}
                  webhook={w}
                  events={events}
                />
              ))}
            </div>
          )}
        </div>

        <div className={subCls}>
          <div className={headCls}>
            {t("automations.addTitle")}
          </div>
          <AddWebhookForm events={events} />
        </div>

        <div className="px-4 py-3">
          <div className={headCls}>
            {t("automations.deliveries")}
          </div>
          <DeliveriesList />
        </div>
      </div>
    </section>
  );
}
