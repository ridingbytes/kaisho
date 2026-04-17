import type {
  ActiveTimer,
  AiSettings,
  ArchivedTask,
  ClockEntry,
  Contract,
  CronJob,
  CronRun,
  Customer,
  Dashboard,
  GithubIssueGroup,
  GithubProjectGroup,
  GithubSettings,
  InboxItem,
  KnowledgeFile,
  KnowledgeSearchResult,
  NoteItem,
  Settings,
  Task,
} from "../types";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(
  path: string, body: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await extractError(
    "POST", path, res,
  );
  return res.json() as Promise<T>;
}

/** Extract error detail from a failed response. */
async function extractError(
  method: string, path: string, res: Response,
): Promise<Error> {
  let detail = `${method} ${path}: ${res.status}`;
  try {
    const json = await res.json() as {
      detail?: string;
    };
    if (json.detail) detail = json.detail;
  } catch { /* ignore */ }
  return new Error(detail);
}

async function patch<T>(
  path: string, body: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await extractError(
    "PATCH", path, res,
  );
  return res.json() as Promise<T>;
}

async function put<T>(
  path: string, body: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await extractError(
    "PUT", path, res,
  );
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
  });
  if (!res.ok) throw await extractError(
    "DELETE", path, res,
  );
}

// ─── Tasks ──────────────────────────────────────────

/** Fetch all kanban tasks. Set includeDone to also
 *  retrieve tasks in done/cancelled states. */
export function fetchTasks(includeDone = false): Promise<Task[]> {
  return get<Task[]>(`/kanban/tasks?include_done=${includeDone}`);
}

/** Move a task to a different kanban column by
 *  changing its status (e.g. "TODO" -> "IN-PROGRESS"). */
export function moveTask(taskId: string, status: string): Promise<Task> {
  return patch<Task>(`/kanban/tasks/${taskId}`, { status });
}

/** Params for creating a new kanban task. */
export interface CreateTaskParams {
  customer: string;
  title: string;
  status: string;
  githubUrl?: string;
}

/** Create a new kanban task for a customer.
 *  Optionally link it to a GitHub issue URL. */
export function createTask(
  params: CreateTaskParams,
): Promise<Task> {
  return post<Task>("/kanban/tasks", {
    customer: params.customer,
    title: params.title,
    status: params.status,
    github_url: params.githubUrl,
  });
}

/** Update one or more fields on an existing task. */
export function updateTask(
  taskId: string,
  updates: {
    title?: string;
    customer?: string;
    status?: string;
    body?: string;
    github_url?: string;
  }
): Promise<Task> {
  return patch<Task>(`/kanban/tasks/${taskId}`, updates);
}

/** Replace all tags on a task with the given list. */
export function setTaskTags(
  taskId: string,
  tags: string[]
): Promise<Task> {
  return patch<Task>(`/kanban/tasks/${taskId}/tags`, { tags });
}

/** Archive (soft-delete) a task from the kanban board. */
export function archiveTask(taskId: string): Promise<void> {
  return del(`/kanban/tasks/${taskId}`);
}

/** Fetch all archived (soft-deleted) tasks. */
export function fetchArchivedTasks(): Promise<ArchivedTask[]> {
  return get<ArchivedTask[]>("/kanban/archive");
}

/** Restore an archived task back to the kanban board. */
export function unarchiveTask(taskId: string): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>(
    `/kanban/archive/${encodeURIComponent(taskId)}/unarchive`,
    {}
  );
}

/** Permanently delete an archived task. */
export function deleteArchivedTask(taskId: string): Promise<void> {
  return del(`/kanban/archive/${encodeURIComponent(taskId)}`);
}

// ─── Settings ───────────────────────────────────────

/** Fetch the full application settings object,
 *  including task states, tags, and backend config. */
export function fetchSettings(): Promise<Settings> {
  return get<Settings>("/settings");
}

/** Fetch AI-specific settings (model, provider, etc.). */
export function fetchAiSettings(): Promise<AiSettings> {
  return get<AiSettings>("/settings/ai");
}

/** Update AI settings (model, provider, etc.). */
export function updateAiSettings(
  updates: Partial<AiSettings>
): Promise<AiSettings> {
  return patch<AiSettings>("/settings/ai", updates);
}

/** Fetch the list of AI models available from the
 *  configured provider. */
export function fetchAvailableModels(): Promise<{ models: string[] }> {
  return get<{ models: string[] }>("/settings/ai/models");
}

/** Check if the Claude CLI is installed, authenticated,
 *  and report its version and path. */
export function fetchClaudeCliStatus(): Promise<{
  installed: boolean;
  authenticated: boolean;
  version: string;
  path: string;
}> {
  return get("/settings/ai/claude_cli");
}

/** Fetch configured file paths for each backend
 *  (org dir, markdown dir, etc.). */
export function fetchPaths(): Promise<Record<string, string>> {
  return get("/settings/paths");
}

