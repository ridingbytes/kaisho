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

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path}: ${res.status}`);
}

// Tasks

export function fetchTasks(includeDone = false): Promise<Task[]> {
  return get<Task[]>(`/kanban/tasks?include_done=${includeDone}`);
}

export function moveTask(taskId: string, status: string): Promise<Task> {
  return patch<Task>(`/kanban/tasks/${taskId}`, { status });
}

export function createTask(
  customer: string,
  title: string,
  status: string,
  github_url?: string,
): Promise<Task> {
  return post<Task>("/kanban/tasks", {
    customer, title, status, github_url,
  });
}

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

export function setTaskTags(
  taskId: string,
  tags: string[]
): Promise<Task> {
  return patch<Task>(`/kanban/tasks/${taskId}/tags`, { tags });
}

export function archiveTask(taskId: string): Promise<void> {
  return del(`/kanban/tasks/${taskId}`);
}

export function fetchArchivedTasks(): Promise<ArchivedTask[]> {
  return get<ArchivedTask[]>("/kanban/archive");
}

export function unarchiveTask(taskId: string): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>(
    `/kanban/archive/${encodeURIComponent(taskId)}/unarchive`,
    {}
  );
}

// Settings

export function fetchSettings(): Promise<Settings> {
  return get<Settings>("/settings");
}

export function fetchAiSettings(): Promise<AiSettings> {
  return get<AiSettings>("/settings/ai");
}

export function updateAiSettings(
  updates: Partial<AiSettings>
): Promise<AiSettings> {
  return patch<AiSettings>("/settings/ai", updates);
}

export function fetchAvailableModels(): Promise<{ models: string[] }> {
  return get<{ models: string[] }>("/settings/ai/models");
}

export function fetchClaudeCliStatus(): Promise<{
  installed: boolean;
  authenticated: boolean;
  version: string;
  path: string;
}> {
  return get("/settings/ai/claude_cli");
}

export function fetchPaths(): Promise<Record<string, string>> {
  return get("/settings/paths");
}

export function fetchProfiles(): Promise<{
  active: string;
  profiles: string[];
}> {
  return get("/settings/profiles");
}

export function switchProfile(
  profile: string
): Promise<{ profile: string; message: string }> {
  return put("/settings/profile", { profile });
}

export function createProfile(
  name: string
): Promise<{ name: string }> {
  return post("/settings/profiles", { name });
}

export function updatePaths(updates: {
  org_dir?: string;
  markdown_dir?: string;
  data_dir?: string;
}): Promise<{ message: string }> {
  return patch<{ message: string }>("/settings/paths", updates);
}

export function switchBackend(
  backend: string
): Promise<{ backend: string; message: string }> {
  return put("/settings/backend", { backend });
}

export function fetchKbSources(): Promise<
  { label: string; path: string }[]
> {
  return get("/settings/kb_sources");
}

export function updateKbSources(
  sources: { label: string; path: string }[]
): Promise<{ label: string; path: string }[]> {
  return put("/settings/kb_sources", sources);
}

export function addTag(
  name: string,
  color: string,
  description = ""
): Promise<{ name: string; color: string; description: string }> {
  return post("/settings/tags", { name, color, description });
}

export function updateTag(
  name: string,
  updates: { color?: string; description?: string }
): Promise<{ name: string; color: string; description: string }> {
  return patch(`/settings/tags/${encodeURIComponent(name)}`, updates);
}

export function deleteTag(name: string): Promise<void> {
  return del(`/settings/tags/${encodeURIComponent(name)}`);
}

export function addCustomerType(name: string): Promise<void> {
  return post("/settings/customer_types", { name });
}

export function deleteCustomerType(name: string): Promise<void> {
  return del(`/settings/customer_types/${encodeURIComponent(name)}`);
}

export function reorderStates(names: string[]): Promise<unknown> {
  return fetch(`${BASE}/settings/states/order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(names),
  }).then((r) => {
    if (!r.ok) throw new Error(`PUT /settings/states/order: ${r.status}`);
    return r.json();
  });
}

// Clocks

export function fetchActiveTimer(): Promise<ActiveTimer> {
  return get<ActiveTimer>("/clocks/active");
}

export function fetchTodayEntries(): Promise<ClockEntry[]> {
  return get<ClockEntry[]>("/clocks/entries?period=today");
}

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

export function fetchCustomerClockEntries(
  customer: string,
  period = "all",
): Promise<ClockEntry[]> {
  return get<ClockEntry[]>(
    `/clocks/entries?period=${period}` +
    `&customer=${encodeURIComponent(customer)}`
  );
}

export function fetchTaskClockEntries(
  taskId: string
): Promise<ClockEntry[]> {
  return get<ClockEntry[]>(
    `/clocks/entries?task_id=${encodeURIComponent(taskId)}`
  );
}

export function startTimer(
  customer: string,
  description: string,
  taskId?: string,
  contract?: string,
): Promise<ClockEntry> {
  return post<ClockEntry>("/clocks/start", {
    customer,
    description,
    task_id: taskId ?? null,
    contract: contract ?? null,
  });
}

