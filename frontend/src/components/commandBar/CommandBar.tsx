/**
 * In-app command bar for kai CLI commands.
 *
 * Toggle with ``Cmd+K`` (or ``Ctrl+K``). Accepts
 * natural CLI-style commands and dispatches them to
 * the backend API.
 */
import {
  useCallback, useEffect, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import { Terminal, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  captureInboxItem,
  startTimer,
  stopTimer,
  quickBook,
  createTask,
  addNote,
  askAdvisor,
  fetchActiveTimer,
  fetchAiSettings,
  fetchCustomers,
} from "../../api/client";

// -----------------------------------------------------------
// Command definitions
// -----------------------------------------------------------

interface ParsedCommand {
  execute: () => Promise<string>;
}

const HELP_TEXT = [
  "All kai CLI commands are supported.",
  "",
  "Common commands:",
  "  clock start <customer> [description]",
  "  clock stop [--desc X] [--notes X] [--customer X]",
  "  clock desc <description>",
  "  clock note <text>",
  "  clock book <duration> <customer> [desc]",
  "  clock status",
  "  clock list [--week|--month|--customer X]",
  "  clock summary [--week]",
  "  task add <customer> <title>",
  "  task list",
  "  inbox <text>",
  "  note <title>",
  "  customer list",
  "  customer add <name>",
  "  customer show <name>",
  "  customer summary",
  "  inbox list",
  "  notes list",
  "  contract list <customer>",
  "  task done <id>",
  "  briefing",
  "  kb search <query>",
  "  cron list",
  "  ask <question>",
  "  clear",
  "  help",
].join("\n");

/** Split input respecting quoted strings. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}

function parseCommand(
  input: string,
): ParsedCommand | string {
  const tokens = tokenize(input.trim());
  if (tokens.length === 0) return "Type a command";

  const cmd = tokens[0].toLowerCase();
  const sub = (tokens[1] || "").toLowerCase();

  if (cmd === "help") {
    return HELP_TEXT;
  }

  if (cmd === "clear") {
    return "__CLEAR__";
  }

  if (cmd === "clock") {
    if (sub === "start") {
      const customer = tokens[2] || "";
      const desc = tokens.slice(3).join(" ");
      return {
        execute: async () => {
          await startTimer({
            customer, description: desc,
          });
          return customer
            ? `Timer started: ${customer}`
            : "Timer started";
        },
      };
    }
    if (sub === "stop" && tokens.length <= 2) {
      // Plain "clock stop" — use client-side API.
      // "clock stop --notes ..." falls through to
      // the backend CLI which handles flags.
      return {
        execute: async () => {
          const entry = await stopTimer();
          const mins = entry.duration_minutes ?? 0;
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          return (
            `Timer stopped: ${entry.customer}`
            + ` (${h}h${String(m).padStart(2, "0")}m)`
          );
        },
      };
    }
    if (sub === "book") {
      const duration = tokens[2];
      if (!duration) {
        return (
          "Usage: clock book <duration> "
          + "[customer] [desc]"
        );
      }
      const customer = tokens[3] || "";
      const desc = tokens.slice(4).join(" ");
      return {
        execute: async () => {
          await quickBook({
            duration, customer, description: desc,
          });
          return customer
            ? `Booked ${duration} for ${customer}`
            : `Booked ${duration}`;
        },
      };
    }
    if (sub === "status") {
      return {
        execute: async () => {
          const t = await fetchActiveTimer();
          if (!t.active || !t.start) {
            return "No active timer.";
          }
          const ms = Date.now()
            - new Date(t.start).getTime();
          const s = Math.floor(ms / 1000);
          const h = Math.floor(s / 3600);
          const m = Math.floor((s % 3600) / 60);
          return (
            `${t.customer}: ${h}h`
            + `${String(m).padStart(2, "0")}m`
            + (t.description
              ? ` — ${t.description}` : "")
          );
        },
      };
    }
    // Other clock subcommands → API fallback
  }

  if (cmd === "task" && sub === "add") {
      const customer = tokens[2];
      const title = tokens.slice(3).join(" ");
      if (!customer || !title) {
        return (
          "Usage: task add <customer> <title>"
        );
      }
      return {
        execute: async () => {
          await createTask({
            customer,
            title,
            status: "TODO",
          });
          return `Task added: ${title}`;
        },
      };
    // Other task subcommands → API fallback
  }

  if (cmd === "inbox") {
    const text = tokens.slice(1).join(" ");
    if (!text) return "Usage: inbox <text>";
    return {
      execute: async () => {
        await captureInboxItem({ text });
        return `Inbox: ${text}`;
      },
    };
  }

  if (cmd === "note") {
    const title = tokens.slice(1).join(" ");
    if (!title) return "Usage: note <title>";
    return {
      execute: async () => {
        await addNote({ title });
        return `Note: ${title}`;
      },
    };
  }

  if (cmd === "ask") {
    const question = tokens.slice(1).join(" ");
    if (!question) {
      return "Usage: ask <question>";
    }
    return "__ASK__";
  }

  // Fallback: send to the backend CLI endpoint
  return {
    execute: async () => {
      const res = await fetch("/api/cli/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: input.trim(),
        }),
      });
      if (!res.ok) {
        throw new Error(
          `Command failed: ${res.status}`,
        );
      }
      const data = await res.json() as {
        output: string;
        exit_code: number;
        error: string | null;
      };
      if (data.error) {
        throw new Error(data.error);
      }
      return data.output || "(no output)";
    },
  };
}

// -----------------------------------------------------------
// History entry
// -----------------------------------------------------------

interface HistoryEntry {
  input: string;
  output: string;
  error?: boolean;
  ts: string;
}

function now(): string {
  return new Date().toLocaleTimeString(
    [], { hour: "2-digit", minute: "2-digit" },
  );
}

// -----------------------------------------------------------
// Autocomplete
// -----------------------------------------------------------

const CMD_NAMES = [
  "clock start", "clock stop", "clock book",
  "clock desc", "clock note",
  "clock status", "clock list", "clock summary",
  "task add", "task list", "task done",
  "customer list", "customer add",
  "customer show", "customer summary",
  "inbox", "inbox list",
  "note", "notes list",
  "contract list",
  "tag list",
  "cron list",
  "briefing",
  "kb search",
  "ask", "clear", "help",
];

function getCompletions(
  input: string,
  customerNames: string[],
): string[] {
  const lower = input.toLowerCase();
  if (!lower) return [];

  // Complete command names
  const cmdMatches = CMD_NAMES.filter(
    (c) => c.startsWith(lower) && c !== lower,
  );
  if (cmdMatches.length > 0) {
    return cmdMatches.slice(0, 5);
  }

  // After "clock start " or "clock book <dur> ",
  // complete customer names
  const tokens = tokenize(input);
  const cmd = tokens[0]?.toLowerCase();
  const sub = tokens[1]?.toLowerCase();

  let needsCustomer = false;
  if (cmd === "clock" && sub === "start") {
    needsCustomer = tokens.length === 2
      || (tokens.length === 3
        && !input.endsWith(" "));
  }
  if (cmd === "clock" && sub === "book") {
    needsCustomer = tokens.length === 3
      || (tokens.length === 4
        && !input.endsWith(" "));
  }
  if (cmd === "task" && sub === "add") {
    needsCustomer = tokens.length === 2
      || (tokens.length === 3
        && !input.endsWith(" "));
  }

  if (needsCustomer) {
    const partial = (
      tokens[tokens.length - 1] || ""
    ).toLowerCase();
    return customerNames
      .filter(
        (c) => c.toLowerCase().startsWith(partial),
      )
      .slice(0, 5);
  }

  return [];
}

// -----------------------------------------------------------
// Component
// -----------------------------------------------------------

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandBar({ open, onClose }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<
    HistoryEntry[]
  >([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [customerNames, setCustomerNames] = useState<
    string[]
  >([]);
  const [completions, setCompletions] = useState<
    string[]
  >([]);
  const [compIdx, setCompIdx] = useState(0);

  // Fetch customer names for autocomplete
  useEffect(() => {
    if (!open) return;
    fetchCustomers().then((custs) => {
      setCustomerNames(
        custs.map((c) => c.name),
      );
    }).catch((e) => {
      console.warn("customer fetch:", e);
    });
  }, [open]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [history]);

  // Update completions as user types
  useEffect(() => {
    setCompletions(
      getCompletions(input, customerNames),
    );
    setCompIdx(0);
  }, [input, customerNames]);

  const dispatchCommand = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      const result = parseCommand(trimmed);

      if (result === "__CLEAR__") {
        setHistory([]);
        return;
      }

      if (result === "__ASK__") {
        const question = trimmed
          .replace(/^ask\s+/i, "");
        // Build conversation history from
        // previous ask Q&A pairs
        const chatHistory = history
          .filter((h) =>
            h.input.toLowerCase()
              .startsWith("ask "),
          )
          .flatMap((h) => [
            {
              role: "user",
              text: h.input.replace(
                /^ask\s+/i, "",
              ),
            },
            { role: "assistant", text: h.output },
          ]);
        setLoading(true);
        try {
          const ai = await fetchAiSettings();
          const model = ai.advisor_model || "";
          if (!model) {
            setHistory((h) => [
              ...h,
              {
                input: trimmed,
                output:
                  "No advisor model configured."
                  + " Set one in Settings > AI.",
                error: true,
                ts: now(),
              },
            ]);
            return;
          }
          const { answer } = await askAdvisor({
            question,
            model,
            history: chatHistory,
          });
          setHistory((h) => [
            ...h,
            {
              input: trimmed,
              output: answer,
              ts: now(),
            },
          ]);
        } catch (err) {
          const msg = err instanceof Error
            ? err.message
            : String(err);
          setHistory((h) => [
            ...h,
            {
              input: trimmed,
              output: msg,
              error: true,
              ts: now(),
            },
          ]);
        } finally {
          setLoading(false);
        }
        return;
      }

      if (typeof result === "string") {
        setHistory((h) => [
          ...h,
          {
            input: trimmed,
            output: result,
            ts: now(),
          },
        ]);
        return;
      }

      setLoading(true);
      try {
        const output = await result.execute();
        setHistory((h) => [
          ...h,
          {
            input: trimmed,
            output,
            ts: now(),
          },
        ]);
        for (const key of [
          "clocks", "tasks", "inbox",
          "notes", "customers", "dashboard",
        ]) {
          void qc.invalidateQueries({
            queryKey: [key],
          });
        }
      } catch (err) {
        const msg = err instanceof Error
          ? err.message
          : String(err);
        setHistory((h) => [
          ...h,
          {
            input: trimmed,
            output: msg,
            error: true,
            ts: now(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [qc],
  );

  function applyCompletion(value: string) {
    const tokens = tokenize(input);
    if (CMD_NAMES.some((c) => c === value)) {
      setInput(value + " ");
    } else {
      const hasSpace = value.includes(" ");
      const quoted = hasSpace
        ? `"${value}"`
        : value;
      tokens[tokens.length - 1] = quoted;
      setInput(tokens.join(" ") + " ");
    }
    setCompletions([]);
    inputRef.current?.focus();
  }

  function handleKeyDown(
    e: React.KeyboardEvent,
  ) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "Tab" && completions.length > 0) {
      e.preventDefault();
      applyCompletion(completions[compIdx]);
      return;
    }
    if (
      e.key === "ArrowDown"
      && completions.length > 0
    ) {
      e.preventDefault();
      setCompIdx(
        (i) => (i + 1) % completions.length,
      );
      return;
    }
    if (
      e.key === "ArrowUp"
      && completions.length > 0
    ) {
      e.preventDefault();
      setCompIdx(
        (i) =>
          (i - 1 + completions.length)
          % completions.length,
      );
      return;
    }
    if (
      e.key === "ArrowUp"
      && completions.length === 0
    ) {
      e.preventDefault();
      const inputs = history
        .map((h) => h.input)
        .reverse();
      if (inputs.length === 0) return;
      const next = Math.min(
        histIdx + 1, inputs.length - 1,
      );
      setHistIdx(next);
      setInput(inputs[next]);
      return;
    }
    if (e.key === "Enter") {
      if (completions.length > 0) {
        e.preventDefault();
        applyCompletion(completions[compIdx]);
        return;
      }
      e.preventDefault();
      dispatchCommand(input);
      setInput("");
      setHistIdx(-1);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-end justify-center pb-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "50vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* History */}
        {(history.length > 0 || loading) && (
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-1 font-mono text-xs">
            {history.map((h, i) => (
              <div key={i} className="mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-cta">
                    $
                  </span>
                  <span className="text-stone-700">
                    {h.input}
                  </span>
                  <span className="text-[9px] text-stone-400 ml-auto">
                    {h.ts}
                  </span>
                </div>
                <pre
                  className={[
                    "whitespace-pre-wrap pl-4",
                    "leading-relaxed",
                    h.error
                      ? "text-red-400"
                      : "text-stone-500",
                  ].join(" ")}
                >
                  {h.output}
                </pre>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 pl-4 py-1 text-stone-400">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-cta animate-pulse" />
                <span className="text-[10px] italic">
                  Thinking...
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Input */}
        <div className="relative">
          {/* Completions dropdown */}
          {completions.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mx-4 mb-1 bg-surface-raised border border-border rounded-lg shadow-lg overflow-hidden">
              {completions.map((c, i) => (
                <button
                  key={c}
                  onClick={() => applyCompletion(c)}
                  className={[
                    "w-full text-left px-3 py-1.5",
                    "text-xs font-mono",
                    i === compIdx
                      ? "bg-cta/10 text-cta"
                      : "text-stone-600",
                    "hover:bg-cta/10",
                  ].join(" ")}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 px-4 py-3 border-t border-border-subtle">
            <Terminal
              size={14}
              className="text-cta shrink-0"
            />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) =>
                setInput(e.target.value)
              }
              onKeyDown={handleKeyDown}
              placeholder={'Type a command... (try "help")'}
              className="flex-1 bg-transparent text-sm font-mono text-stone-900 placeholder-stone-400 focus:outline-none"
              autoFocus
            />
            <span className="text-[9px] text-stone-400 whitespace-nowrap shrink-0">
              Tab &#x21e5; &nbsp; ESC &#x2715;
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded text-stone-400 hover:text-stone-700 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
