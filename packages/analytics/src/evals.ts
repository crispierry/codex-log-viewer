import { createHash } from "node:crypto";
import type { MessageRecord, ParsedCodexCorpus } from "@codex-log-viewer/parser";
import { explainPromptIntent, promptIntentCategories } from "./prompt-intents.js";
import { projectContextForFile } from "./project.js";
import type {
  PromptIntentEvalCategorySummary,
  PromptIntentEvalMessage,
  PromptIntentEvalMessageOptions,
  PromptIntentEvalMessageSummary,
  PromptIntentEvalReview,
  PromptIntentEvalReviewState,
  SummaryOptions
} from "./types.js";

const allProjectsName = "All Projects";

export function promptIntentEvalMessages(
  corpus: ParsedCodexCorpus,
  options: PromptIntentEvalMessageOptions = {}
): PromptIntentEvalMessageSummary {
  const query = options.q?.trim() ?? "";
  const normalizedQuery = normalizeSearchText(query);
  const project = options.project && options.project !== allProjectsName ? options.project : allProjectsName;
  const categoryKey = options.categoryKey?.trim();
  const reviewState = reviewStateOption(options.reviewState);
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);
  const reviews = options.reviews ?? {};
  const aliases = options.aliases ?? [];
  const range = dateRange(options);

  const baseMessages: PromptIntentEvalMessage[] = [];
  for (const message of corpus.messages) {
    if (message.sourceEvent !== "event_msg.user_message") {
      continue;
    }
    if (!timestampInRange(message.timestamp, range)) {
      continue;
    }
    if (normalizedQuery && !normalizeSearchText(message.content).includes(normalizedQuery)) {
      continue;
    }

    const context = projectContextForFile(message, corpus, aliases);
    if (project !== allProjectsName && context.project !== project) {
      continue;
    }

    const evalId = evalMessageId(message);
    const explanation = explainPromptIntent(message.content);
    const review = reviews[evalId];
    baseMessages.push({
      evalId,
      sessionId: message.sessionId,
      filePath: message.filePath,
      dateKey: localDateKey(message.timestamp),
      project: context.project,
      cwd: context.cwd,
      lineNumber: message.lineNumber,
      turnId: message.turnId,
      timestamp: message.timestamp,
      promptIntentKey: explanation.category.key,
      promptIntent: explanation.category.label,
      ruleKey: explanation.ruleKey,
      ruleLabel: explanation.ruleLabel,
      confidence: explanation.confidence,
      signals: explanation.signals,
      snippet: compactMessage(message.content),
      content: message.content,
      review
    });
  }

  baseMessages.sort(compareEvalMessages);
  const summary = evalSummary(baseMessages);
  const filteredMessages = baseMessages.filter((message) =>
    (!categoryKey || message.promptIntentKey === categoryKey) &&
    reviewStateMatches(message.review, reviewState)
  );

  return {
    query,
    project,
    generatedAt: new Date().toISOString(),
    totalMatches: filteredMessages.length,
    limit,
    offset,
    summary,
    results: filteredMessages.slice(offset, offset + limit)
  };
}

export function evalMessageId(message: MessageRecord): string {
  return createHash("sha256")
    .update([
      message.filePath,
      message.sessionId,
      message.lineNumber ?? "",
      message.turnId ?? "",
      message.timestamp ?? "",
      message.content
    ].join("\0"))
    .digest("hex")
    .slice(0, 24);
}

