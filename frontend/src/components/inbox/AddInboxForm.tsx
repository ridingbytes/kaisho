import { useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { useCaptureItem } from "../../hooks/useInbox";
import { useSettings } from "../../hooks/useSettings";

const DIRECTIONS = [
  { value: "", label: "Any direction" },
  { value: "in", label: "In" },
  { value: "out", label: "Out" },
] as const;


export function AddInboxForm({
  onClose,
}: {
  onClose?: () => void;
}) {
  const { data: settings } = useSettings();
  const types: string[] =
    settings?.inbox_types ?? [
      "NOTE", "EMAIL", "LEAD", "IDEA",
    ];
  const channels: string[] =
    settings?.inbox_channels ?? [
      "email", "phone", "chat",
    ];
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
          onClose?.();
        },
      }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose?.();
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
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
            "bg-cta text-white hover:bg-cta-hover",
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
          {types.map((t: string) => (
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
          <option value="">Any channel</option>
          {channels.map((c: string) => (
            <option key={c} value={c}>
              {c}
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
  "text-stone-900 placeholder-stone-500",
  "focus:outline-none focus:border-cta",
  "transition-colors",
].join(" ");
