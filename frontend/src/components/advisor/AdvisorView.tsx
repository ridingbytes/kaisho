import {
  useCallback, useEffect, useRef, useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Inbox, Send, Square, Trash2 } from "lucide-react";
import { askAdvisor, captureInboxItem } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import {
  useAiSettings,
  useAvailableModels,
  useCloudSyncStatus,
} from "../../hooks/useSettings";
import { Markdown } from "../common/Markdown";
import { HelpButton } from "../common/HelpButton";
import { PanelToolbar } from "../common/PanelToolbar";
import { DOCS } from "../../docs/panelDocs";
import { openExternal } from "../../utils/tauri";

const QUESTION_TEMPLATE_KEYS = [
  "focusToday",
  "budgetLimit",
  "summarizeWeek",
  "overdueTasks",
  "bookTime",
  "createTask",
  "monthHours",
  "openIssues",
] as const;

export interface AdvisorMessage {
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
  model?: string;
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[70%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-cta text-white text-sm">
        {text}
      </div>
    </div>
  );
}

function CopyToInboxBtn({ text }: { text: string }) {
  const { t } = useTranslation("advisor");
  const toast = useToast();
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  function handleClick() {
    if (pending || done) return;
    setPending(true);
    captureInboxItem({ text })
      .then(() => {
        setDone(true);
        toast(t("copiedToInbox"), "success");
        setTimeout(() => setDone(false), 2000);
      })
      .finally(() => setPending(false));
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending || done}
      className={[
        "p-1 rounded transition-colors",
        done
          ? "text-green-400"
          : "text-stone-400 hover:text-cta hover:bg-cta-muted",
        "disabled:opacity-60",
      ].join(" ")}
      title={t("copyToInbox")}
    >
      {done ? <Check size={12} /> : <Inbox size={12} />}
    </button>
  );
}

function AssistantBubble({
  text,
  thinking,
  timestamp,
  model,
}: {
  text: string;
  thinking?: boolean;
  timestamp?: string;
  model?: string;
}) {
  const meta = [timestamp, model].filter(Boolean).join(" \u00b7 ");

  return (
    <div className="flex justify-start mb-3">
      <div
        className={[
          "max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tl-sm",
          "bg-surface-card border border-border",
          thinking ? "text-sm text-stone-500 italic" : "",
        ].join(" ")}
      >
        {!thinking && meta && (
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] text-stone-400 font-mono">
              {meta}
            </span>
            <CopyToInboxBtn text={text} />
          </div>
        )}
        {thinking ? (
          text
        ) : (
          <Markdown>{text}</Markdown>
        )}
      </div>
    </div>
  );
}

interface AdvisorViewProps {
  messages: AdvisorMessage[];
  onMessagesChange: React.Dispatch<React.SetStateAction<AdvisorMessage[]>>;
}

/** Query keys the advisor's tools may have modified. */
const ADVISOR_INVALIDATIONS = [
  "knowledge", "tasks", "inbox", "notes",
  "clocks", "customers",
];

