import type {
  ActiveTimer,
  ClockEntry,
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

// Tasks

export function fetchTasks(includeDone = false): Promise<Task[]> {
  return get<Task[]>(
    `/kanban/tasks?include_done=${includeDone}`
  );
}

export function moveTask(
  taskId: string,
  status: string
): Promise<Task> {
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
