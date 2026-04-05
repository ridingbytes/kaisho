import { useEffect, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Markdown } from "../common/Markdown";
import { HelpButton } from "../common/HelpButton";
import { TagDropdown } from "../common/TagDropdown";
import { DOCS } from "../../docs/panelDocs";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import {
  useAddComm,
  useCommSearch,
  useComms,
  useDeleteComm,
  useUpdateComm,
} from "../../hooks/useComm";
import { useSettings } from "../../hooks/useSettings";
import { registerPanelAction } from "../../utils/panelActions";
import type { CommEntry } from "../../types";

const DIRECTION_OPTIONS = ["all", "in", "out"] as const;
const CHANNEL_OPTIONS = [
  "all",
  "email",
  "phone",
  "chat",
  "other",
] as const;

function DirectionBadge({ direction }: { direction: "in" | "out" }) {
  return (
    <span
      className={[
        "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase",
        direction === "in"
          ? "bg-green-900/40 text-green-400"
          : "bg-blue-900/40 text-blue-400",
      ].join(" ")}
    >
      {direction}
    </span>
  );
}

function ChannelPill({ channel }: { channel: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-overlay text-slate-400">
      {channel}
    </span>
  );
}

const fieldCls =
  "px-2 py-1 rounded text-xs bg-surface-raised border border-border " +
  "text-slate-200 placeholder-slate-600 focus:outline-none " +
  "focus:border-border-strong";

