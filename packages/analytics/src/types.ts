import type {
  MessageRole,
  ParseCacheMetadata,
  ParsedCodexCorpus,
  SessionRecord,
  TokenUsage
} from "@codex-log-viewer/parser";

export type { ParseCacheMetadata };

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
  cacheDir?: string;
  refreshCache?: boolean;
  rebuildCache?: boolean;
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
  dateKey: string;
  project: string;
  cwd?: string;
  firstSeen?: string;
  lastSeen?: string;
  userMessages: number;
  automationMessages: number;
  assistantMessages: number;
  totalTokens: number;
  models: string[];
}

export interface RepeatedUserMessage {
  id: string;
  sample: string;
  category?: string;
  count: number;
  sessionCount: number;
  projects: string[];
  firstSeen?: string;
  lastSeen?: string;
  variants: RepeatedUserMessageVariant[];
}

export interface RepeatedUserMessageVariant {
  sample: string;
  count: number;
  firstSeen?: string;
  lastSeen?: string;
}

export interface PromptIntentCategory {
  key: string;
  label: string;
}

export interface PromptIntentBucket {
  key: string;
  label: string;
  count: number;
  percentage: number;
  sessionCount: number;
  projects: string[];
  examples: string[];
  firstSeen?: string;
  lastSeen?: string;
}

export interface PromptIntentSummary {
  totalMessages: number;
  classifiedMessages: number;
  unclassifiedMessages: number;
  buckets: PromptIntentBucket[];
}

export interface ProjectSummary {
  project: string;
  generatedAt: string;
  activity: {
    firstSeen?: string;
    lastSeen?: string;
  };
  filters: {
    since?: string;
    until?: string;
    paths: string[];
  };
  totals: {
    sessions: number;
    turns: number;
    userMessages: number;
    automationMessages: number;
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
  promptIntents: PromptIntentSummary;
  repeatedUserMessages: RepeatedUserMessage[];
}

export interface MessageSearchOptions extends SummaryOptions {
  query?: string;
  role?: MessageRole | "all";
  model?: string;
  sessionId?: string;
  filePath?: string;
  dateKey?: string;
  submittedOnly?: boolean;
  hiddenCategories?: string[];
  limit?: number;
  offset?: number;
}

export interface MessageSearchResult {
  id: string;
  sessionId: string;
  filePath: string;
  dateKey: string;
  project: string;
  cwd?: string;
  lineNumber?: number;
  turnId?: string;
  model?: string;
  timestamp?: string;
  role: MessageRole;
  sourceEvent: string;
  category?: string;
  promptIntentKey?: string;
  promptIntent?: string;
  snippet: string;
  content: string;
}

export interface MessageSearchSummary {
  query: string;
  project: string;
  generatedAt: string;
  totalMatches: number;
  limit: number;
  offset: number;
  results: MessageSearchResult[];
}

export type PromptIntentEvalReviewState = "all" | "unreviewed" | "correct" | "incorrect";

export interface PromptIntentEvalReview {
  evalId: string;
  actualKey: string;
  expectedKey: string;
  isCorrect: boolean;
  reviewedAt: string;
  note?: string;
}

export interface PromptIntentEvalMessage {
  evalId: string;
  sessionId: string;
  filePath: string;
  dateKey: string;
  project: string;
  cwd?: string;
  lineNumber?: number;
  turnId?: string;
  timestamp?: string;
  promptIntentKey: string;
  promptIntent: string;
  ruleKey: string;
  ruleLabel: string;
  confidence: "high" | "medium" | "low";
  signals: string[];
  snippet: string;
  content: string;
  review?: PromptIntentEvalReview;
}

export interface PromptIntentEvalCategorySummary {
  key: string;
  label: string;
  total: number;
  reviewed: number;
  correct: number;
  incorrect: number;
  unreviewed: number;
  precision: number | null;
  recall: number | null;
}

export interface PromptIntentEvalConfusion {
  actualKey: string;
  actualLabel: string;
  expectedKey: string;
  expectedLabel: string;
  count: number;
}

export interface PromptIntentEvalSummary {
  totalMessages: number;
  reviewedMessages: number;
  correctMessages: number;
  incorrectMessages: number;
  reviewedAccuracy: number | null;
  categories: PromptIntentEvalCategorySummary[];
  confusions: PromptIntentEvalConfusion[];
}

export interface PromptIntentEvalMessageOptions extends SummaryOptions {
  q?: string;
  categoryKey?: string;
  reviewState?: PromptIntentEvalReviewState;
  limit?: number;
  offset?: number;
  reviews?: Record<string, PromptIntentEvalReview>;
}

export interface PromptIntentEvalMessageSummary {
  query: string;
  project: string;
  generatedAt: string;
  totalMatches: number;
  limit: number;
  offset: number;
  summary: PromptIntentEvalSummary;
  results: PromptIntentEvalMessage[];
}

export interface ProjectListItem {
  project: string;
  cwdSamples: string[];
  sessions: number;
  turns: number;
  messages: number;
  totalTokens: number;
  firstSeen?: string;
  lastSeen?: string;
}

export interface LoadedCorpus {
  corpus: ParsedCodexCorpus;
  projects: ProjectListItem[];
  cache?: ParseCacheMetadata;
}

export interface ProjectContext {
  session: SessionRecord | undefined;
  project: string;
  cwd?: string;
}
