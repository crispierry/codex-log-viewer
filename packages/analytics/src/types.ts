import type {
  ParsedCodexCorpus,
  SessionRecord,
  TokenUsage
} from "@codex-log-viewer/parser";

export interface ProjectAlias {
  name: string;
  match: string[];
}

export interface SummaryOptions {
  paths?: string[];
  project?: string;
  since?: string;
  until?: string;
  aliases?: ProjectAlias[];
}

export interface DateBucket {
  key: string;
  count: number;
  uniqueCount: number;
  tokens: TokenUsage;
}

export interface ModelBucket {
  model: string;
  turns: number;
  tokens: TokenUsage;
}

export interface SessionSummary {
  sessionId: string;
  filePath: string;
  project: string;
  cwd?: string;
  firstSeen?: string;
  lastSeen?: string;
  userMessages: number;
  assistantMessages: number;
  totalTokens: number;
  models: string[];
}

export interface ProjectSummary {
  project: string;
  generatedAt: string;
  filters: {
    since?: string;
    until?: string;
    paths: string[];
  };
  totals: {
    sessions: number;
    turns: number;
    userMessages: number;
    assistantMessages: number;
    uniqueUserMessages: number;
    toolEvents: number;
    unknownEvents: number;
    parseWarnings: number;
  };
  tokens: TokenUsage;
  messagesByDay: DateBucket[];
  messagesByHour: DateBucket[];
  tokensByDay: DateBucket[];
  models: ModelBucket[];
  sessions: SessionSummary[];
}

export interface ProjectListItem {
  project: string;
  cwdSamples: string[];
  sessions: number;
  turns: number;
  messages: number;
  totalTokens: number;
}

export interface LoadedCorpus {
  corpus: ParsedCodexCorpus;
  projects: ProjectListItem[];
}

export interface ProjectContext {
  session: SessionRecord | undefined;
  project: string;
  cwd?: string;
}

