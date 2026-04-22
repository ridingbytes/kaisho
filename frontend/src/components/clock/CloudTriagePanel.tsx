import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  fetchPendingCloudEntries,
  triageCloudEntries,
} from "../../api/client";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import { useContracts } from "../../hooks/useContracts";
import type { ClockEntry } from "../../types";
import { smallInputCls } from "../../styles/formStyles";
import { Check } from "lucide-react";

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "...";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function TriageRow({ entry }: { entry: ClockEntry }) {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const [customer, setCustomer] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [contract, setContract] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const { data: contracts = [] } = useContracts(
    customer || null,
  );
  const qc = useQueryClient();

  function handleAssign() {
    // customer is optional
    setSaving(true);
    triageCloudEntries([
      {
        start: entry.start,
        customer: customer.trim(),
        task_id: taskId,
        contract: contract || null,
      },
    ])
      .then(() => {
        setDone(true);
        void qc.invalidateQueries({
          queryKey: ["cloud-triage"],
        });
        void qc.invalidateQueries({
          queryKey: ["clocks"],
        });
      })
      .finally(() => setSaving(false));
  }

  if (done) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-border-subtle">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-stone-400 tabular-nums">
          {formatTime(entry.start)}
        </span>
        <span className="flex-1 text-stone-700 truncate">
          {entry.description || tc("noDescription")}
        </span>
        <span className="text-stone-500 tabular-nums font-medium">
          {formatDuration(entry.duration_minutes)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <CustomerAutocomplete
          value={customer}
          onChange={(v) => {
            setCustomer(v);
            setContract("");
          }}
          inputClassName={smallInputCls}
          placeholder={tc("customer")}
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
          inputClassName={smallInputCls}
        />
        {contracts.length > 0 && (
          <select
            value={contract}
            onChange={(e) =>
              setContract(e.target.value)
            }
            className={`${smallInputCls} !w-32`}
          >
            <option value="">---</option>
            {contracts.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={handleAssign}
          disabled={saving}
          className="p-1 rounded text-cta hover:bg-cta-muted disabled:opacity-40"
          title={t("assign")}
        >
          <Check size={14} />
        </button>
      </div>
    </div>
  );
}

export function CloudTriagePanel() {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["cloud-triage"],
    queryFn: fetchPendingCloudEntries,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <p className="text-xs text-stone-500 text-center py-4">
        {tc("loading")}
      </p>
    );
  }

  if (entries.length === 0) return null;

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-amber-200">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
          {t("unassignedCloudEntries", {
            count: entries.length,
          })}
        </p>
      </div>
      {entries.map((entry) => (
        <TriageRow key={entry.start} entry={entry} />
      ))}
    </div>
  );
}