/** Fetch the current user's profile info (name,
 *  email, bio, avatar seed, available profiles). */
export function fetchCurrentUser(): Promise<{
  profile: string;
  name: string;
  email: string;
  bio: string;
  avatar_seed: string;
  profiles: string[];
}> {
  return get("/settings/user");
}

/** Fetch the list of data profiles and which one
 *  is currently active. */
export function fetchProfiles(): Promise<{
  active: string;
  profiles: string[];
}> {
  return get("/settings/profiles");
}

/** Switch the active data profile. All queries will
 *  use data from the new profile after switching. */
export function switchProfile(
  profile: string
): Promise<{ profile: string }> {
  return put("/settings/profile", { profile });
}

/** Import data from another format/path into the
 *  current profile. Returns a summary of imported
 *  record counts per domain. */
export function importData(
  sourceFormat: string,
  sourcePath: string,
): Promise<{
  summary: Record<string, number>;
}> {
  return post("/settings/import-data", {
    source_format: sourceFormat,
    source_path: sourcePath,
  });
}

/** Create a new empty data profile. */
export function createProfile(
  name: string
): Promise<{ name: string }> {
  return post("/settings/profiles", { name });
}

/** Rename an existing data profile. */
export function renameProfile(
  oldName: string,
  newName: string
): Promise<{ name: string }> {
  return put(
    `/settings/profiles/${encodeURIComponent(oldName)}`,
    { new_name: newName },
  );
}

/** Copy an existing profile to a new name. */
export function copyProfile(
  name: string,
  target: string,
): Promise<{ name: string }> {
  return post(
    `/settings/profiles/${encodeURIComponent(name)}/copy`,
    { target },
  );
}

/** Permanently delete a data profile and its data. */
export function deleteProfile(name: string): Promise<void> {
  return del(`/settings/profiles/${encodeURIComponent(name)}`);
}

/** Update the current user's display profile
 *  (name, email, bio, or avatar seed). */
export function updateUserProfile(updates: {
  name?: string;
  email?: string;
  bio?: string;
  avatar_seed?: string;
}): Promise<Record<string, string>> {
  return patch("/settings/user/profile", updates);
}

/** Update backend file paths (org dir, markdown dir). */
export function updatePaths(updates: {
  org_dir?: string;
  markdown_dir?: string;
}): Promise<{ message: string }> {
  return patch<{ message: string }>("/settings/paths", updates);
}

/** Switch the storage backend (e.g. "org", "json",
 *  "markdown", "sql"). */
export function switchBackend(
  backend: string
): Promise<{ backend: string; message: string }> {
  return put("/settings/backend", { backend });
}

/** Fetch configured knowledge base source directories. */
export function fetchKbSources(): Promise<
  { label: string; path: string }[]
> {
  return get("/settings/kb_sources");
}

/** Replace the knowledge base source directories. */
export function updateKbSources(
  sources: { label: string; path: string }[]
): Promise<{ label: string; path: string }[]> {
  return put("/settings/kb_sources", sources);
}

/** Params for creating a new tag. */
export interface AddTagParams {
  name: string;
  color: string;
  description?: string;
}

/** Create a new tag with a name and color. */
export function addTag(
  params: AddTagParams,
): Promise<{
  name: string;
  color: string;
  description: string;
}> {
  return post("/settings/tags", {
    name: params.name,
    color: params.color,
    description: params.description ?? "",
  });
}

/** Update a tag's color or description. */
export function updateTag(
  name: string,
  updates: { color?: string; description?: string }
): Promise<{ name: string; color: string; description: string }> {
  return patch(`/settings/tags/${encodeURIComponent(name)}`, updates);
}

/** Delete a tag by name. */
export function deleteTag(name: string): Promise<void> {
  return del(`/settings/tags/${encodeURIComponent(name)}`);
}

/** Add a new customer type category. */
export function addCustomerType(name: string): Promise<void> {
  return post("/settings/customer_types", { name });
}

/** Delete a customer type category. */
export function deleteCustomerType(name: string): Promise<void> {
  return del(`/settings/customer_types/${encodeURIComponent(name)}`);
}

/** Add a new inbox item type category. */
export function addInboxType(name: string): Promise<void> {
  return post("/settings/inbox_types", { name });
}

/** Delete an inbox item type category. */
export function deleteInboxType(name: string): Promise<void> {
  return del(`/settings/inbox_types/${encodeURIComponent(name)}`);
}

/** Add a new inbox channel (e.g. "email", "phone"). */
export function addInboxChannel(name: string): Promise<void> {
  return post("/settings/inbox_channels", { name });
}

/** Delete an inbox channel. */
export function deleteInboxChannel(name: string): Promise<void> {
  return del(`/settings/inbox_channels/${encodeURIComponent(name)}`);
}

/** Update a kanban task state's label, color,
 *  or done flag. */