function evalSummary(messages: PromptIntentEvalMessage[]): PromptIntentEvalMessageSummary["summary"] {
  const categories = new Map<string, PromptIntentEvalCategorySummary>();
  const confusionCounts = new Map<string, number>();
  const expectedReviewedCounts = new Map<string, number>();
  const expectedCorrectCounts = new Map<string, number>();
  let reviewedMessages = 0;
  let correctMessages = 0;
  let incorrectMessages = 0;

  for (const message of messages) {
    const category = ensureCategory(categories, message.promptIntentKey, message.promptIntent);
    category.total += 1;

    if (!message.review) {
      category.unreviewed += 1;
      continue;
    }

    reviewedMessages += 1;
    category.reviewed += 1;
    expectedReviewedCounts.set(message.review.expectedKey, (expectedReviewedCounts.get(message.review.expectedKey) ?? 0) + 1);
    if (message.review.isCorrect) {
      correctMessages += 1;
      category.correct += 1;
      expectedCorrectCounts.set(message.review.expectedKey, (expectedCorrectCounts.get(message.review.expectedKey) ?? 0) + 1);
    } else {
      incorrectMessages += 1;
      category.incorrect += 1;
      const expectedLabel = labelForCategoryKey(message.review.expectedKey);
      const key = `${message.promptIntentKey}\t${message.review.expectedKey}`;
      confusionCounts.set(key, (confusionCounts.get(key) ?? 0) + 1);
      ensureCategory(categories, message.review.expectedKey, expectedLabel);
    }
  }

  return {
    totalMessages: messages.length,
    reviewedMessages,
    correctMessages,
    incorrectMessages,
    reviewedAccuracy: reviewedMessages > 0 ? round(correctMessages / reviewedMessages) : null,
    categories: [...categories.values()]
      .map((category) => {
        const expectedReviewed = expectedReviewedCounts.get(category.key) ?? 0;
        const expectedCorrect = expectedCorrectCounts.get(category.key) ?? 0;
        return {
          ...category,
          precision: category.reviewed > 0 ? round(category.correct / category.reviewed) : null,
          recall: expectedReviewed > 0 ? round(expectedCorrect / expectedReviewed) : null
        };
      })
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    confusions: [...confusionCounts.entries()]
      .map(([key, count]) => {
        const [actualKey, expectedKey] = key.split("\t");
        return {
          actualKey,
          actualLabel: labelForCategoryKey(actualKey),
          expectedKey,
          expectedLabel: labelForCategoryKey(expectedKey),
          count
        };
      })
      .sort((a, b) => b.count - a.count || a.actualLabel.localeCompare(b.actualLabel))
  };
}

function ensureCategory(
  categories: Map<string, PromptIntentEvalCategorySummary>,
  key: string,
  label: string
): PromptIntentEvalCategorySummary {
  const existing = categories.get(key);
  if (existing) {
    return existing;
  }
  const created = {
    key,
    label,
    total: 0,
    reviewed: 0,
    correct: 0,
    incorrect: 0,
    unreviewed: 0,
    precision: null,
    recall: null
  };
  categories.set(key, created);
  return created;
}

function labelForCategoryKey(key: string | undefined): string {
  if (!key) {
    return "";
  }
  const category = Object.values(promptIntentCategories).find((candidate) => candidate.key === key);
  return category?.label ?? key;
}

function reviewStateOption(value: PromptIntentEvalReviewState | undefined): PromptIntentEvalReviewState {
  switch (value) {
    case "unreviewed":
    case "correct":
    case "incorrect":
      return value;
    default:
      return "all";
  }
}

function reviewStateMatches(review: PromptIntentEvalReview | undefined, state: PromptIntentEvalReviewState): boolean {
  switch (state) {
    case "unreviewed":
      return !review;
    case "correct":
      return review?.isCorrect === true;
    case "incorrect":
      return review?.isCorrect === false;
    case "all":
      return true;
  }
}

function compareEvalMessages(a: PromptIntentEvalMessage, b: PromptIntentEvalMessage): number {
  return (b.timestamp ?? "").localeCompare(a.timestamp ?? "") ||
    a.filePath.localeCompare(b.filePath) ||
    a.sessionId.localeCompare(b.sessionId) ||
    (a.lineNumber ?? 0) - (b.lineNumber ?? 0) ||
    a.evalId.localeCompare(b.evalId);
}

function compactMessage(message: string): string {
  const compacted = message.trim().replace(/\s+/gu, " ");
  return compacted.length > 240 ? `${compacted.slice(0, 237)}...` : compacted;
}

function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) {
    return 200;
  }
  return Math.max(1, Math.min(10_000, Math.trunc(limit)));
}

function clampOffset(offset: number | undefined): number {
  if (!offset || Number.isNaN(offset)) {
    return 0;
  }
  return Math.max(0, Math.trunc(offset));
}

function dateRange(options: SummaryOptions): { since?: number; until?: number } {
  return {
    since: options.since ? startOfDate(options.since) : undefined,
    until: options.until ? endOfDate(options.until) : undefined
  };
}

function startOfDate(value: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Date.parse(`${value}T00:00:00.000`);
  }
  return Date.parse(value);
}

function endOfDate(value: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Date.parse(`${value}T23:59:59.999`);
  }
  return Date.parse(value);
}

function timestampInRange(timestamp: string | undefined, range: { since?: number; until?: number }): boolean {
  if (!timestamp) {
    return true;
  }
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) {
    return true;
  }
  if (range.since !== undefined && value < range.since) {
    return false;
  }
  if (range.until !== undefined && value > range.until) {
    return false;
  }
  return true;
}

function localDateKey(timestamp: string | undefined): string {
  if (!timestamp) {
    return "unknown";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
