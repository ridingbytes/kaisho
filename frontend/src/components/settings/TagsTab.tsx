import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { CSS } from "@dnd-kit/utilities";
import { X, Check, Plus, Pencil, GripVertical } from "lucide-react";
import {
  useSettings,
  useAddTag,
  useUpdateTag,
  useDeleteTag,
  useReorderTags,
  useAddCustomerType,
  useDeleteCustomerType,
  useRenameCustomerType,
  useReorderCustomerTypes,
  useAddInboxType,
  useDeleteInboxType,
  useRenameInboxType,
  useReorderInboxTypes,
  useAddInboxChannel,
  useDeleteInboxChannel,
  useRenameInboxChannel,
  useReorderInboxChannels,
  useUpdateState,
  useAddState,
  useDeleteState,
  useReorderStates,
} from "../../hooks/useSettings";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { useToast } from "../../context/ToastContext";
import type { ConfigTag, TaskState } from "../../types";
import { fieldCls, inputCls } from "./styles";

// -----------------------------------------------------------------
// Drag handle (shared)
// -----------------------------------------------------------------

function DragHandle({
  attributes,
  listeners,
}: {
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
}) {
  return (
    <button
      {...attributes}
      {...(listeners ?? {})}
      className="cursor-grab text-stone-300 hover:text-stone-500 shrink-0 touch-none"
      onClick={(e) => e.stopPropagation()}
      title="Drag to reorder"
    >
      <GripVertical size={12} />
    </button>
  );
}

// Always-visible (subtle) action icons that brighten on
// hover. Replaces the previous opacity-0 group-hover
// pattern, which left icons stuck visible when popovers
// or color pickers stole focus.
const actionBtnCls =
  "p-1 rounded text-stone-400 hover:text-cta " +
  "hover:bg-cta-muted transition-colors disabled:opacity-40";
const dangerBtnCls =
  "p-1 rounded text-stone-400 hover:text-red-500 " +
  "hover:bg-red-500/10 transition-colors disabled:opacity-40";

// -----------------------------------------------------------------
// Tag row
// -----------------------------------------------------------------

function TagRow({ tag }: { tag: ConfigTag }) {
  const { t: tc } = useTranslation("common");
  const [editing, setEditing] = useState(false);
  const [color, setColor] = useState(tag.color);
  const [description, setDescription] = useState(
    tag.description,
  );
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: tag.name });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function handleSave() {
    updateTag.mutate(
      { name: tag.name, updates: { color, description } },
      { onSuccess: () => setEditing(false) }
    );
  }

  if (editing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle last:border-0"
      >
        <span className="w-3 shrink-0" />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent shrink-0"
        />
        <span className="text-xs text-stone-700 w-24 shrink-0">
          {tag.name}
        </span>
        <input
          autoFocus
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
          className={`${fieldCls} flex-1`}
          placeholder={tc("description")}
        />
        <button
          onClick={() => setEditing(false)}
          className="p-1 text-stone-500 hover:text-stone-900 rounded"
        >
          <X size={12} />
        </button>
        <button
          onClick={handleSave}
          disabled={updateTag.isPending}
          className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
        >
          <Check size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle last:border-0"
    >
      <DragHandle
        attributes={attributes}
        listeners={listeners}
      />
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: tag.color }}
      />
      <span className="text-sm text-stone-900 w-32 shrink-0">
        {tag.name}
      </span>
      <span className="text-xs text-stone-600 flex-1">
        {tag.description}
      </span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setEditing(true)}
          className={actionBtnCls}
          title="Edit"
        >
          <Pencil size={11} />
        </button>
        <ConfirmPopover
          onConfirm={() => deleteTag.mutate(tag.name)}
          disabled={deleteTag.isPending}
          label={`Delete tag "${tag.name}"?`}
        >
          <button
            type="button"
            disabled={deleteTag.isPending}
            className={dangerBtnCls}
            title="Delete"
          >
            <X size={11} />
          </button>
        </ConfirmPopover>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------
// Add tag form
// -----------------------------------------------------------------