export function updateState(
  name: string,
  updates: { label?: string; color?: string; done?: boolean },
): Promise<{ name: string; label: string; color: string; done: boolean }> {
  return patch(`/settings/states/${encodeURIComponent(name)}`, updates);
}

/** Persist the display order of tasks on the board. */
export function reorderTasks(
  taskIds: string[],
): Promise<unknown> {
  return put("/kanban/tasks/order", taskIds);
}

/** Persist the display order of kanban columns. */
export function reorderStates(
  names: string[],
): Promise<unknown> {
  return put("/settings/states/order", names);
}

// ─── Clocks ─────────────────────────────────────────

/** Fetch the currently running timer, if any. */
export function fetchActiveTimer(): Promise<ActiveTimer> {
  return get<ActiveTimer>("/clocks/active");
}

/** Fetch all clock entries for today. */
export function fetchTodayEntries(): Promise<ClockEntry[]> {
  return get<ClockEntry[]>("/clocks/entries?period=today");
}

/** Fetch clock entries for a time period (e.g. "week",
 *  "month") or a specific date string. */
export function fetchClockEntries(
  period: string,
  specificDate?: string
): Promise<ClockEntry[]> {
  if (specificDate) {
    return get<ClockEntry[]>(
      `/clocks/entries?from_date=${specificDate}&to_date=${specificDate}`
    );
  }
  return get<ClockEntry[]>(`/clocks/entries?period=${period}`);
}

/** Fetch clock entries filtered by customer name. */
export function fetchCustomerClockEntries(
  customer: string,
  period = "all",
): Promise<ClockEntry[]> {
  return get<ClockEntry[]>(
    `/clocks/entries?period=${period}` +
    `&customer=${encodeURIComponent(customer)}`
  );
}

/** Fetch clock entries linked to a specific task. */
export function fetchTaskClockEntries(
  taskId: string
): Promise<ClockEntry[]> {
  return get<ClockEntry[]>(
    `/clocks/entries?task_id=${encodeURIComponent(taskId)}`
  );
}

/** Params for starting a new timer. */
export interface StartTimerParams {
  customer: string;
  description?: string;
  taskId?: string;
  contract?: string;
}

/** Start a new timer for a customer. Optionally link
 *  it to a task and/or contract. */
export function startTimer(
  params: StartTimerParams,
): Promise<ClockEntry> {
  return post<ClockEntry>("/clocks/start", {
    customer: params.customer,
    description: params.description ?? "",
    task_id: params.taskId ?? null,
    contract: params.contract ?? null,
  });
}

/** Stop the currently running timer and save
 *  the resulting clock entry. */
export function stopTimer(): Promise<ClockEntry> {
  return post<ClockEntry>("/clocks/stop", {});
}

/** Params for booking time without the timer. */
export interface QuickBookParams {
  duration: string;
  customer: string;
  description?: string;
  taskId?: string;
  contract?: string;
  date?: string;
  notes?: string;
}

/** Book a clock entry without using the timer.
 *  Provide a duration string like "1h30m". */
export function quickBook(
  params: QuickBookParams,
): Promise<ClockEntry> {
  return post<ClockEntry>("/clocks/quick-book", {
    duration: params.duration,
    customer: params.customer,
    description: params.description ?? "",
    task_id: params.taskId ?? null,
    contract: params.contract ?? null,
    date: params.date ?? null,
    notes: params.notes ?? null,
  });
}

/** Update fields on an existing clock entry,
 *  identified by its start timestamp. */
export function updateClockEntry(
  startIso: string,
  updates: {
    customer?: string;
    description?: string;
    hours?: number;
    new_date?: string;
    start_time?: string;
    task_id?: string;
    invoiced?: boolean;
    notes?: string;
    contract?: string;
  }
): Promise<ClockEntry> {
  const qs = encodeURIComponent(startIso);
  return patch<ClockEntry>(`/clocks/entries?start=${qs}`, updates);
}

/** Delete a clock entry by its start timestamp. */
export function deleteClockEntry(startIso: string): Promise<void> {
  const qs = encodeURIComponent(startIso);
  return del(`/clocks/entries?start=${qs}`);
}

// ─── Invoice ────────────────────────────────────────

/** Shape of the invoice preview response. */
export interface InvoicePreview {
  customer: string;
  contract: string | null;
  from_date: string | null;
  to_date: string | null;
  entries: ClockEntry[];
  total_minutes: number;
  total_hours: number;
  entry_count: number;
}

/** Fetch a preview of unbilled entries for a customer,
 *  optionally filtered by contract and date range. */
export function fetchInvoicePreview(
  customer: string,
  contract?: string | null,
  fromDate?: string | null,
  toDate?: string | null,
): Promise<InvoicePreview> {
  const params = new URLSearchParams({ customer });
  if (contract) params.set("contract", contract);
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  return get<InvoicePreview>(
    `/clocks/invoice-preview?${params}`,
  );
}

