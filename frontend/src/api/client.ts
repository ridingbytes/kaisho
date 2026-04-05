import type {
  ActiveTimer,
  AiSettings,
  ClockEntry,
  CommEntry,
  CronJob,
  CronRun,
  Customer,
  Dashboard,
  GithubIssueGroup,
  InboxItem,
  KnowledgeFile,
  KnowledgeSearchResult,
  NoteItem,
  Settings,
  Task,
  TimeEntry,
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
  customer: string, title: string, status: string
): Promise<Task> {
  return post<Task>("/kanban/tasks", { customer, title, status });
}

export function updateTask(
  taskId: string,
  updates: { title?: string; customer?: string; status?: string }
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

// Clocks

export function fetchActiveTimer(): Promise<ActiveTimer> {
  return get<ActiveTimer>("/clocks/active");
}

export function fetchTodayEntries(): Promise<ClockEntry[]> {
  return get<ClockEntry[]>("/clocks/entries?period=today");
}

export function fetchClockEntries(period: string): Promise<ClockEntry[]> {
  return get<ClockEntry[]>(`/clocks/entries?period=${period}`);
}

export function startTimer(
  customer: string,
  description: string
): Promise<ClockEntry> {
  return post<ClockEntry>("/clocks/start", { customer, description });
}

export function stopTimer(): Promise<ClockEntry> {
  return post<ClockEntry>("/clocks/stop", {});
}

export function quickBook(
  duration: string,
  customer: string,
  description: string
): Promise<ClockEntry> {
  return post<ClockEntry>("/clocks/quick-book", {
    duration,
    customer,
    description,
  });
}

export function updateClockEntry(
  startIso: string,
  updates: {
    customer?: string;
    description?: string;
    hours?: number;
    new_date?: string;
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
  body?: string
): Promise<InboxItem> {
  return post<InboxItem>("/inbox/capture", { text, type, customer, body });
}

export function deleteInboxItem(itemId: string): Promise<void> {
  return del(`/inbox/${itemId}`);
}

export function updateInboxItem(
  itemId: string,
  updates: { title?: string; type?: string; customer?: string; body?: string }
): Promise<InboxItem> {
  return patch<InboxItem>(`/inbox/${itemId}`, updates);
}

export function promoteInboxItem(
  itemId: string,
  customer: string
): Promise<Task> {
  return post<Task>(`/inbox/${itemId}/promote`, { customer });
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
  kontingent?: number;
  repo?: string | null;
}): Promise<Customer> {
  return post<Customer>("/customers/", data);
}

export function updateCustomer(
  name: string,
  updates: Partial<
    Pick<
      Customer,
      "name" | "status" | "kontingent" | "verbraucht" | "rest" | "repo"
    >
  >
): Promise<Customer> {
  return patch<Customer>(
    `/customers/${encodeURIComponent(name)}`,
    updates
  );
}

// Time entries

export function fetchTimeEntries(
  customerName: string
): Promise<TimeEntry[]> {
  return get<TimeEntry[]>(
    `/customers/${encodeURIComponent(customerName)}/entries`
  );
}

export function addTimeEntry(
  customerName: string,
  description: string,
  hours: number,
  date?: string,
): Promise<TimeEntry> {
  return post<TimeEntry>(
    `/customers/${encodeURIComponent(customerName)}/entries`,
    { description, hours, date }
  );
}

export function updateTimeEntry(
  customerName: string,
  entryId: string,
  updates: { description?: string; hours?: number; date?: string },
): Promise<TimeEntry> {
  return patch<TimeEntry>(
    `/customers/${encodeURIComponent(customerName)}/entries/${entryId}`,
    updates
  );
}

export function deleteTimeEntry(
  customerName: string,
  entryId: string,
): Promise<void> {
  return del(
    `/customers/${encodeURIComponent(customerName)}/entries/${entryId}`
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

// Notes

export function fetchNotes(): Promise<NoteItem[]> {
  return get<NoteItem[]>("/notes/");
}

export function addNote(data: {
  title: string;
  body?: string;
  customer?: string | null;
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
    tags?: string[];
  }
): Promise<NoteItem> {
  return patch<NoteItem>(`/notes/${noteId}`, updates);
}

export function promoteNote(noteId: string, customer: string): Promise<Task> {
  return post<Task>(`/notes/${noteId}/promote`, { customer });
}

// Communications

export function fetchComms(params?: {
  customer?: string;
  channel?: string;
  direction?: string;
}): Promise<CommEntry[]> {
  const qs = new URLSearchParams();
  if (params?.customer) qs.set("customer", params.customer);
  if (params?.channel) qs.set("channel", params.channel);
  if (params?.direction) qs.set("direction", params.direction);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return get<CommEntry[]>(`/comm/${query}`);
}

export function addComm(data: {
  subject: string;
  direction: string;
  channel?: string;
  customer?: string;
  body?: string;
  contact?: string;
  type?: string;
  tags?: string[];
}): Promise<CommEntry> {
  return post<CommEntry>("/comm/", data);
}

export function updateComm(
  id: number,
  updates: {
    subject?: string;
    body?: string;
    contact?: string;
    customer?: string;
    type?: string;
    tags?: string[];
  }
): Promise<CommEntry> {
  return patch<CommEntry>(`/comm/${id}`, updates);
}

export function deleteComm(id: number): Promise<void> {
  return del(`/comm/${id}`);
}

export function searchComms(q: string): Promise<CommEntry[]> {
  return get<CommEntry[]>(`/comm/search?q=${encodeURIComponent(q)}`);
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

// GitHub

export function fetchGithubIssues(): Promise<GithubIssueGroup[]> {
  return get<GithubIssueGroup[]>("/github/issues");
}

// Advisor

export function askAdvisor(
  question: string,
  model: string
): Promise<{ answer: string }> {
  return post<{ answer: string }>("/advisor/ask", { question, model });
}