function AddTagForm({
  onDone,
}: {
  onDone: () => void;
}) {
  const { t: tc } = useTranslation("common");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [description, setDescription] = useState("");
  const addTag = useAddTag();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addTag.mutate(
      { name: name.trim(), color, description },
      { onSuccess: onDone }
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onDone();
        }
      }}
      className="flex items-center gap-2 px-4 py-2.5 border-t border-border-subtle"
    >
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent shrink-0"
      />
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`${fieldCls} w-28`}
        placeholder={tc("name")}
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={`${fieldCls} flex-1`}
        placeholder={tc("description")}
      />
      <button
        type="button"
        onClick={onDone}
        className="p-1 text-stone-500 hover:text-stone-900 rounded"
      >
        <X size={12} />
      </button>
      <button
        type="submit"
        disabled={addTag.isPending || !name.trim()}
        className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
      >
        <Check size={12} />
      </button>
    </form>
  );
}

// -----------------------------------------------------------------
// Task state row
// -----------------------------------------------------------------

function TaskStateRow({
  state,
  isLast,
}: {
  state: TaskState;
  isLast: boolean;
}) {
  const update = useUpdateState();
  const toast = useToast();
  const remove = useDeleteState();
  const [label, setLabel] = useState(state.label);
  const [color, setColor] = useState(state.color);

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: state.name });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function save() {
    const updates: { label?: string; color?: string } =
      {};
    if (label !== state.label) updates.label = label;
    if (color !== state.color) updates.color = color;
    if (Object.keys(updates).length > 0) {
      update.mutate({ name: state.name, updates });
    }
  }

  function handleDelete() {
    remove.mutate(state.name, {
      onError: (err: unknown) => {
        const msg =
          err instanceof Error ? err.message
            : "Failed to delete state";
        toast(msg);
      },
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "flex items-center gap-3 px-4 py-2",
        !isLast ? "border-b border-border-subtle" : "",
      ].join(" ")}
    >
      <DragHandle
        attributes={attributes}
        listeners={listeners}
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        onBlur={save}
        className="w-5 h-5 rounded-full border-0 p-0 cursor-pointer bg-transparent shrink-0"
        title="Color"
      />
      <span className="text-xs font-mono text-stone-600 w-28 shrink-0">
        {state.name}
      </span>
      <input
        className={inputCls + " flex-1 text-sm"}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter")
            e.currentTarget.blur();
        }}
      />
      {state.done && (
        <span className="text-[10px] font-semibold uppercase text-stone-500 bg-surface-raised px-1.5 py-0.5 rounded shrink-0">
          done
        </span>
      )}
      <ConfirmPopover
        onConfirm={handleDelete}
        disabled={remove.isPending}
        label={`Delete "${state.name}"?`}
      >
        <button
          type="button"
          disabled={remove.isPending}
          className={dangerBtnCls}
          title="Delete state"
        >
          <X size={12} />
        </button>
      </ConfirmPopover>
    </div>
  );
}


function AddTaskStateForm({
  existingNames,
  onDone,
}: {
  existingNames: string[];
  onDone: () => void;
}) {
  const add = useAddState();
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#64748b");
  const [done, setDone] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim().toUpperCase();
    if (!trimmed) return;
    if (existingNames.includes(trimmed)) return;
    add.mutate(
      {
        name: trimmed,
        label: label.trim() || trimmed,
        color,
        done,
      },
      {
        onSuccess: onDone,
      },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onDone();
        }
      }}
      className="flex items-center gap-2 px-4 py-2 border-t border-border-subtle bg-surface-raised/40"
    >
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="w-5 h-5 rounded-full border-0 p-0 cursor-pointer bg-transparent shrink-0"
      />
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="NAME"
        className={inputCls + " w-28 font-mono text-xs"}
      />
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label"
        className={inputCls + " flex-1 text-sm"}
      />
      <label className="flex items-center gap-1 text-[11px] text-stone-600 shrink-0">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => setDone(e.target.checked)}
        />
        done
      </label>
      <button
        type="button"
        onClick={onDone}
        className="p-1 text-stone-500 hover:text-stone-900 rounded"
      >
        <X size={13} />
      </button>
      <button
        type="submit"
        disabled={
          add.isPending ||
          !name.trim() ||
          existingNames.includes(name.trim().toUpperCase())
        }
        className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
      >
        <Check size={13} />
      </button>
    </form>
  );
}


// -----------------------------------------------------------------
// Sortable container helper
// -----------------------------------------------------------------