/** Mark multiple clock entries as invoiced in bulk. */
export function batchInvoiceEntries(
  starts: string[],
): Promise<{ invoiced: number }> {
  return post("/clocks/batch-invoice", { starts });
}

// ─── Inbox ──────────────────────────────────────────

/** Fetch all inbox items (quick-capture notes). */
export function fetchInboxItems(): Promise<InboxItem[]> {
  return get<InboxItem[]>("/inbox/");
}

/** Params for capturing a new inbox item. */
export interface CaptureInboxParams {
  text: string;
  type?: string;
  customer?: string;
  body?: string;
  channel?: string;
  direction?: string;
}

/** Quickly capture a new inbox item with text
 *  and optional type, customer, and channel. */
export function captureInboxItem(
  params: CaptureInboxParams,
): Promise<InboxItem> {
  return post<InboxItem>("/inbox/capture", params);
}

/** Delete an inbox item permanently. */
export function deleteInboxItem(itemId: string): Promise<void> {
  return del(`/inbox/${itemId}`);
}

/** Update fields on an existing inbox item. */
export function updateInboxItem(
  itemId: string,
  updates: {
    title?: string;
    type?: string;
    customer?: string;
    body?: string;
    channel?: string;
    direction?: string;
  }
): Promise<InboxItem> {
  return patch<InboxItem>(`/inbox/${itemId}`, updates);
}

/** Promote an inbox item to a full kanban task
 *  under the given customer. */
export function promoteInboxItem(
  itemId: string,
  customer: string
): Promise<Task> {
  return post<Task>(`/inbox/${itemId}/promote`, { customer });
}

/** Move an inbox item to another destination
 *  (todo, note, knowledge base, or archive). */
export function moveInboxItem(
  itemId: string,
  destination: "todo" | "note" | "kb" | "archive",
  opts: { customer?: string; filename?: string } = {}
): Promise<unknown> {
  return post<unknown>(`/inbox/${itemId}/move`, {
    destination,
    customer: opts.customer ?? null,
    filename: opts.filename ?? null,
  });
}

// ─── Customers ──────────────────────────────────────

/** Fetch all customers. Set includeInactive to also
 *  retrieve inactive/archived customers. */
export function fetchCustomers(
  includeInactive = false
): Promise<Customer[]> {
  return get<Customer[]>(
    `/customers/?include_inactive=${includeInactive}`
  );
}

/** Create a new customer with a name, optional
 *  status, budget, and repository URL. */
export function createCustomer(data: {
  name: string;
  status?: string;
  budget?: number;
  repo?: string | null;
}): Promise<Customer> {
  return post<Customer>("/customers/", data);
}

/** Delete a customer by name. */
export function deleteCustomer(
  name: string,
): Promise<void> {
  return del(
    `/customers/${encodeURIComponent(name)}`,
  );
}

/** Update fields on an existing customer. */
export function updateCustomer(
  name: string,
  updates: Partial<
    Pick<
      Customer,
      "name" | "status" | "budget" | "used" | "rest" | "repo"
    >
  >
): Promise<Customer> {
  return patch<Customer>(
    `/customers/${encodeURIComponent(name)}`,
    updates
  );
}

/** Fetch all contracts for a given customer. */
export function fetchContracts(
  customerName: string,
): Promise<Contract[]> {
  return get<Contract[]>(
    `/customers/${encodeURIComponent(customerName)}/contracts`
  );
}

/** Add a new contract to a customer with budget,
 *  start date, and billing settings. */
export function addContract(
  customerName: string,
  data: {
    name: string;
    budget: number;
    start_date: string;
    notes?: string;
    billable?: boolean;
    invoiced?: boolean;
  },
): Promise<Contract> {
  return post<Contract>(
    `/customers/${encodeURIComponent(customerName)}/contracts`,
    data
  );
}

/** Update fields on an existing customer contract. */
export function updateContract(
  customerName: string,
  contractName: string,
  updates: {
    name?: string;
    budget?: number;
    used_offset?: number;
    start_date?: string;
    end_date?: string | null;
    notes?: string;
    billable?: boolean;
    invoiced?: boolean;
  },
): Promise<Contract> {
  return patch<Contract>(
    `/customers/${encodeURIComponent(customerName)}/contracts/` +
      contractName,
    updates
  );
}

/** Delete a contract from a customer. */
export function deleteContract(
  customerName: string,
  contractName: string,
): Promise<void> {
  return del(
    `/customers/${encodeURIComponent(customerName)}/contracts/` +
      contractName
  );
}

// ─── Dashboard ──────────────────────────────────────

/** Fetch the dashboard summary (totals, recent
 *  activity, budget overview). */
export function fetchDashboard(): Promise<Dashboard> {
  return get<Dashboard>("/dashboard/");
}

