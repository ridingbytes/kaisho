/**
 * @module MetadataCard
 *
 * Renders a KB file's index metadata as a compact card
 * above the body. Two modes:
 *
 * - Read: title + colored tag chips + metadata row.
 * - Edit: tag picker with autocomplete from
 *   ``useKnowledgeTags()``, inline autocompletes for
 *   customer / task / type / status, plain inputs for
 *   title / created.
 *
 * The KB file on disk is never modified -- writes go
 * through the central metadata index.
 */
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  profileGet,
  profileSet,
} from "../../utils/profileStorage";
import { useCustomers } from "../../hooks/useCustomers";
import {
  useKnowledgeDistinctValues,
  useKnowledgeMetadata,
  useKnowledgeTags,
  usePatchKnowledgeMetadata,
} from "../../hooks/useKnowledge";
import { useTasks } from "../../hooks/useTasks";
import { freeTagBadgeStyle } from "../../utils/tagColors";
import {
  MetaAutocomplete,
  RichMetaAutocomplete,
} from "./MetaAutocomplete";
import { TagPicker } from "./TagPicker";
import type { KnowledgeMetadata } from "../../types";

interface MetadataCardProps {
  /** Relative path to the file (already a markdown file). */
  path: string;
  /** Falls back to the filename (without extension) when
   *  the file has no ``title:`` set yet. */
  fallbackTitle: string;
  /** Tag chips clicked here add/remove the tag from the
   *  active filter set in ``KnowledgeView``. */
  onTagClick?: (tag: string) => void;
  /** Active filter set, used to highlight chips that are
   *  already applied. */
  activeTagFilters?: ReadonlySet<string>;
}

/**
 * Optional metadata fields shared between read and edit
 * mode. ``key`` is the canonical metadata key, so the
 * read-mode display loop and the patch payload mirror
 * this list directly. The edit-mode renderer picks an
 * appropriate widget per field.
 */
type OptionalKey = keyof Pick<
  KnowledgeMetadata,
  "created" | "customer" | "task_id" | "type" | "status"
>;
const META_FIELDS: ReadonlyArray<{
  key: OptionalKey;
  labelKey: string;
  placeholder?: string;
}> = [
  { key: "created", labelKey: "date", placeholder: "YYYY-MM-DD" },
  { key: "customer", labelKey: "customer" },
  { key: "task_id", labelKey: "task" },
  { key: "type", labelKey: "type" },
  {
    key: "status",
    labelKey: "status",
    placeholder: "active | archived | …",
  },
];


