import { useState } from "react";
import { X, Check, Plus, Pencil } from "lucide-react";
import {
  useSettings,
  useAddTag,
  useUpdateTag,
  useDeleteTag,
  useAddCustomerType,
  useDeleteCustomerType,
  useAddInboxType,
  useDeleteInboxType,
  useAddInboxChannel,
  useDeleteInboxChannel,
  useUpdateState,
} from "../../hooks/useSettings";
import type { ConfigTag } from "../../types";
import { fieldCls, inputCls } from "./styles";

// -----------------------------------------------------------------
// Tag row
// -----------------------------------------------------------------

function TagRow({ tag }: { tag: ConfigTag }) {
  const [editing, setEditing] = useState(false);
  const [color, setColor] = useState(tag.color);
  const [description, setDescription] = useState(
    tag.description,
  );
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  function handleSave() {
    updateTag.mutate(
      { name: tag.name, updates: { color, description } },
      { onSuccess: () => setEditing(false) }
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle last:border-0">
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
          placeholder="Description"
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
    <div className="group flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle last:border-0">
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
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
          title="Edit"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={() => deleteTag.mutate(tag.name)}
          disabled={deleteTag.isPending}
          className="p-1 rounded text-stone-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Delete"
        >
          <X size={11} />
        </button>
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
        placeholder="Name"
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={`${fieldCls} flex-1`}
        placeholder="Description"
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
// Task states
// -----------------------------------------------------------------

function TaskStateRow({
  state,
  isLast,
}: {
  state: {
    name: string;
    label: string;
    color: string;
    done: boolean;
  };
  isLast: boolean;
}) {
  const update = useUpdateState();
  const [label, setLabel] = useState(state.label);
  const [color, setColor] = useState(state.color);

  function save() {
    const updates: { label?: string; color?: string } =
      {};
    if (label !== state.label) updates.label = label;
    if (color !== state.color) updates.color = color;
    if (Object.keys(updates).length > 0) {
      update.mutate({ name: state.name, updates });
    }
  }

  return (
    <div
      className={[
        "flex items-center gap-3 px-4 py-2",
        !isLast ? "border-b border-border-subtle" : "",
      ].join(" ")}
    >
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
    </div>
  );
}

function TaskStatesSection({
  states,
}: {
  states: {
    name: string;
    label: string;
    color: string;
    done: boolean;
  }[];
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
        Task States
      </h2>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {states.map((state, i) => (
          <TaskStateRow
            key={state.name}
            state={state}
            isLast={i === states.length - 1}
          />
        ))}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------
// Tags section
// -----------------------------------------------------------------

function TagsSection({ tags }: { tags: ConfigTag[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600">
          Tags
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto p-1 rounded text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
          title="Add tag"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {tags.length === 0 && !adding && (
          <p className="px-4 py-3 text-xs text-stone-500">
            No tags defined.
          </p>
        )}
        {tags.map((tag) => (
          <TagRow key={tag.name} tag={tag} />
        ))}
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
// String list section (customer types, inbox types, etc.)
// -----------------------------------------------------------------

function StringListSection({
  title,
  items,
  onAdd,
  onDelete,
  addPending,
  deletePending,
}: {
  title: string;
  items: string[];
  onAdd: (name: string) => void;
  onDelete: (name: string) => void;
  addPending: boolean;
  deletePending: boolean;
}) {
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
            No entries defined.
          </p>
        )}
        {items.map((t, i) => (
          <div
            key={t}
            className={[
              "group flex items-center gap-3 px-4 py-2.5",
              i < items.length - 1
                ? "border-b border-border-subtle"
                : "",
            ].join(" ")}
          >
            <span className="text-xs font-mono text-stone-900 flex-1">
              {t}
            </span>
            <button
              onClick={() => onDelete(t)}
              disabled={deletePending}
              className="p-1 rounded text-stone-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40"
              title="Delete"
            >
              <X size={11} />
            </button>
          </div>
        ))}
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
              placeholder="New entry"
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
  const { data: settings, isLoading } = useSettings();
  const addCustType = useAddCustomerType();
  const delCustType = useDeleteCustomerType();
  const addInbType = useAddInboxType();
  const delInbType = useDeleteInboxType();
  const addInbChan = useAddInboxChannel();
  const delInbChan = useDeleteInboxChannel();

  if (isLoading) {
    return (
      <p className="text-sm text-stone-500">
        Loading...
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
        title="Customer Types"
        items={settings.customer_types ?? []}
        onAdd={(n) => addCustType.mutate(n)}
        onDelete={(n) => delCustType.mutate(n)}
        addPending={addCustType.isPending}
        deletePending={delCustType.isPending}
      />
      <StringListSection
        title="Inbox Types"
        items={settings.inbox_types ?? []}
        onAdd={(n) => addInbType.mutate(n)}
        onDelete={(n) => delInbType.mutate(n)}
        addPending={addInbType.isPending}
        deletePending={delInbType.isPending}
      />
      <StringListSection
        title="Inbox Channels"
        items={settings.inbox_channels ?? []}
        onAdd={(n) => addInbChan.mutate(n)}
        onDelete={(n) => delInbChan.mutate(n)}
        addPending={addInbChan.isPending}
        deletePending={delInbChan.isPending}
      />
    </div>
  );
}
