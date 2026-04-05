import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Pencil, Trash2, X } from "lucide-react";
import { Markdown } from "../common/Markdown";
import { HelpButton } from "../common/HelpButton";
import { TagDropdown } from "../common/TagDropdown";
import { DOCS } from "../../docs/panelDocs";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import {
  useAddNote,
  useDeleteNote,
  useNotes,
  usePromoteNote,
  useUpdateNote,
} from "../../hooks/useNotes";
import { useSettings } from "../../hooks/useSettings";
import { registerPanelAction } from "../../utils/panelActions";
import type { NoteItem } from "../../types";

const fieldCls =
  "px-3 py-1.5 rounded-lg bg-surface-raised border border-border " +
  "text-sm text-slate-200 placeholder-slate-600 " +
  "focus:outline-none focus:border-border-strong";

const smallFieldCls =
  "px-2 py-1 rounded-md bg-surface-overlay border border-border " +
  "text-xs text-slate-200 placeholder-slate-600 " +
  "focus:outline-none focus:border-border-strong";

function PromoteDialog({
  note,
  onConfirm,
  onCancel,
}: {
  note: NoteItem;
  onConfirm: (customer: string) => void;
  onCancel: () => void;
}) {
  const [customer, setCustomer] = useState(note.customer ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-card border border-border rounded-xl p-5 w-80 flex flex-col gap-3">
        <p className="text-sm text-slate-300 font-medium">
          Promote to task
        </p>
        <p className="text-xs text-slate-500 truncate">{note.title}</p>
        <CustomerAutocomplete
          value={customer}
          onChange={setCustomer}
          placeholder="Customer"
          className="w-full"
          inputClassName={`${fieldCls} w-full`}
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => customer && onConfirm(customer)}
            disabled={!customer}
            className="px-4 py-1.5 rounded-lg text-sm bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            Promote
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteRow({
  note,
  allTags,
  onDelete,
  onPromote,
}: {
  note: NoteItem;
  allTags: { name: string; color: string }[];
  onDelete: () => void;
  onPromote: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title);
  const [editBody, setEditBody] = useState(note.body ?? "");
  const [editCustomer, setEditCustomer] = useState(note.customer ?? "");
  const [editTags, setEditTags] = useState<string[]>(note.tags ?? []);
  const updateNote = useUpdateNote();

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditTitle(note.title);
    setEditBody(note.body ?? "");
    setEditCustomer(note.customer ?? "");
    setEditTags([...(note.tags ?? [])]);
    setEditing(true);
    setExpanded(true);
  }

  function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    updateNote.mutate(
      {
        noteId: note.id,
        updates: {
          title: editTitle.trim(),
          body: editBody,
          customer: editCustomer.trim() || null,
          tags: editTags,
        },
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  function cancelEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(false);
  }

  return (
    <div className="border-b border-border-subtle">
      <div
        className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-surface-raised transition-colors"
        onClick={() => !editing && setExpanded((v) => !v)}
      >
        <span className="text-xs text-slate-600 w-10 shrink-0">
          #{note.id}
        </span>
        <span className="text-xs text-slate-500 w-24 shrink-0">
          {note.created.slice(1, 11)}
        </span>
        {note.customer && (
          <span className="text-xs text-slate-400 w-24 shrink-0 truncate">
            {note.customer}
          </span>
        )}
        <span className="text-sm text-slate-200 flex-1 truncate">
          {note.title}
        </span>
        {note.tags?.map((tagName) => {
          const def = allTags.find((t) => t.name === tagName);
          return (
            <span
              key={tagName}
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white shrink-0"
              style={{ backgroundColor: def?.color ?? "#64748b" }}
            >
              {tagName}
            </span>
          );
        })}
        <button
          onClick={startEdit}
          className="text-slate-700 hover:text-accent transition-colors shrink-0"
          title="Edit"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPromote();
          }}
          className="text-slate-700 hover:text-accent transition-colors shrink-0"
          title="Promote to task"
        >
          <ArrowUpRight size={13} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {expanded && (
        <div
          className="px-4 pb-3 flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {editing ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Title"
                  className={`${smallFieldCls} flex-1`}
                  autoFocus
                />
                <CustomerAutocomplete
                  value={editCustomer}
                  onChange={setEditCustomer}
                  placeholder="Customer"
                  className="w-36 shrink-0"
                  inputClassName={`w-full ${smallFieldCls}`}
                />
              </div>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Body (optional)"
                rows={4}
                className={`${smallFieldCls} w-full resize-none`}
              />
              <div className="flex items-center gap-2">
                <TagDropdown
                  selected={editTags}
                  allTags={allTags}
                  onChange={setEditTags}
                />
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={cancelEdit}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-500 hover:text-slate-300"
                  >
                    <X size={11} /> Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={updateNote.isPending}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-accent text-white disabled:opacity-40"
                  >
                    <Check size={11} />
                    {updateNote.isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            note.body && (
              <Markdown className="text-sm text-slate-300">
                {note.body}
              </Markdown>
            )
          )}
        </div>
      )}
    </div>
  );
}

function AddNoteForm({ onClose }: { onClose: () => void }) {
  const addNote = useAddNote();
  const { data: settings } = useSettings();
  const allTags = settings?.tags ?? [];
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [customer, setCustomer] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    addNote.mutate(
      { title, body, customer: customer || null, tags },
      { onSuccess: onClose }
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-b border-border-subtle bg-surface-card px-4 py-3 flex flex-col gap-2"
    >
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
          className={`flex-1 ${fieldCls}`}
        />
        <CustomerAutocomplete
          value={customer}
          onChange={setCustomer}
          placeholder="Customer (optional)"
          className="w-44 shrink-0"
          inputClassName={`w-full ${fieldCls}`}
        />
      </div>
      <div className="flex items-center gap-2">
        <TagDropdown
          selected={tags}
          allTags={allTags}
          onChange={setTags}
        />
      </div>
      <textarea
        placeholder="Body (optional)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className={`${fieldCls} resize-none`}
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={addNote.isPending}
          className="px-4 py-1.5 rounded-lg text-sm bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {addNote.isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}

export function NotesView() {
  const { data: notes = [], isLoading } = useNotes();
  const { data: settings } = useSettings();
  const allTags = settings?.tags ?? [];
  const deleteNote = useDeleteNote();
  const promoteNote = usePromoteNote();
  const [showForm, setShowForm] = useState(false);
  const [promoting, setPromoting] = useState<NoteItem | null>(null);

  useEffect(() => registerPanelAction("notes", () => setShowForm(true)), []);

  function handlePromoteConfirm(customer: string) {
    if (!promoting) return;
    promoteNote.mutate(
      { noteId: promoting.id, customer },
      { onSuccess: () => setPromoting(null) }
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Notes
        </h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto px-3 py-1 rounded-lg text-xs bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          + Add
        </button>
        <HelpButton title="Notes" doc={DOCS.notes} view="notes" />
      </div>

      {showForm && <AddNoteForm onClose={() => setShowForm(false)} />}

      {promoting && (
        <PromoteDialog
          note={promoting}
          onConfirm={handlePromoteConfirm}
          onCancel={() => setPromoting(null)}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="text-sm text-slate-600 text-center py-8">
            Loading…
          </p>
        )}
        {!isLoading && notes.length === 0 && (
          <p className="text-sm text-slate-600 text-center py-8">
            No notes yet.
          </p>
        )}
        {notes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            allTags={allTags}
            onDelete={() => deleteNote.mutate(note.id)}
            onPromote={() => setPromoting(note)}
          />
        ))}
      </div>
    </div>
  );
}