export function MetadataCard({
  path,
  fallbackTitle,
  onTagClick,
  activeTagFilters,
}: MetadataCardProps) {
  const { t } = useTranslation("knowledge");
  const { t: tc } = useTranslation("common");
  const { data } = useKnowledgeMetadata(path);
  const { data: knownTags = [] } = useKnowledgeTags();
  const { data: distinctValues } =
    useKnowledgeDistinctValues();
  const { data: customers = [] } = useCustomers(true);
  const { data: tasks = [] } = useTasks(true);
  const patchMutation = usePatchKnowledgeMetadata();
  const [draft, setDraft] = useState<
    KnowledgeMetadata | null
  >(null);

  // Collapse state -- persisted so the user's choice
  // survives navigation and reloads. Defaults to
  // collapsed because the card otherwise duplicates
  // information that already lives in the doc's H1.
  const COLLAPSED_KEY = "kaisho_kb_meta_collapsed";
  const [collapsed, setCollapsed] = useState<boolean>(
    () => (profileGet(COLLAPSED_KEY) ?? "true") === "true",
  );
  useEffect(() => {
    profileSet(
      COLLAPSED_KEY,
      collapsed ? "true" : "false",
    );
  }, [collapsed]);

  // Suggestion sources, derived once per render. ``tree``
  // and ``customers`` change rarely; the memo keeps the
  // arrays stable across re-renders so Autocomplete's
  // internal effects don't churn.
  const suggestions = useMemo(() => {
    const statuses = new Set(distinctValues?.status ?? []);
    const types = new Set(distinctValues?.type ?? []);
    // Common defaults so the dropdown is useful even
    // before any file in the KB has set the value.
    ["active", "draft", "archived", "in-progress"]
      .forEach((s) => statuses.add(s));
    ["note", "reference", "research", "guide"]
      .forEach((t) => types.add(t));
    return {
      customers: customers.map((c) => c.name),
      tasks: tasks.map((tk) => ({
        id: tk.id,
        label: tk.title,
      })),
      statuses: Array.from(statuses).sort(),
      types: Array.from(types).sort(),
    };
  }, [customers, tasks, distinctValues]);

  const fm = data?.metadata;
  const editing = draft !== null;

  function startEditing() {
    if (!fm) return;
    // Snapshot current server state at the moment the
    // user enters edit mode so background refetches don't
    // overwrite the draft mid-edit.
    setDraft({
      title: fm.title,
      tags: [...fm.tags],
      created: fm.created,
      customer: fm.customer,
      task_id: fm.task_id,
      type: fm.type,
      status: fm.status,
    });
  }

  function handleSave() {
    if (!draft) return;
    const patch: Record<string, unknown> = {
      title: draft.title,
      tags: draft.tags,
    };
    for (const field of META_FIELDS) {
      patch[field.key] = draft[field.key] || null;
    }
    patchMutation.mutate(
      { path, patch },
      { onSuccess: () => setDraft(null) },
    );
  }

  function updateDraftField<
    K extends keyof KnowledgeMetadata,
  >(key: K, value: KnowledgeMetadata[K]) {
    setDraft((prev) =>
      prev ? { ...prev, [key]: value } : prev,
    );
  }

  if (!fm) return null;

  if (editing && draft) {
    return (
      <div
        className={
          "mb-4 rounded-lg border border-border-subtle " +
          "bg-surface-raised/40 p-3 space-y-2"
        }
      >
        <input
          value={draft.title}
          onChange={(e) =>
            updateDraftField("title", e.target.value)
          }
          placeholder={fallbackTitle}
          aria-label={tc("title")}
          className={
            "w-full px-2 py-1 rounded text-sm font-medium " +
            "bg-surface-raised border border-border " +
            "focus:outline-none focus:border-cta"
          }
        />
        <TagPicker
          value={draft.tags}
          onChange={(tags) =>
            updateDraftField("tags", tags)
          }
          suggestions={knownTags}
        />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <MetaInput
            label={tc("date")}
            value={draft.created ?? ""}
            placeholder="YYYY-MM-DD"
            onChange={(v) =>
              updateDraftField("created", v || undefined)
            }
          />
          <MetaAutocomplete
            label={tc("customer")}
            value={draft.customer ?? ""}
            suggestions={suggestions.customers}
            onChange={(v) =>
              updateDraftField("customer", v || undefined)
            }
          />
          <RichMetaAutocomplete
            label={tc("task")}
            value={draft.task_id ?? ""}
            suggestions={suggestions.tasks}
            onChange={(v) =>
              updateDraftField("task_id", v || undefined)
            }
          />
          <MetaAutocomplete
            label={tc("type")}
            value={draft.type ?? ""}
            suggestions={suggestions.types}
            onChange={(v) =>
              updateDraftField("type", v || undefined)
            }
          />
          <MetaAutocomplete
            label={tc("status")}
            value={draft.status ?? ""}
            placeholder="active | archived | …"
            suggestions={suggestions.statuses}
            onChange={(v) =>
              updateDraftField("status", v || undefined)
            }
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setDraft(null)}
            disabled={patchMutation.isPending}
            className={
              "px-2.5 py-1 rounded text-xs " +
              "text-stone-700 hover:bg-surface-overlay"
            }
          >
            {t("cancelMetadata")}
          </button>
          <button
            onClick={handleSave}
            disabled={patchMutation.isPending}
            className={
              "px-2.5 py-1 rounded text-xs font-semibold " +
              "bg-cta text-white hover:bg-cta-hover " +
              "disabled:opacity-50"
            }
          >
            {patchMutation.isPending
              ? tc("saving")
              : t("saveMetadata")}
          </button>
        </div>
      </div>
    );
  }

  // Stored task_id is opaque on its own; show the task
  // title alongside (or instead of, if found) so the
  // metadata row is human-readable.
  const taskLabel = fm.task_id
    ? suggestions.tasks.find(
        (t) => t.id === fm.task_id,
      )?.label ?? fm.task_id
    : undefined;

  const optionalRows = META_FIELDS
    .map((field) => ({
      label: tc(field.labelKey),
      value: field.key === "task_id"
        ? taskLabel
        : fm[field.key],
    }))
    .filter((r) => r.value);

  if (collapsed) {
    // Compact one-row strip: chevron + tag chips + a
    // few inline metadata pills. We deliberately omit
    // the title -- the doc body already shows it in
    // the H1, so repeating it here is just visual
    // noise. When nothing is set anywhere, fall back
    // to the filename so the strip never goes blank.
    const hasAnyMeta =
      fm.tags.length > 0
      || taskLabel
      || fm.customer
      || fm.status
      || fm.type;
    return (
      <div
        className={
          "mb-4 flex items-center gap-1.5 px-2 py-1 " +
          "rounded text-xs hover:bg-surface-raised " +
          "transition-colors group/meta"
        }
      >
        <button
          onClick={() => setCollapsed(false)}
          title={t("expandMetadata")}
          aria-label={t("expandMetadata")}
          aria-expanded={false}
          className={
            "shrink-0 p-0.5 rounded text-stone-400 " +
            "hover:text-stone-800"
          }
        >
          <ChevronRight size={12} />
        </button>
        {fm.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {fm.tags.map((tag) => (
              <TagChip
                key={tag}
                tag={tag}
                active={activeTagFilters?.has(tag)}
                onClick={onTagClick}
              />
            ))}
          </div>
        )}
        {fm.customer && (
          <InlinePill
            label={tc("customer")}
            value={fm.customer}
          />
        )}
        {taskLabel && (
          <InlinePill
            label={tc("task")}
            value={taskLabel}
          />
        )}
        {fm.status && (
          <InlinePill
            label={tc("status")}
            value={fm.status}
          />
        )}
        {!hasAnyMeta && (
          <span
            className={
              "text-[10px] italic text-stone-400"
            }
          >
            {t("noTags")}
          </span>
        )}
        <button
          onClick={startEditing}
          title={t("editMetadata")}
          aria-label={t("editMetadata")}
          className={
            "ml-auto shrink-0 p-0.5 rounded " +
            "text-stone-400 hover:text-cta " +
            "opacity-0 group-hover/meta:opacity-100 " +
            "focus-visible:opacity-100 transition-opacity"
          }
        >
          <Pencil size={11} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={
        "mb-4 rounded-lg border border-border-subtle " +
        "bg-surface-raised/40 p-3 group"
      }
    >
      <div className="flex items-start gap-2">
        <button
          onClick={() => setCollapsed(true)}
          title={t("collapseMetadata")}
          aria-label={t("collapseMetadata")}
          aria-expanded={true}
          className={
            "p-1 rounded text-stone-400 " +
            "hover:text-stone-700 transition-colors " +
            "shrink-0 -ml-1 mt-0.5"
          }
        >
          <ChevronDown size={12} />
        </button>
        <h2
          className={
            "flex-1 text-base font-semibold text-stone-800"
          }
        >
          {fm.title || fallbackTitle}
        </h2>
        <button
          onClick={startEditing}
          title={t("editMetadata")}
          aria-label={t("editMetadata")}
          className={
            "p-1 rounded text-stone-400 hover:text-cta " +
            "opacity-0 group-hover:opacity-100 " +
            "focus-visible:opacity-100 transition-opacity"
          }
        >
          <Pencil size={12} />
        </button>
      </div>
      {fm.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {fm.tags.map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              active={activeTagFilters?.has(tag)}
              onClick={onTagClick}
            />
          ))}
        </div>
      ) : (
        <p
          className={
            "text-[10px] text-stone-400 mt-1 italic"
          }
        >
          {t("noTags")}
        </p>
      )}
      {optionalRows.length > 0 && (
        <dl
          className={
            "mt-2 grid grid-cols-[auto_1fr] gap-x-3 " +
            "gap-y-0.5 text-[11px]"
          }
        >
          {optionalRows.map((r) => (
            <div key={r.label} className="contents">
              <dt
                className={
                  "text-stone-400 uppercase " +
                  "tracking-wider text-[9px] mt-0.5"
                }
              >
                {r.label}
              </dt>
              <dd className="text-stone-700">
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}


function MetaInput({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span
        className={
          "text-[9px] text-stone-500 uppercase " +
          "tracking-wider"
        }
      >
        {label}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={
          "px-2 py-1 rounded bg-surface-raised " +
          "border border-border " +
          "focus:outline-none focus:border-cta"
        }
      />
    </label>
  );
}


function InlinePill({
  label, value,
}: { label: string; value: string }) {
  return (
    <span
      title={`${label}: ${value}`}
      className={
        "inline-flex items-center gap-1 px-1.5 py-0.5 " +
        "rounded text-[10px] bg-surface-overlay " +
        "text-stone-700 max-w-[12rem]"
      }
    >
      <span
        className={
          "text-[9px] uppercase tracking-wider " +
          "text-stone-400"
        }
      >
        {label}
      </span>
      <span className="truncate">{value}</span>
    </span>
  );
}


function TagChip({
  tag, active, onClick,
}: {
  tag: string;
  active?: boolean;
  onClick?: (tag: string) => void;
}) {
  const baseCls =
    "px-1.5 py-0.5 rounded text-[10px] font-medium "
    + "transition-shadow";
  const interactiveCls = onClick
    ? " cursor-pointer hover:shadow-sm"
    : "";
  const activeCls = active
    ? " ring-1 ring-cta ring-offset-1 ring-offset-surface"
    : "";
  if (!onClick) {
    return (
      <span
        style={freeTagBadgeStyle(tag)}
        className={baseCls + interactiveCls + activeCls}
      >
        {tag}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(tag);
      }}
      title={
        active
          ? `Remove filter: ${tag}`
          : `Filter by tag: ${tag}`
      }
      style={freeTagBadgeStyle(tag)}
      className={baseCls + interactiveCls + activeCls}
    >
      {tag}
    </button>
  );
}
