import type {
  ActiveTimer,
  ClockEntry,
  Customer,
  Dashboard,
  InboxItem,
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

// Settings

export function fetchSettings(): Promise<Settings> {
  return get<Settings>("/settings");
}

// Clocks

export function fetchActiveTimer(): Promise<ActiveTimer> {
  return get<ActiveTimer>("/clocks/active");
}

export function fetchTodayEntries(): Promise<ClockEntry[]> {
  return get<ClockEntry[]>("/clocks/entries?period=today");
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

// Inbox

export function fetchInboxItems(): Promise<InboxItem[]> {
  return get<InboxItem[]>("/inbox/");
}

export function captureInboxItem(
  text: string,
  type?: string,
  customer?: string
): Promise<InboxItem> {
  return post<InboxItem>("/inbox/capture", { text, type, customer });
}

export function deleteInboxItem(itemId: string): Promise<void> {
  return del(`/inbox/${itemId}`);
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

// Dashboard

export function fetchDashboard(): Promise<Dashboard> {
  return get<Dashboard>("/dashboard/");
}