/** A single time entry in the time insights response. */
export interface TimeInsightsEntry {
  start: string;
  customer: string;
  description: string;
  contract: string | null;
  task_id: string | null;
  duration_minutes: number;
  billable: boolean;
}

/** Per-customer breakdown in the time insights. */
export interface TimeInsightsCustomer {
  name: string;
  total_min: number;
  billable_min: number;
  entries: TimeInsightsEntry[];
}

/** Full time insights response with daily totals
 *  and per-customer breakdowns. */
export interface TimeInsights {
  period: string;
  start_date: string;
  end_date: string;
  daily: {
    date: string;
    total_min: number;
    billable_min: number;
  }[];
  by_customer: TimeInsightsCustomer[];
  billable_total_min: number;
  non_billable_total_min: number;
  total_min: number;
}

/** Fetch time tracking insights for a given period
 *  (e.g. "week", "month", "year"). */
export function fetchTimeInsights(
  period: string,
): Promise<TimeInsights> {
  return get<TimeInsights>(
    `/dashboard/time-insights?period=${period}`,
  );
}

// ─── Knowledge ──────────────────────────────────────

/** Fetch the knowledge base file tree. */
export function fetchKnowledgeTree(): Promise<KnowledgeFile[]> {
  return get<KnowledgeFile[]>("/knowledge/tree");
}

/** Fetch the content of a single knowledge base file. */
export function fetchKnowledgeFile(
  path: string
): Promise<{ path: string; content: string }> {
  return get<{ path: string; content: string }>(
    `/knowledge/file?path=${encodeURIComponent(path)}`
  );
}

/** Search the knowledge base by query string.
 *  Returns matching files with highlighted excerpts. */
export function searchKnowledge(q: string): Promise<KnowledgeSearchResult[]> {
  return get<KnowledgeSearchResult[]>(
    `/knowledge/search?q=${encodeURIComponent(q)}`
  );
}

/** Params for saving a knowledge base file. */
export interface SaveKnowledgeFileParams {
  label: string;
  path: string;
  content: string;
}

/** Save (create or overwrite) a knowledge base file. */
export function saveKnowledgeFile(
  params: SaveKnowledgeFileParams,
): Promise<KnowledgeFile> {
  return put<KnowledgeFile>(
    "/knowledge/file", params,
  );
}

/** Create a folder in the knowledge base. */
export function createKnowledgeFolder(
  label: string, path: string,
): Promise<{ path: string; label: string; name: string }> {
  return post("/knowledge/folder", { label, path });
}

/** Delete a knowledge base file by its path. */
export function deleteKnowledgeFile(path: string): Promise<void> {
  return del(`/knowledge/file?path=${encodeURIComponent(path)}`);
}

/** Rename a knowledge base file (change its path). */
export function renameKnowledgeFile(
  oldPath: string,
  newPath: string,
): Promise<KnowledgeFile> {
  return post<KnowledgeFile>("/knowledge/rename", {
    old_path: oldPath,
    new_path: newPath,
  });
}

/** Params for moving a knowledge file to another
 *  source directory. */
export interface MoveKnowledgeFileParams {
  oldPath: string;
  oldLabel: string;
  newLabel: string;
  newPath?: string;
}

/** Move a knowledge base file to a different
 *  source label (directory). */
export function moveKnowledgeFile(
  params: MoveKnowledgeFileParams,
): Promise<KnowledgeFile> {
  return post<KnowledgeFile>("/knowledge/move", {
    old_path: params.oldPath,
    old_label: params.oldLabel,
    new_label: params.newLabel,
    new_path: params.newPath ?? null,
  });
}

// ─── Notes ──────────────────────────────────────────

/** Fetch all notes. */
export function fetchNotes(): Promise<NoteItem[]> {
  return get<NoteItem[]>("/notes/");
}

/** Create a new note with a title and optional body,
 *  customer link, task link, and tags. */
export function addNote(data: {
  title: string;
  body?: string;
  customer?: string | null;
  task_id?: string | null;
  tags?: string[];
}): Promise<NoteItem> {
  return post<NoteItem>("/notes/", data);
}

/** Delete a note permanently. */
export function deleteNote(noteId: string): Promise<void> {
  return del(`/notes/${noteId}`);
}

/** Update fields on an existing note. */
export function updateNote(
  noteId: string,
  updates: {
    title?: string;
    body?: string;
    customer?: string | null;
    task_id?: string | null;
    tags?: string[];
  }
): Promise<NoteItem> {
  return patch<NoteItem>(`/notes/${noteId}`, updates);
}

/** Promote a note to a kanban task under
 *  the given customer. */
export function promoteNote(
  noteId: string,
  customer: string
): Promise<Task> {
  return post<Task>(`/notes/${noteId}/promote`, { customer });
}

/** Move a note to another destination
 *  (task, knowledge base, or archive). */