export function stopTimer(): Promise<ClockEntry> {
  return post<ClockEntry>("/clocks/stop", {});
}

export function quickBook(
  duration: string,
  customer: string,
  description: string,
  taskId?: string,
  contract?: string,
): Promise<ClockEntry> {
  return post<ClockEntry>("/clocks/quick-book", {
    duration,
    customer,
    description,
    task_id: taskId ?? null,
    contract: contract ?? null,
  });
}

export function updateClockEntry(
  startIso: string,
  updates: {
    customer?: string;
    description?: string;
    hours?: number;
    new_date?: string;
    task_id?: string;
    booked?: boolean;
    notes?: string;
    contract?: string;
  }
): Promise<ClockEntry> {
  const qs = encodeURIComponent(startIso);
  return patch<ClockEntry>(`/clocks/entries?start=${qs}`, updates);
}

export function deleteClockEntry(startIso: string): Promise<void> {
  const qs = encodeURIComponent(startIso);
  return del(`/clocks/entries?start=${qs}`);
}

// Inbox

export function fetchInboxItems(): Promise<InboxItem[]> {
  return get<InboxItem[]>("/inbox/");
}

export function captureInboxItem(
  text: string,
  type?: string,
  customer?: string,
  body?: string,
  channel?: string,
  direction?: string,
): Promise<InboxItem> {
  return post<InboxItem>("/inbox/capture", {
    text, type, customer, body, channel, direction,
  });
}

export function deleteInboxItem(itemId: string): Promise<void> {
  return del(`/inbox/${itemId}`);
}

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

export function promoteInboxItem(
  itemId: string,
  customer: string
): Promise<Task> {
  return post<Task>(`/inbox/${itemId}/promote`, { customer });
}

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

// Customers

export function fetchCustomers(
  includeInactive = false
): Promise<Customer[]> {
  return get<Customer[]>(
    `/customers/?include_inactive=${includeInactive}`
  );
}

export function createCustomer(data: {
  name: string;
  status?: string;
  budget?: number;
  repo?: string | null;
}): Promise<Customer> {
  return post<Customer>("/customers/", data);
}

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

export function fetchContracts(
  customerName: string,
): Promise<Contract[]> {
  return get<Contract[]>(
    `/customers/${encodeURIComponent(customerName)}/contracts`
  );
}

export function addContract(
  customerName: string,
  data: {
    name: string;
    budget: number;
    start_date: string;
    notes?: string;
  },
): Promise<Contract> {
  return post<Contract>(
    `/customers/${encodeURIComponent(customerName)}/contracts`,
    data
  );
}

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
  },
): Promise<Contract> {
  return patch<Contract>(
    `/customers/${encodeURIComponent(customerName)}/contracts/` +
      contractName,
    updates
  );
}

export function deleteContract(
  customerName: string,
  contractName: string,
): Promise<void> {
  return del(
    `/customers/${encodeURIComponent(customerName)}/contracts/` +
      contractName
  );
}

// Dashboard

export function fetchDashboard(): Promise<Dashboard> {
  return get<Dashboard>("/dashboard/");
}

// Knowledge

export function fetchKnowledgeTree(): Promise<KnowledgeFile[]> {
  return get<KnowledgeFile[]>("/knowledge/tree");
}

export function fetchKnowledgeFile(
  path: string
): Promise<{ path: string; content: string }> {
  return get<{ path: string; content: string }>(
    `/knowledge/file?path=${encodeURIComponent(path)}`
  );
}

export function searchKnowledge(q: string): Promise<KnowledgeSearchResult[]> {
  return get<KnowledgeSearchResult[]>(
    `/knowledge/search?q=${encodeURIComponent(q)}`
  );
}

export function saveKnowledgeFile(
  label: string,
  path: string,
  content: string
): Promise<KnowledgeFile> {
  return fetch(`${BASE}/knowledge/file`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, path, content }),
  }).then((res) => {
    if (!res.ok) throw new Error(`PUT /knowledge/file: ${res.status}`);
    return res.json() as Promise<KnowledgeFile>;
  });
}

export function deleteKnowledgeFile(path: string): Promise<void> {
  return del(`/knowledge/file?path=${encodeURIComponent(path)}`);
}

export function renameKnowledgeFile(
  oldPath: string,
  newPath: string,
): Promise<KnowledgeFile> {
  return post<KnowledgeFile>("/knowledge/rename", {
    old_path: oldPath,
    new_path: newPath,
  });
}

export function moveKnowledgeFile(
  oldPath: string,
  oldLabel: string,
  newLabel: string,
  newPath?: string,
): Promise<KnowledgeFile> {
  return post<KnowledgeFile>("/knowledge/move", {
    old_path: oldPath,
    old_label: oldLabel,
    new_label: newLabel,
    new_path: newPath ?? null,
  });
}

// Notes

export function fetchNotes(): Promise<NoteItem[]> {
  return get<NoteItem[]>("/notes/");
}

