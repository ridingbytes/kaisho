import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import {
  addNote,
  captureInboxItem,
  createTask,
} from "../api/client";

type CaptureMode = "note" | "task" | "inbox";

export function CaptureSection() {
  const { t } = useTranslation("clocks");
  const [mode, setMode] =
    useState<CaptureMode>("inbox");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = text.trim();
    if (!val) return;

    try {
      if (mode === "note") {
        await addNote({ title: val });
      } else if (mode === "task") {
        await createTask({
          customer: "",
          title: val,
          status: "TODO",
        });
      } else {
        await captureInboxItem({ text: val });
      }
      setText("");
      setMsg(t("captured"));
      setTimeout(() => {
        setMsg("");
        inputRef.current?.focus();
      }, 2000);
    } catch {
      setMsg(t("captureFailed"));
      setTimeout(() => setMsg(""), 3000);
    }
  }

  const modes: { key: CaptureMode; label: string }[] =
    [
      { key: "inbox", label: t("inbox") },
      { key: "note", label: t("note") },
      { key: "task", label: t("task") },
    ];

  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 py-3"
    >
      <p className="text-2xs font-semibold uppercase tracking-wider text-fg-muted mb-2">
        {t("quickCapture")}
      </p>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-2">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={[
              "px-2 py-0.5 rounded text-2xs",
              "font-medium transition-colors",
              mode === m.key
                ? "bg-cta text-white"
                : "text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("captureText")}
          className={[
            "flex-1 px-2.5 py-1.5 rounded-lg text-xs",
            "bg-surface-raised border border-border",
            "text-fg-strong placeholder-fg-muted",
            "focus:outline-none focus:border-cta",
            "transition-colors",
          ].join(" ")}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="px-2 py-1.5 rounded-lg bg-cta text-white hover:bg-cta-hover transition-colors disabled:opacity-40"
        >
          <Plus size={14} />
        </button>
      </div>

      {msg && (
        <p className="text-2xs text-green-500 mt-1">
          {msg}
        </p>
      )}
    </form>
  );
}