export function moveNote(
  noteId: string,
  destination: "task" | "kb" | "archive",
  opts: { customer?: string; filename?: string } = {}
): Promise<unknown> {
  return post<unknown>(`/notes/${noteId}/move`, {
    destination,
    customer: opts.customer ?? null,
    filename: opts.filename ?? null,
  });
}

// ─── Cron ───────────────────────────────────────────

/** Fetch all scheduled AI cron jobs. */
export function fetchCronJobs(): Promise<CronJob[]> {
  return get<CronJob[]>("/cron/jobs");
}

/** Create a new AI cron job with a schedule,
 *  prompt, model, and output destination. */
export function createCronJob(data: {
  id: string;
  name: string;
  schedule: string;
  model: string;
  prompt_content: string;
  output: string;
  timeout: number;
  enabled: boolean;
  use_kaisho_ai?: boolean;
}): Promise<CronJob> {
  return post<CronJob>("/cron/jobs", data);
}

/** Update fields on an existing cron job. */
export function updateCronJob(
  jobId: string,
  updates: Partial<Pick<CronJob, "name" | "schedule" | "model" | "output" | "timeout" | "use_kaisho_ai">>
): Promise<CronJob> {
  return patch<CronJob>(`/cron/jobs/${encodeURIComponent(jobId)}`, updates);
}

/** Delete a cron job permanently. */
export function deleteCronJob(jobId: string): Promise<void> {
  return del(`/cron/jobs/${encodeURIComponent(jobId)}`);
}

/** Fetch the prompt template for a cron job. */
export function fetchJobPrompt(
  jobId: string
): Promise<{ content: string; path: string; error?: string }> {
  return get(`/cron/jobs/${encodeURIComponent(jobId)}/prompt`);
}

/** Save (overwrite) the prompt template for
 *  a cron job. */
export function saveJobPrompt(
  jobId: string, content: string,
): Promise<{ content: string; path: string }> {
  const path = `/cron/jobs/${
    encodeURIComponent(jobId)
  }/prompt`;
  return put(path, { content });
}

/** Manually trigger a cron job to run immediately. */
export function triggerCronJob(
  jobId: string
): Promise<{ run_id: number; status: string }> {
  return post<{ run_id: number; status: string }>(
    `/cron/jobs/${encodeURIComponent(jobId)}/trigger`,
    {}
  );
}

/** Enable a cron job so it runs on schedule. */
export function enableCronJob(jobId: string): Promise<CronJob> {
  return post<CronJob>(
    `/cron/jobs/${encodeURIComponent(jobId)}/enable`,
    {}
  );
}

/** Disable a cron job so it stops running. */
export function disableCronJob(jobId: string): Promise<CronJob> {
  return post<CronJob>(
    `/cron/jobs/${encodeURIComponent(jobId)}/disable`,
    {}
  );
}

/** Delete a single cron run from history. */
export function deleteCronRun(runId: number): Promise<void> {
  return del(`/cron/history/${runId}`);
}

/** Fetch cron run history, optionally filtered
 *  to a specific job. */
export function fetchCronHistory(jobId?: string): Promise<CronRun[]> {
  const query = jobId
    ? `?job_id=${encodeURIComponent(jobId)}`
    : "";
  return get<CronRun[]>(`/cron/history${query}`);
}

/** Move a cron run's output to another destination
 *  (inbox, todo, note, or knowledge base). */
export function moveCronOutput(
  runId: number,
  destination: "inbox" | "todo" | "note" | "kb",
  opts: { customer?: string; filename?: string } = {}
): Promise<unknown> {
  return post<unknown>(`/cron/history/${runId}/move`, {
    destination,
    customer: opts.customer ?? null,
    filename: opts.filename ?? null,
  });
}

// ─── Invoice Export ─────────────────────────────────

/** Configuration for a single export column. */
export interface ExportColumnConfig {
  field: string;
  format?: string;
}

/** Settings that control which columns appear
 *  in invoice CSV/Excel exports. */
export interface InvoiceExportSettings {
  columns: ExportColumnConfig[];
}

/** Fetch the current invoice export column settings. */
export function fetchInvoiceExportSettings(): Promise<InvoiceExportSettings> {
  return get<InvoiceExportSettings>(
    "/settings/invoice_export",
  );
}

/** Update the invoice export column configuration. */
export function updateInvoiceExportSettings(
  columns: ExportColumnConfig[],
): Promise<InvoiceExportSettings> {
  return patch<InvoiceExportSettings>(
    "/settings/invoice_export", { columns },
  );
}

// ─── GitHub ─────────────────────────────────────────

/** Fetch GitHub issues grouped by repository. */
export function fetchGithubIssues(): Promise<GithubIssueGroup[]> {
  return get<GithubIssueGroup[]>("/github/issues");
}

/** Fetch GitHub projects grouped by repository. */
export function fetchGithubProjects(): Promise<GithubProjectGroup[]> {
  return get<GithubProjectGroup[]>("/github/projects");
}

