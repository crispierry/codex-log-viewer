export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  freshInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
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

export interface RepeatedUserMessage {
  id: string;
  sample: string;
  category?: string;
  count: number;
  sessionCount: number;
  projects: string[];
  firstSeen?: string;
  lastSeen?: string;
  variants: Array<{
    sample: string;
    count: number;
    firstSeen?: string;
    lastSeen?: string;
  }>;
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

export type MessageRole = "user" | "assistant" | "system" | "developer" | "automation" | "unknown";

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

export interface ToolEvent {
  filePath: string;
  sessionId: string;
  lineNumber?: number;
  turnId?: string;
  timestamp?: string;
  eventType: string;
  name?: string;
  callId?: string;
  content?: string;
  cwd?: string;
  exitCode?: number;
  durationMs?: number;
}

export interface DemoInteraction {
  id: string;
  sessionId: string;
  filePath: string;
  turnId?: string;
  timestamp?: string;
  userMessage: string;
  assistantMessage: string;
  model: string;
  effort?: string;
  promptIntentKey: string;
  promptIntent: string;
  category?: string;
  tokenUsage?: TokenUsage;
  durationMs?: number;
  timeToFirstTokenMs?: number;
  tools: ToolEvent[];
  contextMessages: string[];
}

export interface SessionDetail {
  id: string;
  sessionId: string;
  filePath: string;
  project: string;
  cwd?: string;
  firstSeen?: string;
  lastSeen?: string;
  lineCount: number;
  turns: unknown[];
  messages: unknown[];
  tokenUsage: unknown[];
  taskTimings: unknown[];
  toolEvents: ToolEvent[];
  unknownEvents: unknown[];
  warnings: unknown[];
  interactions: DemoInteraction[];
}

export interface DemoData {
  schemaVersion: number;
  generatedAt: string;
  source: {
    kind: string;
    fixturePath: string;
    privacy: string;
    profiles: Array<{
      project: string;
      promptCount: number;
      basis: string;
    }>;
  };
  links: {
    repository: string;
    releases: string;
    privacyDocs: string;
  };
  projects: ProjectListItem[];
  projectNames: string[];
  summaries: Record<string, ProjectSummary>;
  messages: MessageSearchResult[];
  submittedMessages: MessageSearchResult[];
  sessionDetails: SessionDetail[];
  auditPreview: {
    targetPath: string;
    generatedMarkdown: string;
    appendedSections: number;
    skippedSections: number;
  };
}
