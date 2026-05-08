/**
 * @module SummaryPopover
 *
 * Floating chat panel pinned over the file viewer. Asks
 * the configured AI advisor model for a summary, then
 * lets the user keep asking follow-up questions about
 * the same document. Each AI message can be one-click
 * captured into the inbox via a per-bubble icon -- the
 * inbox headline auto-derives from the file name; the
 * user can edit it later in the inbox view.
 */
import {
  Inbox,
  Loader2,
  MessagesSquare,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  captureInboxItem,
  chatAboutKnowledgeFile,
  clearKnowledgeSummary,
  summarizeKnowledgeFile,
  type KnowledgeChatTurn,
} from "../../api/client";
import { Markdown } from "../common/Markdown";
import { useToast } from "../../context/ToastContext";
import { useAutosizeTextarea } from "../../hooks/useAutosizeTextarea";


interface SummaryPopoverProps {
  path: string;
  open: boolean;
  onClose: () => void;
}


type BubbleRole = "user" | "assistant";

interface ChatBubble {
  role: BubbleRole;
  content: string;
  /** True when the bubble is the AI-generated summary
   *  (not a Q/A turn). Used to label the model name. */
  isSummary?: boolean;
}


export function SummaryPopover({
  path, open, onClose,
}: SummaryPopoverProps) {
  const { t } = useTranslation("knowledge");
  const { t: tc } = useTranslation("common");
  const toast = useToast();
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [model, setModel] = useState<string>("");
  const [isStale, setIsStale] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [question, setQuestion] = useState("");
  useAutosizeTextarea(inputRef, question);

  const summarize = useMutation({
    mutationFn: (params: {
      path: string; force?: boolean;
    }) => summarizeKnowledgeFile(
      params.path, { force: params.force },
    ),
  });
  const clearSummary = useMutation({
    mutationFn: () => clearKnowledgeSummary(path),
  });
  const askChat = useMutation({
    mutationFn: chatAboutKnowledgeFile,
  });
  const captureBubble = useMutation({
    mutationFn: (params: {
      text: string; body: string;
    }) => captureInboxItem({
      text: params.text,
      body: params.body,
      type: "note",
    }),
  });

  // Reset everything when the popover opens or the user
  // switches to a different file.
  useEffect(() => {
    if (!open) return;
    setBubbles([]);
    setQuestion("");
    setModel("");
    setIsStale(false);
    setIsCached(false);
    summarize.reset();
    askChat.reset();
    summarize.mutate(
      { path },
      {
        onSuccess: (data) => {
          if (data.path !== path) return;  // race-guard
          setBubbles([{
            role: "assistant",
            content: data.summary,
            isSummary: true,
          }]);
          setModel(data.model);
          setIsCached(data.cached);
          setIsStale(data.stale);
        },
        onError: (err) => toast(String(err), "error"),
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, path]);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointer(e: MouseEvent) {
      if (
        panelRef.current
        && !panelRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener(
        "mousedown", onPointer,
      );
    };
  }, [open, onClose]);

  // Auto-scroll to the latest bubble whenever the
  // conversation grows.
  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [bubbles, askChat.isPending]);

  function handleAskQuestion() {
    const trimmed = question.trim();
    if (!trimmed || askChat.isPending) return;
    const history: KnowledgeChatTurn[] = bubbles
      .filter((b) => !b.isSummary)
      .map((b) => ({ role: b.role, content: b.content }));
    setBubbles((prev) => [
      ...prev,
      { role: "user", content: trimmed },
    ]);
    setQuestion("");
    askChat.mutate(
      {
        path,
        question: trimmed,
        history,
      },
      {
        onSuccess: (data) => {
          if (data.path !== path) return;
          setBubbles((prev) => [
            ...prev,
            {
              role: "assistant",
              content: data.answer,
            },
          ]);
        },
        onError: (err) => toast(String(err), "error"),
      },
    );
  }

  function handleHandoverToAdvisor() {
    if (!hasBubbles) return;
    const seed: {
      role: "user" | "assistant";
      text: string;
    }[] = [];
    seed.push({
      role: "user",
      text: t("handoverIntro", { path }),
    });
    for (const b of bubbles) {
      seed.push({ role: b.role, text: b.content });
    }
    window.dispatchEvent(new CustomEvent(
      "advisor-handover",
      { detail: { messages: seed } },
    ));
    onClose();
  }

  function handleCaptureBubble(bubble: ChatBubble) {
    const filename = path.split("/").pop() ?? path;
    const stem = filename.replace(/\.[^.]+$/, "");
    const headline = bubble.isSummary
      ? t("summaryInboxHeadline", { name: stem })
      : t("chatInboxHeadline", {
        name: stem,
        snippet: bubble.content
          .split("\n")[0]
          .slice(0, 80),
      });
    captureBubble.mutate(
      { text: headline, body: bubble.content },
      {
        onSuccess: () =>
          toast(t("summaryMoved"), "success"),
        onError: (err) =>
          toast(String(err), "error"),
      },
    );
  }

  const summarizing = summarize.isPending;
  const hasBubbles = bubbles.length > 0;

  const headerSubtitle = useMemo(() => {
    if (summarizing) return t("summaryLoading");
    if (!model) return "";
    return model;
  }, [summarizing, model, t]);

  if (!open) return null;

  return (
    <div
      className={
        "fixed inset-0 z-50 flex items-start " +
        "justify-center pt-16 px-4 pointer-events-none"
      }
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("summaryTitle")}
        className={
          "pointer-events-auto w-full max-w-2xl " +
          "rounded-lg border border-border " +
          "bg-surface-overlay shadow-xl flex flex-col " +
          "max-h-[80vh]"
        }
      >
        {/* Header */}
        <div
          className={
            "flex items-center gap-2 px-4 py-2.5 " +
            "border-b border-border-subtle shrink-0"
          }
        >
          <Sparkles
            size={14}
            className="text-cta shrink-0"
          />
          <h3
            className={
              "flex-1 text-xs font-semibold " +
              "text-stone-800 truncate"
            }
            title={path}
          >
            {t("summaryTitle")}
          </h3>
          {isStale && (
            <span
              className={
                "px-1.5 py-0.5 rounded text-[9px] " +
                "font-semibold bg-amber-500/10 " +
                "text-amber-600 uppercase " +
                "tracking-wider"
              }
              title={t("summaryStaleHint")}
            >
              {t("summaryStale")}
            </span>
          )}
          {isCached && (
            <span
              className={"text-[10px] text-stone-400"}
              title={t("summaryCached")}
            >
              {t("summaryCached")}
            </span>
          )}
          {headerSubtitle && (
            <span
              className={
                "text-[10px] text-stone-500 font-mono"
              }
              title={t("summaryModel")}
            >
              {headerSubtitle}
            </span>
          )}
          {hasBubbles && (
            <button
              onClick={handleHandoverToAdvisor}
              aria-label={t("handoverToAdvisor")}
              title={t("handoverToAdvisor")}
              className={
                "p-0.5 rounded text-stone-500 " +
                "hover:text-cta transition-colors"
              }
            >
              <MessagesSquare size={12} />
            </button>
          )}
          {hasBubbles && (
            <button
              onClick={() =>
                summarize.mutate(
                  { path, force: true },
                  {
                    onSuccess: (data) => {
                      if (data.path !== path) return;
                      // Replace the existing summary
                      // bubble (always the first one)
                      // and drop any chat history --
                      // questions about the old
                      // summary may not apply.
                      setBubbles([{
                        role: "assistant",
                        content: data.summary,
                        isSummary: true,
                      }]);
                      setModel(data.model);
                      setIsCached(false);
                      setIsStale(false);
                    },
                    onError: (err) =>
                      toast(String(err), "error"),
                  },
                )
              }
              disabled={summarizing}
              aria-label={t("summaryRegenerate")}
              title={t("summaryRegenerate")}
              className={
                "p-0.5 rounded text-stone-500 " +
                "hover:text-cta transition-colors " +
                "disabled:opacity-40"
              }
            >
              <RefreshCw
                size={12}
                className={
                  summarizing ? "animate-spin" : ""
                }
              />
            </button>
          )}
          {hasBubbles && (
            <button
              onClick={() =>
                clearSummary.mutate(undefined, {
                  onSuccess: () => {
                    toast(
                      t("summaryDeleted"), "success",
                    );
                    onClose();
                  },
                  onError: (err) =>
                    toast(String(err), "error"),
                })
              }
              disabled={clearSummary.isPending}
              aria-label={t("summaryDelete")}
              title={t("summaryDelete")}
              className={
                "p-0.5 rounded text-stone-500 " +
                "hover:text-red-500 transition-colors " +
                "disabled:opacity-40"
              }
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label={tc("close")}
            title={tc("close")}
            className={
              "p-0.5 rounded text-stone-500 " +
              "hover:text-stone-900"
            }
          >
            <X size={14} />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={messagesRef}
          className={
            "flex-1 overflow-y-auto p-4 space-y-3"
          }
        >
          {summarizing && bubbles.length === 0 && (
            <div
              className={
                "flex items-center gap-2 text-xs " +
                "text-stone-500"
              }
            >
              <Loader2
                size={14}
                className="animate-spin"
              />
              {t("summaryLoading")}
            </div>
          )}
          {bubbles.map((bubble, i) => (
            <Bubble
              key={i}
              bubble={bubble}
              onCapture={() =>
                handleCaptureBubble(bubble)
              }
              capturePending={captureBubble.isPending}
              captureLabel={t("summaryMoveToInbox")}
            />
          ))}
          {askChat.isPending && (
            <div className="flex justify-start">
              <div
                className={
                  "rounded-lg bg-surface-raised " +
                  "px-3 py-2 text-xs " +
                  "text-stone-500 inline-flex " +
                  "items-center gap-2"
                }
              >
                <Loader2
                  size={12}
                  className="animate-spin"
                />
                {t("chatThinking")}
              </div>
            </div>
          )}
        </div>

        {/* Chat input -- mirrors AdvisorView styling so
            both chat surfaces feel like the same thing. */}
        <div
          className={
            "flex items-end gap-3 px-4 py-3 " +
            "border-t border-border-subtle shrink-0"
          }
        >
          <textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAskQuestion();
              }
            }}
            placeholder={t("chatPlaceholder")}
            aria-label={t("chatPlaceholder")}
            rows={1}
            disabled={summarizing && !hasBubbles}
            className={
              "flex-1 min-h-[40px] px-3 py-2 rounded-xl " +
              "resize-none bg-surface-raised " +
              "border border-border text-sm " +
              "text-stone-900 placeholder-stone-500 " +
              "focus:outline-none " +
              "focus:border-border-strong " +
              "disabled:opacity-50"
            }
          />
          <button
            onClick={handleAskQuestion}
            disabled={
              !question.trim()
              || askChat.isPending
              || (summarizing && !hasBubbles)
            }
            aria-label={t("chatSend")}
            title={t("chatSend") + " (↵)"}
            className={
              "flex items-center justify-center " +
              "h-10 w-10 shrink-0 rounded-xl " +
              "bg-cta text-white hover:bg-cta-hover " +
              "transition-colors disabled:opacity-50"
            }
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}


