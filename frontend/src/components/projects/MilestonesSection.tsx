import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import {
  useAddMilestone,
  useDeleteMilestone,
  useUpdateMilestone,
} from "../../hooks/useProjects";
import type { Milestone } from "../../types";
import { formatDateLabel } from "../../utils/dateLabel";
import { fieldCls } from "../settings/styles";

interface Props {
  projectId: string;
  milestones: Milestone[];
}

/** Milestone checklist with add / toggle / delete. */
export function MilestonesSection({
  projectId, milestones,
}: Props) {
  const { t } = useTranslation("projects");
  const add = useAddMilestone();
  const update = useUpdateMilestone();
  const remove = useDeleteMilestone();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    add.mutate(
      { projectId, title: title.trim(), due: due || null },
      { onSuccess: () => { setTitle(""); setDue(""); } },
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {milestones.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-2 group"
          >
            <input
              type="checkbox"
              checked={m.done}
              onChange={() =>
                update.mutate({
                  projectId,
                  milestoneId: m.id,
                  updates: { done: !m.done },
                })
              }
              className="rounded border-border text-cta"
            />
            <span className={[
              "flex-1 text-sm",
              m.done
                ? "line-through text-fg-muted"
                : "text-fg",
            ].join(" ")}>
              {m.title}
            </span>
            {m.due && (
              <span className="text-2xs text-fg-muted">
                {formatDateLabel(m.due)}
              </span>
            )}
            <ConfirmPopover
              onConfirm={() =>
                remove.mutate({
                  projectId, milestoneId: m.id,
                })
              }
            >
              <button className={[
                "p-0.5 rounded text-fg-subtle opacity-0",
                "group-hover:opacity-100 hover:text-red-400",
              ].join(" ")}>
                <Trash2 size={12} />
              </button>
            </ConfirmPopover>
          </li>
        ))}
        {milestones.length === 0 && (
          <li className="text-xs text-fg-muted">
            {t("noMilestones")}
          </li>
        )}
      </ul>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("milestonePlaceholder")}
          className={`${fieldCls} flex-1`}
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className={fieldCls}
        />
        <button
          type="submit"
          disabled={!title.trim() || add.isPending}
          className={[
            "inline-flex items-center gap-1 px-2 rounded",
            "text-xs bg-cta text-white hover:bg-cta-hover",
            "disabled:opacity-40",
          ].join(" ")}
        >
          <Plus size={13} /> {t("add")}
        </button>
      </form>
    </div>
  );
}
