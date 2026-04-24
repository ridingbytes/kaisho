export interface StateChange {
  to: string;
  from: string;
  timestamp: string;
}

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
  state_history?: StateChange[];
}

export interface ArchivedTask extends Task {
  archived_at: string;
  archive_status: string;
  clock_count: number;
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
  inbox_types: string[];
  inbox_channels: string[];
}

export interface AiSettings {
  ollama_url: string;
  ollama_cloud_url: string;
  ollama_api_key: string;
  ollama_api_key_set?: boolean;
  lm_studio_url: string;
  claude_api_key: string;
  claude_api_key_set?: boolean;
  openrouter_url: string;
  openrouter_api_key: string;
  openrouter_api_key_set?: boolean;
  openai_url: string;
  openai_api_key: string;
  openai_api_key_set?: boolean;
  brave_api_key: string;
  brave_api_key_set?: boolean;
  tavily_api_key: string;
  tavily_api_key_set?: boolean;
  advisor_model: string;
  cron_model: string;
}

export interface Contract {
  customer: string;
  name: string;
  budget: number;
  start_date: string;
  end_date: string | null;
  notes: string;
  used_offset: number;
  used: number;
  rest: number;
  billable: boolean;
  invoiced: boolean;
}

export interface ClockEntry {
  customer: string;
  description: string;
  start: string;
  end: string | null;
  duration_minutes: number | null;
  task_id: string | null;
  invoiced: boolean;
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
  color: string;
  tags: string[];
  budget: number;
  used: number;
  rest: number;
  repo: string | null;
  contracts: Contract[];
  properties: Record<string, string>;
}

export interface BudgetSummary {
  name: string;
  budget: number;
  rest: number;
  percent: number;
  contracts: Contract[];
}

export interface Dashboard {
  active_timer: ActiveTimer | null;
  open_task_count: number;
  inbox_count: number;
  budgets: BudgetSummary[];
  month_hours: number;
  budgets_warning: number;
  unassigned_cloud: number;
  aging_inbox: number;
}

export interface KnowledgeFile {
  path: string;
  label: string;
  name: string;
  kind?: "file" | "folder";
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
  task_id: string | null;
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
  use_kaisho_ai?: boolean;
}

export interface CronRun {
  id: number;
  job_id: string;
  model?: string;
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

export interface GithubProjectItem {
  id: string;
  type: string;
  number: number | null;
  title: string;
  state: string;
  url: string;
  status: string | null;
  labels: { name: string; color: string }[];
  item_repo: string;
}

export interface GithubProject {
  id: string;
  title: string;
  url: string;
  closed: boolean;
  status_order: string[];
  items: GithubProjectItem[];
}

export interface GithubProjectGroup {
  customer: string;
  repo: string;
  projects: GithubProject[];
}