/** Fetch GitHub integration settings (token, URL). */
export function fetchGithubSettings(): Promise<GithubSettings> {
  return get<GithubSettings>("/settings/github");
}

/** Update GitHub integration settings. */
export function updateGithubSettings(
  updates: { token?: string; base_url?: string }
): Promise<GithubSettings> {
  return patch<GithubSettings>("/settings/github", updates);
}

// ─── Cloud Sync ─────────────────────────────────────

/** Status of the cloud sync connection. */
export interface CloudSyncStatus {
  enabled: boolean;
  api_key_set: boolean;
  url: string;
  interval: number;
  connected: boolean;
  plan: string | null;
  last_pull_cursor: string;
  last_push_cursor: string;
  last_pull_at: string | null;
  last_push_at: string | null;
  last_error: string | null;
  pending_deletes: number;
  cloud_entry_count?: number;
  cloud_last_change_at?: string | null;
  cloud_active_timer_id?: string | null;
  use_cloud_ai?: boolean;
}

/** Result of a bidirectional sync cycle. */
export interface CloudSyncResult {
  pulled_up: number;
  pulled_del: number;
  pushed_live: number;
  pushed_deletes: number;
  snapshot_pushed: boolean;
  error?: string;
}

/** Fetch the current cloud sync connection status. */
export function fetchCloudSyncStatus(): Promise<CloudSyncStatus> {
  return get<CloudSyncStatus>("/cloud-sync/status");
}

/** Information about a timer running on another device. */
export interface CloudActiveTimer {
  active: boolean;
  id?: string;
  customer?: string | null;
  description?: string;
  start?: string;
  task_id?: string | null;
  contract?: string | null;
}

/** Fetch the cloud-side running timer (e.g. from the
 *  mobile app). Returns {active: false} if none or
 *  cloud sync disabled. */
export function fetchCloudActiveTimer():
  Promise<CloudActiveTimer> {
  return get<CloudActiveTimer>("/cloud-sync/active");
}

/** Stop the currently running cloud timer. */
export function stopCloudTimer(id?: string): Promise<{
  id: string;
  start: string;
  end: string;
}> {
  const qs = id ? `?id=${encodeURIComponent(id)}` : "";
  return post(`/cloud-sync/stop-cloud-timer${qs}`, {});
}

/** Connect to a cloud sync server with URL and
 *  API key. Returns the subscription plan. */
export function connectCloudSync(
  url: string, apiKey: string,
): Promise<{ ok: boolean; plan: string }> {
  return post("/cloud-sync/connect", {
    url, api_key: apiKey,
  });
}

/** Disconnect from the cloud sync server.
 *  Runs a final pull, wipes all cloud entries, and
 *  clears local sync state. */
export function disconnectCloudSync(): Promise<{
  ok: boolean;
  wiped: number;
  pull_error: string | null;
  wipe_error: string | null;
}> {
  return post("/cloud-sync/disconnect", {});
}

/** Fetch AI token usage from the cloud. */
export interface AiUsage {
  total_tokens: number;
  cap: number;
  request_count: number;
  month: string;
  input_tokens?: number;
  output_tokens?: number;
  error?: string;
}

export function fetchAiUsage(): Promise<AiUsage> {
  return get<AiUsage>("/cloud-sync/ai-usage");
}

/** Toggle cloud AI for the advisor/cron system. */
export function toggleCloudAi(
  enabled: boolean,
): Promise<{ use_cloud_ai: boolean }> {
  return patch<{ use_cloud_ai: boolean }>(
    "/cloud-sync/cloud-ai",
    { enabled },
  );
}

/** Trigger an immediate cloud sync (push + pull). */
export function syncNow(): Promise<CloudSyncResult> {
  return post<CloudSyncResult>("/cloud-sync/sync-now", {});
}

/** Fetch clock entries synced from the cloud that
 *  need triage (customer/task assignment). */
export function fetchPendingCloudEntries(): Promise<
  ClockEntry[]
> {
  return get<ClockEntry[]>("/cloud-sync/pending");
}

/** Assign customer/task/contract to pending cloud
 *  entries in bulk. */
export function triageCloudEntries(
  entries: {
    start: string;
    customer?: string;
    task_id?: string | null;
    contract?: string | null;
  }[],
): Promise<{ updated: number }> {
  return post("/cloud-sync/triage", { entries });
}

// ─── Advisor ────────────────────────────────────────

/** Send a question to the AI advisor and get
 *  a text answer. Supports conversation history. */
/** Params for asking the AI advisor. */
export interface AskAdvisorParams {
  question: string;
  model: string;
  history?: { role: string; text: string }[];
  signal?: AbortSignal;
  onEvent?: (
    type: string,
    data: Record<string, unknown>,
  ) => void;
}

/** Send a question to the advisor via SSE stream.
 *  Calls onEvent for each intermediate step and
 *  resolves with the final answer. */