function SortableList<T>({
  items,
  getId,
  onReorder,
  children,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (newOrder: string[]) => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = items.map(getId);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const next = [...ids];
    const [moved] = next.splice(oldIdx, 1);
    next.splice(newIdx, 0, moved);
    onReorder(next);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map(getId)}
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}

// -----------------------------------------------------------------
// Task states section
// -----------------------------------------------------------------

function TaskStatesSection({
  states,
}: {
  states: TaskState[];
}) {
  const { t } = useTranslation("settings");
  const [adding, setAdding] = useState(false);
  const reorder = useReorderStates();
  const existingNames = states.map((s) => s.name);
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600">
          {t("taskStates")}
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto p-1 rounded text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
          title="Add task state"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <SortableList
          items={states}
          getId={(s) => s.name}
          onReorder={(ids) => reorder.mutate(ids)}
        >
          {states.map((state, i) => (
            <TaskStateRow
              key={state.name}
              state={state}
              isLast={
                !adding && i === states.length - 1
              }
            />
          ))}
        </SortableList>
        {adding && (
          <AddTaskStateForm
            existingNames={existingNames}
            onDone={() => setAdding(false)}
          />
        )}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------
// Tags section
// -----------------------------------------------------------------

function TagsSection({ tags }: { tags: ConfigTag[] }) {
  const { t } = useTranslation("settings");
  const [adding, setAdding] = useState(false);
  const reorder = useReorderTags();

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600">
          {t("tags")}
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto p-1 rounded text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
          title={t("addTag")}
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {tags.length === 0 && !adding && (
          <p className="px-4 py-3 text-xs text-stone-500">
            {t("noTagsDefined")}
          </p>
        )}
        <SortableList
          items={tags}
          getId={(tag) => tag.name}
          onReorder={(ids) => reorder.mutate(ids)}
        >
          {tags.map((tag) => (
            <TagRow key={tag.name} tag={tag} />
          ))}
        </SortableList>
        {adding && (
          <AddTagForm
            onDone={() => setAdding(false)}
          />
        )}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------
// String list row (sortable, editable)
// -----------------------------------------------------------------

function StringListRow({
  value,
  isLast,
  onRename,
  onDelete,
  renamePending,
  deletePending,
  normalize,
}: {
  value: string;
  isLast: boolean;
  onRename: (newName: string) => void;
  onDelete: () => void;
  renamePending: boolean;
  deletePending: boolean;
  normalize: (s: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: value });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function commit() {
    const next = normalize(draft.trim());
    if (!next || next === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    onRename(next);
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "flex items-center gap-3 px-4 py-2.5",
        !isLast ? "border-b border-border-subtle" : "",
      ].join(" ")}
    >
      <DragHandle
        attributes={attributes}
        listeners={listeners}
      />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className={`${fieldCls} flex-1 font-mono text-xs`}
          disabled={renamePending}
        />
      ) : (
        <span
          className="text-xs font-mono text-stone-900 flex-1 cursor-text"
          onClick={() => setEditing(true)}
        >
          {value}
        </span>
      )}
      <button
        onClick={() => setEditing(true)}
        className={actionBtnCls}
        title="Rename"
      >
        <Pencil size={11} />
      </button>
      <ConfirmPopover
        onConfirm={onDelete}
        disabled={deletePending}
        label={`Delete "${value}"?`}
      >
        <button
          type="button"
          disabled={deletePending}
          className={dangerBtnCls}
          title="Delete"
        >
          <X size={11} />
        </button>
      </ConfirmPopover>
    </div>
  );
}

// -----------------------------------------------------------------
// String list section
// -----------------------------------------------------------------

interface StringListSectionProps {
  title: string;
  items: string[];
  onAdd: (name: string) => void;
  onDelete: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onReorder: (names: string[]) => void;
  addPending: boolean;
  deletePending: boolean;
  renamePending: boolean;
  normalize?: (s: string) => string;
}