export function addNote(data: {
  title: string;
  body?: string;
  customer?: string | null;
  task_id?: string | null;
  tags?: string[];
}): Promise<NoteItem> {
  return post<NoteItem>("/notes/", data);
}

export function deleteNote(noteId: string): Promise<void> {
  return del(`/notes/${noteId}`);
}

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

export function promoteNote(
  noteId: string,
  customer: string
): Promise<Task> {
  return post<Task>(`/notes/${noteId}/promote`, { customer });
}

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

// Cron

export function fetchCronJobs(): Promise<CronJob[]> {
  return get<CronJob[]>("/cron/jobs");
}

export function createCronJob(data: {
  id: string;
  name: string;
  schedule: string;
  model: string;
  prompt_content: string;
  output: string;
  timeout: number;
  enabled: boolean;
}): Promise<CronJob> {
  return post<CronJob>("/cron/jobs", data);
}

export function updateCronJob(
  jobId: string,
  updates: Partial<Pick<CronJob, "name" | "schedule" | "model" | "output" | "timeout">>
): Promise<CronJob> {
  return patch<CronJob>(`/cron/jobs/${encodeURIComponent(jobId)}`, updates);
}

export function deleteCronJob(jobId: string): Promise<void> {
  return del(`/cron/jobs/${encodeURIComponent(jobId)}`);
}

export function fetchJobPrompt(
  jobId: string
): Promise<{ content: string; path: string; error?: string }> {
  return get(`/cron/jobs/${encodeURIComponent(jobId)}/prompt`);
}

export function saveJobPrompt(
  jobId: string,
  content: string
): Promise<{ content: string; path: string }> {
  return fetch(`/api/cron/jobs/${encodeURIComponent(jobId)}/prompt`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  }).then((r) => {
    if (!r.ok) throw new Error(`PUT prompt: ${r.status}`);
    return r.json() as Promise<{ content: string; path: string }>;
  });
}

export function triggerCronJob(
  jobId: string
): Promise<{ run_id: number; status: string }> {
  return post<{ run_id: number; status: string }>(
    `/cron/jobs/${encodeURIComponent(jobId)}/trigger`,
    {}
  );
}

export function enableCronJob(jobId: string): Promise<CronJob> {
  return post<CronJob>(
    `/cron/jobs/${encodeURIComponent(jobId)}/enable`,
    {}
  );
}

export function disableCronJob(jobId: string): Promise<CronJob> {
  return post<CronJob>(
    `/cron/jobs/${encodeURIComponent(jobId)}/disable`,
    {}
  );
}

export function deleteCronRun(runId: number): Promise<void> {
  return del(`/cron/history/${runId}`);
}

export function fetchCronHistory(jobId?: string): Promise<CronRun[]> {
  const query = jobId
    ? `?job_id=${encodeURIComponent(jobId)}`
    : "";
  return get<CronRun[]>(`/cron/history${query}`);
}

export function moveCronOutput(
  runId: number,
  destination: "todo" | "note" | "kb",
  opts: { customer?: string; filename?: string } = {}
): Promise<unknown> {
  return post<unknown>(`/cron/history/${runId}/move`, {
    destination,
    customer: opts.customer ?? null,
    filename: opts.filename ?? null,
  });
}

// GitHub

export function fetchGithubIssues(): Promise<GithubIssueGroup[]> {
  return get<GithubIssueGroup[]>("/github/issues");
}

export function fetchGithubSettings(): Promise<GithubSettings> {
  return get<GithubSettings>("/settings/github");
}

export function updateGithubSettings(
  updates: { token?: string; base_url?: string }
): Promise<GithubSettings> {
  return patch<GithubSettings>("/settings/github", updates);
}

// Advisor

export function askAdvisor(
  question: string,
  model: string
): Promise<{ answer: string }> {
  return post<{ answer: string }>("/advisor/ask", { question, model });
}

export function fetchAdvisorSkills(): Promise<
  { name: string; content: string }[]
> {
  return get("/advisor/skills");
}

export function createSkill(
  name: string,
  content: string
): Promise<{ name: string; content: string }> {
  return post("/advisor/skills", { name, content });
}

export function updateSkill(
  name: string,
  content: string
): Promise<{ name: string; content: string }> {
  return put(`/advisor/skills/${encodeURIComponent(name)}`, {
    name,
    content,
  });
}

export function deleteSkill(name: string): Promise<void> {
  return del(
    `/advisor/skills/${encodeURIComponent(name)}`
  );
}

// Advisor personality files

export function fetchAdvisorFiles(): Promise<{
  soul: string;
  user: string;
}> {
  return get("/settings/advisor_files");
}

export function updateAdvisorFiles(
  soul: string,
  user: string
): Promise<{ soul: string; user: string }> {
  return put("/settings/advisor_files", { soul, user });
}

// URL allowlist

export function fetchUrlAllowlist(): Promise<string[]> {
  return get<string[]>("/settings/url_allowlist");
}

export function updateUrlAllowlist(
  domains: string[]
): Promise<string[]> {
  return put<string[]>("/settings/url_allowlist", domains);
}
