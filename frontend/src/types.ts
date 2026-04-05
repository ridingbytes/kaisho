export interface Task {
  id: string;
  customer: string | null;
  title: string;
  status: string;
  tags: string[];
  properties: Record<string, string>;
  created: string;
  body: string;
  github_url: string;
}

export interface ArchivedTask extends Task {
  archived_at: string;
  archive_status: string;
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
  customer_types: string[];
}

export interface AiSettings {
  ollama_url: string;
  lm_studio_url: string;
  claude_api_key: string;
  openrouter_url: string;
  openrouter_api_key: string;
  openai_url: string;
  openai_api_key: string;
  advisor_model: string;
  cron_model: string;
}

export interface Contract {
  customer: string;
  name: string;
  kontingent: number;
  start_date: string;
  end_date: string | null;
  notes: string;
  verbraucht_offset: number;
  verbraucht: number;
  rest: number;
}

export interface ClockEntry {
  customer: string;
  description: string;
  start: string;
  end: string | null;
  duration_minutes: number | null;
  task_id: string | null;
  booked: boolean;
  notes: string;
  contract: string | null;
}

export interface ActiveTimer {
  active: boolean;
  customer?: string;
  description?: string;
  start?: string;
  notes?: string;
}

export interface InboxItem {
  id: string;
  type: string;
  customer: string | null;
  title: string;
  body: string;
  created: string;
  channel: string;
  direction: string;
  properties: Record<string, string>;
}

export interface Customer {
  name: string;
  status: string;
  type: string;
  tags: string[];
  kontingent: number;
  verbraucht: number;
  rest: number;
  repo: string | null;
  contracts: Contract[];
  properties: Record<string, string>;
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

export interface KnowledgeFile {
  path: string;
  label: string;
  name: string;
  size: number;
}

export interface KnowledgeSearchResult {
  path: string;
  label: string;
  line_number: number;
  snippet: string;
}

export interface NoteItem {
  id: string;
  title: string;
  customer: string | null;
  body: string;
  tags: string[];
  created: string;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  model: string;
  prompt_file: string;
  output: string;
  timeout: number;
  enabled: boolean;
}

export interface CronRun {
  id: number;
  job_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "error";
  output: string;
  error: string;
}

export interface GithubSettings {
  token: string;
  token_set: boolean;
  base_url: string;
}

export interface GithubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  createdAt: string;
  labels: { name: string; color: string }[];
}

export interface GithubIssueGroup {
  customer: string;
  repo: string;
  issues: GithubIssue[];
}