function Bubble({
  bubble, onCapture, capturePending, captureLabel,
}: {
  bubble: ChatBubble;
  onCapture: () => void;
  capturePending: boolean;
  captureLabel: string;
}) {
  const isUser = bubble.role === "user";
  return (
    <div
      className={
        "flex " + (isUser ? "justify-end" : "justify-start")
      }
    >
      <div
        className={
          "group relative max-w-[85%] rounded-lg px-3 py-2 "
          + (isUser
            ? "bg-cta text-white"
            : "bg-surface-raised text-stone-800")
        }
      >
        {isUser ? (
          <p className="text-xs whitespace-pre-wrap">
            {bubble.content}
          </p>
        ) : (
          <Markdown className="text-xs">
            {bubble.content}
          </Markdown>
        )}
        {!isUser && (
          <button
            onClick={onCapture}
            disabled={capturePending}
            aria-label={captureLabel}
            title={captureLabel}
            className={
              "absolute -top-2 -right-2 p-1 rounded " +
              "bg-surface-overlay border border-border " +
              "text-stone-500 hover:text-cta " +
              "shadow-sm opacity-0 " +
              "group-hover:opacity-100 " +
              "focus-visible:opacity-100 " +
              "transition-opacity " +
              "disabled:opacity-40"
            }
          >
            <Inbox size={10} />
          </button>
        )}
      </div>
    </div>
  );
}