function CommRow({
  entry,
  onDelete,
}: {
  entry: CommEntry;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState(entry.type ?? "");
  const [editTags, setEditTags] = useState<string[]>(entry.tags ?? []);
  const updateComm = useUpdateComm();
  const { data: settings } = useSettings();
  const allTags = settings?.tags ?? [];

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditType(entry.type ?? "");
    setEditTags(entry.tags ?? []);
    setEditing(true);
    setExpanded(true);
  }

  function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    updateComm.mutate(
      { id: entry.id, updates: { type: editType, tags: editTags } },
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
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs text-slate-600 w-10 shrink-0">
          #{entry.id}
        </span>
        <span className="text-xs text-slate-500 w-24 shrink-0">
          {entry.ts.slice(0, 10)}
        </span>
        <DirectionBadge direction={entry.direction} />
        <ChannelPill channel={entry.channel} />
        {entry.type && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-surface-overlay text-slate-400 shrink-0">
            {entry.type}
          </span>
        )}
        <span className="text-xs text-slate-400 w-24 shrink-0 truncate">
          {entry.customer ?? "—"}
        </span>
        <span className="text-sm text-slate-200 flex-1 truncate">
          {entry.subject}
        </span>
        {entry.tags?.map((tagName) => {
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
          className="text-slate-700 hover:text-accent transition-colors"
          title="Edit type / tags"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(entry.id);
          }}
          className="text-slate-600 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          {editing ? (
            <div
              className="flex flex-col gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type (e.g. meeting, proposal)"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className={`${fieldCls} w-56`}
                />
                <button
                  onClick={cancelEdit}
                  className="p-1 text-slate-600 hover:text-slate-300 rounded"
                >
                  <X size={13} />
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateComm.isPending}
                  className="p-1 text-accent hover:bg-accent-muted rounded disabled:opacity-40"
                >
                  <Check size={13} />
                </button>
              </div>
              <TagDropdown
                selected={editTags}
                allTags={allTags}
                onChange={setEditTags}
              />
            </div>
          ) : null}
          <p className="text-xs text-slate-500">
            Contact: {entry.contact || "—"}
          </p>
          {entry.body ? (
            <Markdown className="text-sm text-slate-300">
              {entry.body}
            </Markdown>
          ) : (
            <p className="text-sm text-slate-600">No body.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AddCommForm({ onClose }: { onClose: () => void }) {
  const addComm = useAddComm();
  const { data: settings } = useSettings();
  const allTags = settings?.tags ?? [];
  const [subject, setSubject] = useState("");
  const [direction, setDirection] = useState("in");
  const [channel, setChannel] = useState("email");
  const [customer, setCustomer] = useState("");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [commType, setCommType] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    addComm.mutate(
      {
        subject,
        direction,
        channel,
        customer,
        body,
        contact,
        type: commType,
        tags,
      },
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
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          autoFocus
          className="flex-1 px-3 py-1.5 rounded-lg bg-surface-raised border border-border text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-border-strong"
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface-raised border border-border text-sm text-slate-200 focus:outline-none"
        >
          <option value="in">In</option>
          <option value="out">Out</option>
        </select>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface-raised border border-border text-sm text-slate-200 focus:outline-none"
        >
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="chat">Chat</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="flex items-start gap-2">
        <CustomerAutocomplete
          value={customer}
          onChange={setCustomer}
          placeholder="Customer"
          className="w-44 shrink-0"
          inputClassName="w-full px-3 py-1.5 rounded-lg bg-surface-raised border border-border text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-border-strong"
        />
        <input
          type="text"
          placeholder="Contact"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="w-36 px-3 py-1.5 rounded-lg bg-surface-raised border border-border text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-border-strong"
        />
        <input
          type="text"
          placeholder="Type (e.g. meeting, proposal)"
          value={commType}
          onChange={(e) => setCommType(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-lg bg-surface-raised border border-border text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-border-strong"
        />
        <TagDropdown
          selected={tags}
          allTags={allTags}
          onChange={setTags}
        />
      </div>
      <textarea
        placeholder="Body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="px-3 py-1.5 rounded-lg bg-surface-raised border border-border text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-border-strong resize-none"
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
          disabled={addComm.isPending}
          className="px-4 py-1.5 rounded-lg text-sm bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {addComm.isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}

export function CommunicationsView() {
  const [direction, setDirection] =
    useState<(typeof DIRECTION_OPTIONS)[number]>("all");
  const [channel, setChannel] =
    useState<(typeof CHANNEL_OPTIONS)[number]>("all");
  const [searchText, setSearchText] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(
    () => registerPanelAction("communications", () => setShowForm(true)),
    []
  );

  const filterParams = {
    direction: direction !== "all" ? direction : undefined,
    channel: channel !== "all" ? channel : undefined,
  };

  const { data: entries = [], isLoading } = useComms(filterParams);
  const { data: searchEntries = [], isLoading: searchLoading } =
    useCommSearch(searchText);
  const deleteComm = useDeleteComm();

  const displayEntries =
    searchText.length > 1 ? searchEntries : entries;
  const loading = searchText.length > 1 ? searchLoading : isLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Communications
        </h1>
        <select
          value={direction}
          onChange={(e) =>
            setDirection(e.target.value as typeof direction)
          }
          className="px-2 py-1 rounded-lg bg-surface-raised border border-border text-xs text-slate-300 focus:outline-none"
        >
          {DIRECTION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d === "all" ? "All directions" : d}
            </option>
          ))}
        </select>
        <select
          value={channel}
          onChange={(e) =>
            setChannel(e.target.value as typeof channel)
          }
          className="px-2 py-1 rounded-lg bg-surface-raised border border-border text-xs text-slate-300 focus:outline-none"
        >
          {CHANNEL_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c === "all" ? "All channels" : c}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="ml-auto w-48 px-3 py-1 rounded-lg bg-surface-raised border border-border text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-border-strong"
        />
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1 rounded-lg text-xs bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          + Add
        </button>
        <HelpButton title="Communications" doc={DOCS.communications} view="communications" />
      </div>

      {showForm && (
        <AddCommForm onClose={() => setShowForm(false)} />
      )}

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="text-sm text-slate-600 text-center py-8">
            Loading…
          </p>
        )}
        {!loading && displayEntries.length === 0 && (
          <p className="text-sm text-slate-600 text-center py-8">
            No entries found.
          </p>
        )}
        {displayEntries.map((entry) => (
          <CommRow
            key={entry.id}
            entry={entry}
            onDelete={(id) => deleteComm.mutate(id)}
          />
        ))}
      </div>
    </div>
  );
}
