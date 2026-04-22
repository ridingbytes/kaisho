import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import { useContracts } from "../../hooks/useContracts";
import { useQuickBook } from "../../hooks/useClocks";

interface QuickBookFormProps {
  defaultDate?: string;
  onDone?: () => void;
}

export function QuickBookForm({
  defaultDate,
  onDone,
}: QuickBookFormProps = {}) {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const [duration, setDuration] = useState("");
  const [customer, setCustomer] = useState("");
  const [contract, setContract] = useState("");
  const [description, setDescription] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [notes, setNotes] = useState("");
  const { data: allContracts = [] } = useContracts(
    customer || null,
  );
  const contracts = allContracts.filter(
    (c) => !c.invoiced,
  );
  const book = useQuickBook();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!duration.trim()) return;
    book.mutate(
      {
        duration: duration.trim(),
        customer: customer.trim(),
        description: description.trim(),
        contract: contract || undefined,
        taskId: taskId ?? undefined,
        date: defaultDate || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setDuration("");
          setCustomer("");
          setContract("");
          setDescription("");
          setTaskId(null);
          setTaskTitle("");
          setNotes("");
          onDone?.();
        },
      }
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone?.();
      }}
      className="flex flex-col gap-2"
    >
      <CustomerAutocomplete
        value={customer}
        onChange={(v) => {
          setCustomer(v);
          setContract("");
        }}
        inputClassName={inputCls}
      />
      {contracts.length > 0 && (
        <select
          value={contract}
          onChange={(e) => setContract(e.target.value)}
          className={inputCls}
        >
          <option value="">{tc("noContract")}</option>
          {contracts.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}{c.end_date ? " (closed)" : ""}
            </option>
          ))}
        </select>
      )}
      <input
        type="text"
        placeholder={tc("descriptionOptional")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={inputCls}
      />
      <input
        type="text"
        placeholder={t("durationShort")}
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        className={inputCls}
      />
      <TaskAutocomplete
        taskId={taskId}
        value={taskTitle}
        onChange={setTaskTitle}
        onSelect={(id, label) => {
          setTaskId(id);
          setTaskTitle(label);
        }}
        onClear={() => {
          setTaskId(null);
          setTaskTitle("");
        }}
        customer={customer}
        inputClassName={inputCls}
      />
      <textarea
        placeholder={tc("notesOptional")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className={inputCls + " resize-y"}
      />
      <button
        type="submit"
        disabled={
          book.isPending ||
          !duration.trim()
        }
        className={[
          "w-full py-2 rounded-lg text-xs font-semibold",
          "bg-surface-overlay border border-border",
          "text-stone-800 hover:border-cta hover:text-cta",
          "transition-colors disabled:opacity-40",
          "disabled:cursor-not-allowed",
        ].join(" ")}
      >
        {book.isPending ? t("booking") : t("book")}
      </button>
      {book.isError && (
        <p className="text-xs text-red-400">
          {(book.error as Error).message}
        </p>
      )}
    </form>
  );
}

const inputCls = [
  "w-full px-3 py-2 rounded-lg text-sm",
  "bg-surface-raised border border-border",
  "text-stone-900 placeholder-stone-500",
  "focus:outline-none focus:border-cta",
  "transition-colors",
].join(" ");
