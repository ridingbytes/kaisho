import { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { ContentPopup } from "../common/ContentPopup";
import { Markdown } from "../common/Markdown";
import { HelpButton } from "../common/HelpButton";
import { TagDropdown } from "../common/TagDropdown";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import { DOCS } from "../../docs/panelDocs";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import {
  useAddNote,
  useDeleteNote,
  useMoveNote,
  useNotes,
  useUpdateNote,
} from "../../hooks/useNotes";
import { useSettings } from "../../hooks/useSettings";
import { useTasks } from "../../hooks/useTasks";
import { useSetView } from "../../context/ViewContext";
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

type MoveDest = "task" | "kb" | "archive";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function NoteRow({
  note,
  allTags,
  onDelete,
}: {
  note: NoteItem;
  allTags: { name: string; color: string }[];
  onDelete: () => void;
}) {
  const setView = useSetView();
  const { data: tasks = [] } = useTasks();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveDest, setMoveDest] = useState<MoveDest | null>(null);
  const [editTitle, setEditTitle] = useState(note.title);
  const [editBody, setEditBody] = useState(note.body ?? "");
  const [editCustomer, setEditCustomer] = useState(
    note.customer ?? ""
  );
  const [editTags, setEditTags] = useState<string[]>(
    note.tags ?? []
  );
  const [editTaskId, setEditTaskId] = useState<string | null>(
    note.task_id ?? null
  );
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [targetCustomer, setTargetCustomer] = useState(
    note.customer ?? ""
  );
  const [targetFilename, setTargetFilename] = useState("");
  const updateNote = useUpdateNote();
  const move = useMoveNote();

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditTitle(note.title);
    setEditBody(note.body ?? "");
    setEditCustomer(note.customer ?? "");
    setEditTags([...(note.tags ?? [])]);
    setEditTaskId(note.task_id ?? null);
    setEditTaskTitle("");
    setEditing(true);
    setExpanded(true);
  }

  function doSave() {
    updateNote.mutate(
      {
        noteId: note.id,
        updates: {
          title: editTitle.trim(),
          body: editBody,
          customer: editCustomer.trim() || null,
          task_id: editTaskId,
          tags: editTags,
        },
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    doSave();
  }

  function cancelEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(false);
  }

  function openMovePanel(e: React.MouseEvent) {
    e.stopPropagation();
    setMoving((v) => !v);
    setMoveDest(null);
    setTargetCustomer(note.customer ?? "");
    setTargetFilename(slugify(note.title) + ".md");
    setTargetFilename(slugify(note.title) + ".md");
    setExpanded(true);
  }

  function selectDest(dest: MoveDest) {
    setMoveDest(dest);
    if (dest === "archive") {
      move.mutate(
        { noteId: note.id, destination: "archive" },
        { onSuccess: () => setMoving(false) }
      );
    }
  }

  function handleMoveTask() {
    if (!targetCustomer.trim()) return;
    move.mutate(
      {
        noteId: note.id,
        destination: "task",
        customer: targetCustomer.trim(),
      },
      { onSuccess: () => setMoving(false) }
    );
  }

  function handleMoveKb() {
    if (!targetFilename.trim()) return;
    move.mutate(
      {
        noteId: note.id,
        destination: "kb",
        filename: targetFilename.trim(),
      },
      { onSuccess: () => setMoving(false) }
    );
  }

  return (
    <div className="group border-b border-border-subtle">
      <div
        className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-surface-raised transition-colors"
        onClick={() => !editing && setExpanded((v) => !v)}
      >
        <span className="text-xs text-slate-500 w-20 shrink-0">
          {note.created.replace(/^\[/, "").slice(0, 10)}
        </span>
        {note.customer && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setView("customers");
            }}
            className={[
              "inline-flex items-center",
              "px-1.5 py-0.5 rounded",
              "text-[10px] font-semibold",
              "tracking-wider uppercase",
              "bg-accent-muted text-accent-hover",
              "cursor-pointer hover:bg-accent/20",
              "shrink-0 max-w-[7rem] truncate",
            ].join(" ")}
          >
            {note.customer}
          </span>
        )}
        {note.task_id && (() => {
          const t = tasks.find(
            (tk) => tk.id === note.task_id
          );
          return t ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setView("board");
              }}
              className={[
                "inline-flex items-center",
                "px-1.5 py-0.5 rounded",
                "text-[10px] font-medium",
                "bg-accent-muted text-accent",
                "cursor-pointer hover:bg-accent/20",
                "shrink-0 max-w-[10rem] truncate",
              ].join(" ")}
              title={t.title}
            >
              {t.title}
            </span>
          ) : (
            <span className="text-[10px] text-slate-600 italic shrink-0">
              [deleted]
            </span>
          );
        })()}
        <span className="text-sm text-slate-200 flex-1 truncate">
          {note.title}
        </span>
        {note.body && (
          <span onClick={(e) => e.stopPropagation()}>
            <ContentPopup
              content={note.body}
              title={note.title}
              markdown
            />
          </span>
        )}
        {note.tags?.map((tagName) => {
          const def = allTags.find((t) => t.name === tagName);
          return (
            <span
              key={tagName}
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white shrink-0"
              style={{
                backgroundColor: def?.color ?? "#64748b",
              }}
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
        <div className="relative shrink-0">
          <button
            title="Move"
            onClick={openMovePanel}
            className={[
              "transition-colors",
              moving
                ? "text-accent"
                : "text-slate-700 hover:text-accent",
            ].join(" ")}
          >
            <ArrowRightLeft size={13} strokeWidth={2} />
          </button>
          {moving && !moveDest && (
            <div
              className="absolute right-0 top-full mt-1 z-50 w-32 rounded-lg bg-surface-overlay border border-border shadow-lg p-1 flex flex-col gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              {(["task", "kb", "archive"] as MoveDest[]).map((d) => (
                <button
                  key={d}
                  onClick={() => selectDest(d)}
                  disabled={move.isPending}
                  className="w-full text-left px-2 py-1 rounded text-xs text-slate-300 hover:bg-surface-raised transition-colors capitalize disabled:opacity-40"
                >
                  {d === "kb" ? "Knowledge" : d}
                </button>
              ))}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMoving(false);
                }}
                className="w-full text-left px-2 py-1 rounded text-[10px] text-slate-600 hover:text-slate-300"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
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
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      doSave();
                    }
                  }}
                  placeholder="Title"
                  className={`${smallFieldCls} flex-1`}
                  autoFocus
                />
                <CustomerAutocomplete
                  value={editCustomer}
                  onChange={setEditCustomer}
                  placeholder="Customer"
                  className="w-32 shrink-0"
                  inputClassName={`w-full ${smallFieldCls}`}
                />
              </div>
              <TaskAutocomplete
                taskId={editTaskId}
                value={editTaskTitle}
                onChange={setEditTaskTitle}
                onSelect={(id, label) => {
                  setEditTaskId(id);
                  setEditTaskTitle(label);
                }}
                onClear={() => {
                  setEditTaskId(null);
                  setEditTaskTitle("");
                }}
                customer={editCustomer}
                inputClassName={smallFieldCls}
              />
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    doSave();
                  }
                }}
                placeholder="Body (optional)"
                rows={4}
                className={`${smallFieldCls} w-full resize-none`}
              />
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-slate-700">
                  ⌘↵ save
                </span>
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

          {/* Move sub-panel (task/kb need input) */}
          {moving && moveDest === "task" && (
            <div
              className="mt-1 p-2 rounded-md bg-surface-overlay border border-border"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-2">
                <CustomerAutocomplete
                  autoFocus
                  value={targetCustomer}
                  onChange={setTargetCustomer}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleMoveTask()
                  }
                  className="flex-1 min-w-0"
                  inputClassName={smallFieldCls}
                />
                <button
                  onClick={handleMoveTask}
                  disabled={
                    move.isPending || !targetCustomer.trim()
                  }
                  className="px-2 py-1 rounded-md text-xs font-semibold bg-accent text-white disabled:opacity-40"
                >
                  {move.isPending ? "…" : "Move"}
                </button>
                <button
                  onClick={() => { setMoveDest(null); setMoving(false); }}
                  className="px-2 py-1 rounded-md text-xs text-slate-500 hover:text-slate-300"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          )}
          {moving && moveDest === "kb" && (
            <div
              className="mt-1 p-2 rounded-md bg-surface-overlay border border-border"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={targetFilename}
                  onChange={(e) => setTargetFilename(e.target.value)}
                  placeholder="filename.md"
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleMoveKb()
                  }
                  className={`${smallFieldCls} flex-1`}
                />
                <button
                  onClick={handleMoveKb}
                  disabled={
                    move.isPending || !targetFilename.trim()
                  }
                  className="px-2 py-1 rounded-md text-xs font-semibold bg-accent text-white disabled:opacity-40"
                >
                  {move.isPending ? "…" : "Move"}
                </button>
                <button
                  onClick={() => { setMoveDest(null); setMoving(false); }}
                  className="px-2 py-1 rounded-md text-xs text-slate-500 hover:text-slate-300"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
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
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  function doSubmit() {
    if (!title.trim()) return;
    addNote.mutate(
      {
        title,
        body,
        customer: customer || null,
        task_id: taskId,
        tags,
      },
      { onSuccess: onClose }
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSubmit();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      doSubmit();
    }
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
          onKeyDown={handleKeyDown}
          required
          autoFocus
          className={`flex-1 ${fieldCls}`}
        />
        <CustomerAutocomplete
          value={customer}
          onChange={setCustomer}
          placeholder="Customer"
          className="w-36 shrink-0"
          inputClassName={`w-full ${fieldCls}`}
        />
      </div>
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
        inputClassName={fieldCls}
      />
      <textarea
        placeholder="Body (optional)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        className={`${fieldCls} resize-none`}
      />
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-slate-700">
          ⌘↵ save
        </span>
        <TagDropdown
          selected={tags}
          allTags={allTags}
          onChange={setTags}
        />
        <div className="ml-auto flex gap-2">
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
      </div>
    </form>
  );
}

export function NotesView() {
  const { data: notes = [], isLoading } = useNotes();
  const { data: settings } = useSettings();
  const allTags = settings?.tags ?? [];
  const deleteNote = useDeleteNote();
  const [showForm, setShowForm] = useState(false);

  useEffect(
    () => registerPanelAction("notes", () => setShowForm(true)),
    []
  );

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

      {showForm && (
        <AddNoteForm onClose={() => setShowForm(false)} />
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
          />
        ))}
      </div>
    </div>
  );
}
