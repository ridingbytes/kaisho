import { useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { askAdvisor } from "../../api/client";
import { useAiSettings, useAvailableModels } from "../../hooks/useSettings";
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
      <div className="max-w-[70%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-accent text-white text-sm">
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
          thinking ? "text-sm text-slate-600 italic" : "",
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

export function AdvisorView({ messages, onMessagesChange }: AdvisorViewProps) {
  const { data: aiSettings } = useAiSettings();
  const { data: models = [] } = useAvailableModels();

  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  function sendMessage() {
    const question = input.trim();
    if (!question || loading) return;

    if (question === "/reset") {
      setInput("");
      clearMessages();
      return;
    }

    setInput("");
    setError(null);
    onMessagesChange((prev) => [...prev, { role: "user", text: question }]);
    setLoading(true);

    askAdvisor(question, model)
      .then((result) => {
        onMessagesChange((prev) => [
          ...prev,
          { role: "assistant", text: result.answer },
        ]);
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : "Request failed.";
        setError(msg);
      })
      .finally(() => setLoading(false));
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
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Advisor
        </h1>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            title="Clear chat (/reset)"
            className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
        <datalist id="advisor-model-list">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <input
          type="text"
          list="advisor-model-list"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="model string…"
          className={[
            "ml-auto w-64 px-2 py-1 rounded-lg text-xs font-mono",
            "bg-surface-raised border border-border text-slate-300",
            "placeholder-slate-600 focus:outline-none",
          ].join(" ")}
        />
        <HelpButton title="Advisor" doc={DOCS.advisor} view="advisor" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 && !loading && (
          <div className="mt-8 space-y-3">
            <p className="text-sm text-slate-600 text-center">
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
                    "text-slate-400 hover:text-accent",
                    "hover:border-accent/40 transition-colors",
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
        {loading && <AssistantBubble text="Thinking…" thinking />}
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
        className="shrink-0 px-6 pb-4 flex gap-3 items-end border-t border-border-subtle pt-3"
      >
        <textarea
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
          className={[
            "flex-1 px-3 py-2 rounded-xl resize-none",
            "bg-surface-raised border border-border text-sm text-slate-200",
            "placeholder-slate-600 focus:outline-none focus:border-border-strong",
          ].join(" ")}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className={[
            "flex items-center gap-1.5 px-4 py-2 rounded-xl",
            "bg-accent text-white text-sm hover:bg-accent-hover",
            "transition-colors disabled:opacity-50 shrink-0",
          ].join(" ")}
        >
          <Send size={14} />
          Send
        </button>
      </form>
    </div>
  );
}
