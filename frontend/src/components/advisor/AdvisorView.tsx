import {
  useCallback, useEffect, useRef, useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Square, Trash2 } from "lucide-react";
import { askAdvisor } from "../../api/client";
import {
  useAiSettings,
  useAvailableModels,
  useUpdateAiSettings,
} from "../../hooks/useSettings";
import { Markdown } from "../common/Markdown";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";

const QUESTION_TEMPLATES = [
  "What should I focus on today?",
  "Which customers are close to budget limit?",
  "Summarize my week",
  "Any overdue tasks or follow-ups?",
  "Book 1h for ...",
  "Create a task for ...",
  "How many hours did I log this month?",
  "Show open issues across all customers",
];

export interface AdvisorMessage {
  role: "user" | "assistant";
  text: string;
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

function AssistantBubble({
  text,
  thinking,
}: {
  text: string;
  thinking?: boolean;
}) {
  return (
    <div className="flex justify-start mb-3">
      <div
        className={[
          "max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tl-sm",
          "bg-surface-card border border-border",
          thinking ? "text-sm text-stone-500 italic" : "",
        ].join(" ")}
      >
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
  const qc = useQueryClient();
  const { data: aiSettings } = useAiSettings();
  const { data: models = [] } = useAvailableModels();
  const updateAi = useUpdateAiSettings();

  const [model, setModel] = useState("");
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

  // Set model default once AI settings load
  useEffect(() => {
    if (aiSettings?.advisor_model && !model) {
      setModel(aiSettings.advisor_model);
    }
  }, [aiSettings, model]);

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
      desc: "Clear the chat",
      action: () => clearMessages(),
    },
    "/model": {
      desc: "Switch model (e.g. /model ollama:qwen3:14b)",
      action: (arg) => {
        if (arg) setModel(arg);
        else setError("Usage: /model provider:name");
      },
    },
    "/help": {
      desc: "Show available commands",
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
          setSteps((p) => [...p, `Calling ${name}...`]);
        } else if (type === "tool_result") {
          const name = data.name as string;
          const result = data.result as Record<
            string, unknown
          >;
          const hasError = "error" in result;
          setSteps((p) => [
            ...p,
            hasError
              ? `${name} failed`
              : `${name} done`,
          ]);
        } else if (type === "thinking") {
          setSteps((p) => [...p, "Thinking..."]);
        }
      },
    })
      .then((result) => {
        onMessagesChange((prev) => [
          ...prev,
          { role: "assistant", text: result.answer },
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
            { role: "assistant", text: "*Stopped.*" },
          ]);
          return;
        }
        const msg = err instanceof Error
          ? err.message : "Request failed.";
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
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-stone-700">
          Advisor
        </h1>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            title="Clear chat (/reset)"
            className="p-1 rounded text-stone-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
        <datalist id="advisor-model-list">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <div className="ml-auto flex flex-col items-end gap-0.5">
          <input
            type="text"
            list="advisor-model-list"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => {
              if (model && model !== aiSettings?.advisor_model) {
                updateAi.mutate({ advisor_model: model });
              }
            }}
            placeholder="provider:model"
            className={[
              "w-64 px-2 py-1 rounded-lg text-xs font-mono",
              "bg-surface-raised border border-border text-stone-800",
              "placeholder-stone-500 focus:outline-none",
            ].join(" ")}
          />
          <span className="text-[9px] text-stone-400 font-mono">
            ollama: | claude_cli: | claude: | openrouter: | openai:
          </span>
        </div>
        <HelpButton title="Advisor" doc={DOCS.advisor} view="advisor" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 && !loading && (
          <div className="mt-8 space-y-3">
            <p className="text-sm text-stone-500 text-center">
              Ask a question or pick a template:
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUESTION_TEMPLATES.map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className={[
                    "px-3 py-1.5 rounded-lg text-xs",
                    "bg-surface-raised border border-border",
                    "text-stone-700 hover:text-cta",
                    "hover:border-cta/40 transition-colors",
                    "text-left",
                  ].join(" ")}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <UserBubble key={i} text={msg.text} />
          ) : (
            <AssistantBubble key={i} text={msg.text} />
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
                  Thinking...
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
        className="shrink-0 px-6 pb-4 border-t border-border-subtle pt-3"
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
          placeholder="Ask anything… (/ for commands)"
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
            Stop
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
            Send
          </button>
        )}
        </div>
      </form>
    </div>
  );
}