function StringListSection({
  title,
  items,
  onAdd,
  onDelete,
  onRename,
  onReorder,
  addPending,
  deletePending,
  renamePending,
  normalize = (s) => s,
}: StringListSectionProps) {
  const { t } = useTranslation("settings");
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;
    onAdd(newItem.trim());
    setNewItem("");
    setAdding(false);
  }

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600">
          {title}
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto p-1 rounded text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
          title={`Add ${title.toLowerCase()}`}
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {items.length === 0 && !adding && (
          <p className="px-4 py-3 text-xs text-stone-500">
            {t("noEntriesDefined")}
          </p>
        )}
        <SortableList
          items={items}
          getId={(s) => s}
          onReorder={onReorder}
        >
          {items.map((item, i) => (
            <StringListRow
              key={item}
              value={item}
              isLast={!adding && i === items.length - 1}
              onRename={(next) => onRename(item, next)}
              onDelete={() => onDelete(item)}
              renamePending={renamePending}
              deletePending={deletePending}
              normalize={normalize}
            />
          ))}
        </SortableList>
        {adding && (
          <form
            onSubmit={handleAdd}
            className="flex items-center gap-2 px-4 py-2.5 border-t border-border-subtle"
          >
            <input
              autoFocus
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              className={`${fieldCls} flex-1`}
              placeholder={t("newEntry")}
            />
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="p-1 text-stone-500 hover:text-stone-900 rounded"
            >
              <X size={12} />
            </button>
            <button
              type="submit"
              disabled={addPending || !newItem.trim()}
              className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
            >
              <Check size={12} />
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------
// Main export
// -----------------------------------------------------------------

export function TagsAndTypesTab(): JSX.Element {
  const { t } = useTranslation("settings");
  const {
    data: settings, isLoading, isError, error,
  } = useSettings();
  const addCustType = useAddCustomerType();
  const delCustType = useDeleteCustomerType();
  const renCustType = useRenameCustomerType();
  const reordCustType = useReorderCustomerTypes();
  const addInbType = useAddInboxType();
  const delInbType = useDeleteInboxType();
  const renInbType = useRenameInboxType();
  const reordInbType = useReorderInboxTypes();
  const addInbChan = useAddInboxChannel();
  const delInbChan = useDeleteInboxChannel();
  const renInbChan = useRenameInboxChannel();
  const reordInbChan = useReorderInboxChannels();

  if (isLoading) {
    return (
      <p className="text-sm text-stone-500">
        Loading...
      </p>
    );
  }
  if (isError) {
    return (
      <p className="text-sm text-red-400">
        {t("failedToLoadSettings")}
        {error instanceof Error
          ? `: ${error.message}`
          : "."}
      </p>
    );
  }
  if (!settings) return <></>;

  return (
    <div className="flex flex-col gap-8">
      <TaskStatesSection
        states={settings.task_states ?? []}
      />
      <TagsSection tags={settings.tags ?? []} />
      <StringListSection
        title={t("customerTypes")}
        items={settings.customer_types ?? []}
        onAdd={(n) => addCustType.mutate(n)}
        onDelete={(n) => delCustType.mutate(n)}
        onRename={(oldName, newName) =>
          renCustType.mutate({ oldName, newName })
        }
        onReorder={(names) => reordCustType.mutate(names)}
        addPending={addCustType.isPending}
        deletePending={delCustType.isPending}
        renamePending={renCustType.isPending}
        normalize={(s) => s.toUpperCase()}
      />
      <StringListSection
        title={t("inboxTypes")}
        items={settings.inbox_types ?? []}
        onAdd={(n) => addInbType.mutate(n)}
        onDelete={(n) => delInbType.mutate(n)}
        onRename={(oldName, newName) =>
          renInbType.mutate({ oldName, newName })
        }
        onReorder={(names) => reordInbType.mutate(names)}
        addPending={addInbType.isPending}
        deletePending={delInbType.isPending}
        renamePending={renInbType.isPending}
      />
      <StringListSection
        title={t("inboxChannels")}
        items={settings.inbox_channels ?? []}
        onAdd={(n) => addInbChan.mutate(n)}
        onDelete={(n) => delInbChan.mutate(n)}
        onRename={(oldName, newName) =>
          renInbChan.mutate({ oldName, newName })
        }
        onReorder={(names) => reordInbChan.mutate(names)}
        addPending={addInbChan.isPending}
        deletePending={delInbChan.isPending}
        renamePending={renInbChan.isPending}
        normalize={(s) => s.toLowerCase()}
      />
    </div>
  );
}
