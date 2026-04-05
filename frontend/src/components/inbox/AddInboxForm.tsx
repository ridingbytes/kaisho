import { useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { useCaptureItem } from "../../hooks/useInbox";

const TYPES = ["NOTIZ", "EMAIL", "LEAD", "IDEE"] as const;

const CHANNELS = [
  { value: "", label: "Any channel" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "chat", label: "Chat" },
  { value: "other", label: "Other" },
] as const;

const DIRECTIONS = [
  { value: "", label: "Any direction" },
  { value: "in", label: "In" },
  { value: "out", label: "Out" },
] as const;

export function AddInboxForm() {
  const [text, setText] = useState("");
  const [type, setType] = useState<string>("");
  const [customer, setCustomer] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState("");
  const [direction, setDirection] = useState("");
  const capture = useCaptureItem();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    capture.mutate(
      {
        text: text.trim(),
        type: type || undefined,
        customer: customer.trim() || undefined,
        body: body.trim() || undefined,
        channel: channel || undefined,
        direction: direction || undefined,
      },
      {
        onSuccess: () => {
          setText("");
          setType("");
          setCustomer("");
          setBody("");
          setChannel("");
          setDirection("");
        },
      }
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 p-4 border-b border-border-subtle bg-surface-card/40"
    >
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Capture something…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={[inputCls, "flex-1"].join(" ")}
          autoFocus
        />
        <button
          type="submit"
          disabled={capture.isPending || !text.trim()}
          className={[
            "px-4 py-2 rounded-lg text-xs font-semibold shrink-0",
            "bg-accent text-white hover:bg-accent-hover",
            "transition-colors disabled:opacity-40",
            "disabled:cursor-not-allowed",
          ].join(" ")}
        >
          {capture.isPending ? "…" : "Add"}
        </button>
      </div>
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={[inputCls, "w-32 shrink-0"].join(" ")}
        >
          <option value="">Auto type</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <CustomerAutocomplete
          value={customer}
          onChange={setCustomer}
          placeholder="Customer (optional)"
          className="flex-1 min-w-0"
          inputClassName={inputCls}
        />
      </div>
      <div className="flex gap-2">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className={[inputCls, "flex-1"].join(" ")}
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          className={[inputCls, "flex-1"].join(" ")}
        >
          {DIRECTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        placeholder="Body (optional)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        className={[inputCls, "resize-none"].join(" ")}
      />
    </form>
  );
}

const inputCls = [
  "px-3 py-2 rounded-lg text-sm",
  "bg-surface-raised border border-border",
  "text-slate-200 placeholder-slate-600",
  "focus:outline-none focus:border-accent",
  "transition-colors",
].join(" ");
