export interface Task {
  id: string;
  customer: string | null;
  title: string;
  status: string;
  tags: string[];
  properties: Record<string, string>;
  created: string;
}

export interface TaskState {
  name: string;
  label: string;
  color: string;
  done: boolean;
}

export interface ConfigTag {
  name: string;
  color: string;
  description: string;
}

export interface Settings {
  task_states: TaskState[];
  tags: ConfigTag[];
}

export interface ClockEntry {
  customer: string;
  description: string;
  start: string;
  end: string | null;
  duration_minutes: number | null;
}

export interface ActiveTimer {
  active: boolean;
  customer?: string;
  description?: string;
  start?: string;
}

export interface InboxItem {
  id: string;
  type: string;
  customer: string | null;
  title: string;
  created: string;
  properties: Record<string, string>;
}

export interface Customer {
  name: string;
  status: string;
  kontingent: number;
  verbraucht: number;
  rest: number;
  repo: string | null;
  has_time_entries: boolean;
  properties: Record<string, string>;
}

export interface TimeEntry {
  id: string;
  description: string;
  hours: number;
  date: string;
}

export interface BudgetSummary {
  name: string;
  kontingent: number;
  rest: number;
  percent: number;
}

export interface Dashboard {
  active_timer: ActiveTimer | null;
  open_task_count: number;
  inbox_count: number;
  budgets: BudgetSummary[];
}