export async function askAdvisor(
  params: AskAdvisorParams,
): Promise<{ answer: string }> {
  const res = await fetch(`${BASE}/advisor/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: params.question,
      model: params.model,
      history: params.history ?? [],
    }),
    signal: params.signal,
  });
  if (!res.ok) {
    throw await extractError(
      "POST", "/advisor/ask", res,
    );
  }

  const reader = res.body?.getReader();
  if (!reader) {
    return { answer: "(no response)" };
  }

  const decoder = new TextDecoder();
  let answer = "";
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";

    for (const part of parts) {
      let evtType = "";
      let evtData = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("event: ")) {
          evtType = line.slice(7);
        } else if (line.startsWith("data: ")) {
          evtData = line.slice(6);
        }
      }
      if (!evtType || !evtData) continue;
      const parsed = JSON.parse(evtData) as Record<
        string, unknown
      >;
      if (evtType === "answer") {
        answer = (parsed.answer as string) ?? "";
      } else if (evtType === "error") {
        throw new Error(
          (parsed.detail as string) ?? "Advisor error",
        );
      } else if (params.onEvent) {
        params.onEvent(evtType, parsed);
      }
    }
  }

  return { answer };
}

/** Fetch all custom advisor skill definitions. */
export function fetchAdvisorSkills(): Promise<
  { name: string; content: string }[]
> {
  return get("/advisor/skills");
}

/** Create a new advisor skill with a name and
 *  prompt content. */
export function createSkill(
  name: string,
  content: string
): Promise<{ name: string; content: string }> {
  return post("/advisor/skills", { name, content });
}

/** Update an advisor skill's prompt content. */
export function updateSkill(
  name: string,
  content: string
): Promise<{ name: string; content: string }> {
  return put(`/advisor/skills/${encodeURIComponent(name)}`, {
    name,
    content,
  });
}

/** Delete an advisor skill by name. */
export function deleteSkill(name: string): Promise<void> {
  return del(
    `/advisor/skills/${encodeURIComponent(name)}`
  );
}

// ─── Advisor Personality ────────────────────────────

/** Fetch the advisor's soul and user personality
 *  files used to shape AI responses. */
export function fetchAdvisorFiles(): Promise<{
  soul: string;
  user: string;
}> {
  return get("/settings/advisor_files");
}

/** Save the advisor's soul and user personality
 *  files. */
export function updateAdvisorFiles(
  soul: string,
  user: string
): Promise<{ soul: string; user: string }> {
  return put("/settings/advisor_files", { soul, user });
}

// ─── Backup ─────────────────────────────────────────

export interface BackupSettings {
  directory: string;
  keep: number;
  interval_hours: number;
  resolved_directory: string;
}

export interface BackupInfo {
  path: string;
  filename: string;
  size_bytes: number;
  created_at: string;
  profile: string;
}

export interface BackupRunResult {
  backup: BackupInfo;
  removed: BackupInfo[];
}

/** Fetch the backup schedule + storage settings. */
export function fetchBackupSettings(): Promise<BackupSettings> {
  return get<BackupSettings>("/settings/backup");
}

/** Update backup schedule / retention / directory. */
export function updateBackupSettings(
  updates: Partial<Omit<BackupSettings, "resolved_directory">>,
): Promise<BackupSettings> {
  return patch<BackupSettings>("/settings/backup", updates);
}

/** List existing backup archives, newest first. */
export function fetchBackups(): Promise<BackupInfo[]> {
  return get<BackupInfo[]>("/backup/list");
}

/** Create a new backup now. */
export function runBackup(
  prune = true,
): Promise<BackupRunResult> {
  return post<BackupRunResult>("/backup/run", { prune });
}

/** Prune existing backups to the configured keep count. */
export function pruneBackupsRemote(
  keep?: number,
): Promise<{ removed: BackupInfo[] }> {
  return post<{ removed: BackupInfo[] }>(
    "/backup/prune",
    keep !== undefined ? { keep } : {},
  );
}

/** URL that streams a backup archive for download. */
export function backupDownloadUrl(filename: string): string {
  return `${BASE}/backup/download/${encodeURIComponent(filename)}`;
}

// ─── Version ───────────────────────────────────────

/** App version and changelog info. */
export interface VersionInfo {
  version: string;
  changelog: string;
}

/** Fetch current app version and changelog. */
export function fetchVersionInfo(): Promise<VersionInfo> {
  return get<VersionInfo>("/version");
}

// ─── URL Allowlist ──────────────────────────────────

/** Fetch the list of allowed domains for the
 *  in-app link overlay. */
export function fetchUrlAllowlist(): Promise<string[]> {
  return get<string[]>("/settings/url_allowlist");
}

/** Replace the URL allowlist with a new set of
 *  domains. */
export function updateUrlAllowlist(
  domains: string[]
): Promise<string[]> {
  return put<string[]>("/settings/url_allowlist", domains);
}