export function AdvisorView({ messages, onMessagesChange }: AdvisorViewProps) {
  const { t } = useTranslation("advisor");
  const { t: tc } = useTranslation("common");
  const { t: ts } = useTranslation("settings");
  const qc = useQueryClient();
  const { data: aiSettings } = useAiSettings();
  const { data: models = [] } = useAvailableModels();
  const { data: cloudStatus } = useCloudSyncStatus();
  const cloudAi = cloudStatus?.use_cloud_ai;

  const model = cloudAi
    ? "kaisho"
    : (aiSettings?.advisor_model || "");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopRequest = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function clearMessages() {
    onMessagesChange([]);
    setError(null);
  }

  const SLASH_COMMANDS: Record<string, {
    desc: string;
    action: (arg: string) => void;
  }> = {
    "/reset": {
      desc: t("slashReset"),
      action: () => clearMessages(),
    },
    "/help": {
      desc: t("slashHelp"),
      action: () => {
        const lines = Object.entries(SLASH_COMMANDS)
          .map(([cmd, { desc }]) => `**${cmd}** — ${desc}`)
          .join("\n\n");
        onMessagesChange((prev) => [
          ...prev,
          { role: "assistant", text: lines },
        ]);
      },
    },
  };

  function handleSlashCommand(text: string): boolean {
    const [cmd, ...rest] = text.split(" ");
    const handler = SLASH_COMMANDS[cmd];
    if (!handler) return false;
    handler.action(rest.join(" ").trim());
    setInput("");
    return true;
  }

  function sendMessage() {
    const question = input.trim();
    if (!question || loading) return;

    if (question.startsWith("/")) {
      if (handleSlashCommand(question)) return;
    }

    setInput("");
    setError(null);
    setSteps([]);
    onMessagesChange((prev) => [
      ...prev, { role: "user", text: question },
    ]);
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    askAdvisor({
      question, model, history: messages,
      signal: ctrl.signal,
      onEvent: (type, data) => {
        if (type === "tool_call") {
          const name = data.name as string;
          setSteps((p) => [
            ...p,
            t("calling", { name }),
          ]);
        } else if (type === "tool_result") {
          const name = data.name as string;
          const result = data.result as Record<
            string, unknown
          >;
          const hasError = "error" in result;
          setSteps((p) => [
            ...p,
            hasError
              ? t("failed", { name })
              : t("done", { name }),
          ]);
        } else if (type === "thinking") {
          setSteps((p) => [...p, t("thinking")]);
        }
      },
    })
      .then((result) => {
        const ts = new Date().toLocaleTimeString(
          [], { hour: "2-digit", minute: "2-digit" },
        );
        onMessagesChange((prev) => [
          ...prev,
          {
            role: "assistant",
            text: result.answer,
            timestamp: ts,
            model: model || undefined,
          },
        ]);
        for (const key of ADVISOR_INVALIDATIONS) {
          void qc.invalidateQueries({
            queryKey: [key],
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException
          && err.name === "AbortError") {
          onMessagesChange((prev) => [
            ...prev,
            { role: "assistant", text: t("stopped") },
          ]);
          return;
        }
        const msg = err instanceof Error
          ? err.message : t("requestFailed");
        setError(msg);
      })
      .finally(() => {
        abortRef.current = null;
        setSteps([]);
        setLoading(false);
      });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <PanelToolbar
        left={<>
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              title={t("clearChat")}
              className={[
                "p-1 rounded text-stone-500",
                "hover:text-red-400 hover:bg-red-500/10",
                "transition-colors",
              ].join(" ")}
            >
              <Trash2 size={13} />
            </button>
          )}
        </>}
        right={<>
          {model && (
            <button
              onClick={() => {
                window.location.hash = "settings";
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent(
                      "navigate-settings-tab",
                      { detail: "ai" },
                    ),
                  );
                }, 50);
              }}
              className={[
                "px-3 py-1 rounded-lg",
                "text-xs font-medium font-mono",
                "bg-cta/10 text-cta",
                "border border-cta/30",
                "hover:bg-cta/20 transition-colors",
              ].join(" ")}
              title={ts("ai")}
            >
              {cloudAi ? t("kaishoAi") : model}
            </button>
          )}
          <HelpButton
            title={t("advisor")}
            doc={DOCS.advisor}
            view="advisor"
          />
        </>}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 && !loading && !cloudAi && !model && models.length === 0 && (
          <div className="max-w-md mx-auto mt-12 text-center space-y-3">
            <p className="text-sm font-medium text-stone-700">
              {t("noAiProvider")}
            </p>
            <p className="text-xs text-stone-500 leading-relaxed">
              {t("noAiProviderHint")}
            </p>
            <button
              onClick={() =>
                openExternal(
                  "https://kaisho.dev/#pricing",
                )
              }
              className="text-xs text-cta hover:underline"
            >
              {ts("learnKaishoCloud")}
            </button>
          </div>
        )}
        {messages.length === 0 && !loading && (cloudAi || model || models.length > 0) && (
          <div className="mt-8 space-y-3">
            <p className="text-sm text-stone-500 text-center">
              {t("askOrPick")}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUESTION_TEMPLATE_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => { setInput(t(key)); }}
                  className={[
                    "px-3 py-1.5 rounded-lg text-xs",
                    "bg-surface-raised border border-border",
                    "text-stone-700 hover:text-cta",
                    "hover:border-cta/40 transition-colors",
                    "text-left",
                  ].join(" ")}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <UserBubble key={i} text={msg.text} />
          ) : (
            <AssistantBubble
              key={i}
              text={msg.text}
              timestamp={msg.timestamp}
              model={msg.model}
            />
          )
        )}
        {loading && (
          <div className="flex justify-start mb-3">
            <div
              className={[
                "max-w-[80%] px-4 py-2.5",
                "rounded-2xl rounded-tl-sm",
                "bg-surface-card border border-border",
              ].join(" ")}
            >
              {steps.length > 0 ? (
                <div className="space-y-1">
                  {steps.map((s, i) => (
                    <div
                      key={i}
                      className={[
                        "text-xs font-mono",
                        i === steps.length - 1
                          ? "text-cta"
                          : "text-stone-400",
                      ].join(" ")}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              ) : (
                <span
                  className={
                    "text-sm text-stone-500 italic"
                  }
                >
                  {t("thinking")}
                </span>
              )}
            </div>
          </div>
        )}
        {error && (
          <p className="text-xs text-red-400 text-center py-2">
            {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 px-5 pb-4 border-t border-border-subtle pt-3"
      >
        {/* Slash command popup */}
        {input.startsWith("/") && !input.includes(" ") && (
          <div className="mb-2 rounded-lg bg-surface-overlay border border-border p-1">
            {Object.entries(SLASH_COMMANDS)
              .filter(([cmd]) =>
                cmd.startsWith(input.toLowerCase())
              )
              .map(([cmd, { desc }]) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => {
                    setInput(cmd + " ");
                  }}
                  className="w-full text-left px-2 py-1 rounded text-xs hover:bg-surface-raised transition-colors flex items-center gap-2"
                >
                  <span className="font-mono text-cta">
                    {cmd}
                  </span>
                  <span className="text-stone-500">
                    {desc}
                  </span>
                </button>
              ))}
          </div>
        )}
        <div className="flex gap-3 items-end">
        <textarea
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("askAnything")}
          className={[
            "flex-1 px-3 py-2 rounded-xl resize-none",
            "bg-surface-raised border border-border text-sm text-stone-900",
            "placeholder-stone-500 focus:outline-none focus:border-border-strong",
          ].join(" ")}
        />
        {loading ? (
          <button
            type="button"
            onClick={stopRequest}
            className={[
              "flex items-center gap-1.5 px-4 py-2",
              "rounded-xl bg-red-500 text-white",
              "text-sm hover:bg-red-600",
              "transition-colors shrink-0",
            ].join(" ")}
          >
            <Square size={12} />
            {tc("stop")}
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className={[
              "flex items-center gap-1.5 px-4 py-2",
              "rounded-xl bg-cta text-white text-sm",
              "hover:bg-cta-hover transition-colors",
              "disabled:opacity-50 shrink-0",
            ].join(" ")}
          >
            <Send size={14} />
            {tc("send")}
          </button>
        )}
        </div>
      </form>
    </div>
  );
}
