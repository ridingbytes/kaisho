import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { Dialog } from "../common/Dialog";
import {
  useAddMilestone,
  useDeleteMilestone,
  useUpdateMilestone,
} from "../../hooks/useProjects";
import type { Milestone } from "../../types";
import { formatDateLabel } from "../../utils/dateLabel";
import { fieldCls, inputCls } from "../settings/styles";

interface Props {
  projectId: string;
  milestones: Milestone[];
}

/** Milestone checklist. Toggle/delete inline; add and edit
 * (title + due) happen in a modal dialog. */
export function MilestonesSection({
  projectId, milestones,
}: Props) {
  const { t } = useTranslation("projects");
  const { t: tc } = useTranslation("common");
  const add = useAddMilestone();
  const update = useUpdateMilestone();
  const remove = useDeleteMilestone();
  // ``true`` = add dialog; a milestone = edit dialog.
  const [dialog, setDialog] = useState<
    Milestone | true | null
  >(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  function openAdd() {
    setTitle("");
    setDue("");
    setDialog(true);
  }

  function openEdit(m: Milestone) {
    setTitle(m.title);
    setDue(m.due ?? "");
    setDialog(m);
  }

  function save() {
    if (!title.trim()) return;
    if (dialog === true) {
      add.mutate(
        { projectId, title: title.trim(), due: due || null },
        { onSuccess: () => setDialog(null) },
      );
    } else if (dialog) {
      update.mutate(
        {
          projectId,
          milestoneId: dialog.id,
          updates: { title: title.trim(), due: due || "" },
        },
        { onSuccess: () => setDialog(null) },
      );
    }
  }

  const saving = add.isPending || update.isPending;

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
            <button
              onClick={() => openEdit(m)}
              className={[
                "flex-1 text-left text-sm hover:text-cta",
                m.done
                  ? "line-through text-fg-muted"
                  : "text-fg",
              ].join(" ")}
            >
              {m.title}
            </button>
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
      <button
        onClick={openAdd}
        className="inline-flex items-center gap-1 text-xs text-cta hover:underline"
      >
        <Plus size={13} /> {t("addMilestone", "Add milestone")}
      </button>

      {dialog && (
        <Dialog
          open
          onClose={() => setDialog(null)}
          title={
            dialog === true
              ? t("addMilestone", "Add milestone")
              : t("editMilestone", "Edit milestone")
          }
          footer={
            <div className="flex justify-end gap-2 w-full">
              <button
                onClick={() => setDialog(null)}
                className={fieldCls}
              >
                {tc("cancel")}
              </button>
              <button
                onClick={save}
                disabled={!title.trim() || saving}
                className="px-3 py-1.5 rounded text-sm bg-cta text-white hover:bg-cta-hover disabled:opacity-40"
              >
                {tc("save")}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("milestonePlaceholder")}
              className={`${inputCls} w-full`}
            />
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className={`${fieldCls} w-full`}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}
