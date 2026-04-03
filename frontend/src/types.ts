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
