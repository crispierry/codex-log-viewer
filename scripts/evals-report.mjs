import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus, promptIntentCategories, promptIntentEvalMessages } from "../packages/analytics/dist/index.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const args = parseArgs(process.argv.slice(2));
const reviewsPath = resolveReviewsPath(args);
const reviews = await readReviews(reviewsPath);
const loaded = await loadCorpus({
  paths: args.paths.length > 0 ? args.paths : undefined,
  project: args.project,
  since: args.since,
  until: args.until
});
const evalMessages = allEvalMessages(loaded.corpus, {
  project: args.project,
  since: args.since,
  until: args.until,
  categoryKey: args.categoryKey,
  reviews
});
const report = summarizeReviewedMessages(evalMessages);
const result = {
  generatedAt: new Date().toISOString(),
  reviewsPath,
  filters: {
    paths: args.paths,
    project: args.project ?? "All Projects",
    since: args.since,
    until: args.until,
    categoryKey: args.categoryKey
  },
  storedReviews: Object.keys(reviews).length,
  reviewedInScope: report.reviewed,
  outOfScopeOrMissingReviews: Math.max(0, Object.keys(reviews).length - report.reviewed),
  totalMessagesInScope: evalMessages.length,
  correct: report.correct,
  incorrect: report.incorrect,
  reviewedAccuracy: report.reviewed > 0 ? round(report.correct / report.reviewed) : null,
  categories: report.categories,
  confusions: report.confusions
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  printReport(result);
}

function parseArgs(argv) {
  const parsed = {
    paths: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--path") {
      parsed.paths.push(resolve(repoRoot, argv[index + 1]));
      index += 1;
      continue;
    }
    if (arg.startsWith("--path=")) {
      parsed.paths.push(resolve(repoRoot, arg.slice("--path=".length)));
      continue;
    }
    if (arg === "--evals-dir") {
      parsed.evalsDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--evals-dir=")) {
      parsed.evalsDir = arg.slice("--evals-dir=".length);
      continue;
    }
    if (arg === "--reviews") {
      parsed.reviews = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--reviews=")) {
      parsed.reviews = arg.slice("--reviews=".length);
      continue;
    }
    if (arg === "--project") {
      parsed.project = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--project=")) {
      parsed.project = arg.slice("--project=".length);
      continue;
    }
    if (arg === "--since") {
      parsed.since = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--since=")) {
      parsed.since = arg.slice("--since=".length);
      continue;
    }
    if (arg === "--until") {
      parsed.until = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--until=")) {
      parsed.until = arg.slice("--until=".length);
      continue;
    }
    if (arg === "--category-key") {
      parsed.categoryKey = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--category-key=")) {
      parsed.categoryKey = arg.slice("--category-key=".length);
    }
  }
  return parsed;
}

function resolveReviewsPath(args) {
  if (args.reviews) {
    return resolve(repoRoot, args.reviews);
  }
  const evalsDir = args.evalsDir ?? process.env.CODEX_LOG_VIEWER_EVALS_DIR ?? defaultEvalsDir();
  return resolve(evalsDir, "reviews-v1.json");
}

function defaultEvalsDir() {
  return resolve(homedir(), "Library/Application Support/Codex Log Viewer/Evals");
}

async function readReviews(path) {
  try {
    const store = JSON.parse(await readFile(path, "utf8"));
    return isObject(store.reviews) ? store.reviews : {};
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function allEvalMessages(corpus, options) {
  const pageSize = 10_000;
  const messages = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = promptIntentEvalMessages(corpus, {
      ...options,
      limit: pageSize,
      offset
    });
    messages.push(...page.results);
    if (page.results.length < pageSize) {
      return messages;
    }
  }
}

function summarizeReviewedMessages(messages) {
  const categories = new Map();
  const expectedReviewedCounts = new Map();
  const expectedCorrectCounts = new Map();
  const confusions = new Map();
  let reviewed = 0;
  let correct = 0;
  let incorrect = 0;

  for (const message of messages) {
    if (!message.review) {
      continue;
    }

    reviewed += 1;
    const expectedKey = message.review.expectedKey;
    const isCorrect = message.promptIntentKey === expectedKey;
    const category = ensureCategory(categories, message.promptIntentKey, message.promptIntent);
    category.reviewed += 1;
    expectedReviewedCounts.set(expectedKey, (expectedReviewedCounts.get(expectedKey) ?? 0) + 1);

    if (isCorrect) {
      correct += 1;
      category.correct += 1;
      expectedCorrectCounts.set(expectedKey, (expectedCorrectCounts.get(expectedKey) ?? 0) + 1);
    } else {
      incorrect += 1;
      category.incorrect += 1;
      const key = `${message.promptIntentKey}\t${expectedKey}`;
      confusions.set(key, (confusions.get(key) ?? 0) + 1);
      ensureCategory(categories, expectedKey, labelForCategoryKey(expectedKey));
    }
  }

  return {
    reviewed,
    correct,
    incorrect,
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
      .filter((category) => category.reviewed > 0 || category.incorrect > 0)
      .sort((a, b) => b.reviewed - a.reviewed || a.label.localeCompare(b.label)),
    confusions: [...confusions.entries()]
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

function ensureCategory(categories, key, label) {
  const existing = categories.get(key);
  if (existing) {
    return existing;
  }
  const category = {
    key,
    label,
    reviewed: 0,
    correct: 0,
    incorrect: 0,
    precision: null,
    recall: null
  };
  categories.set(key, category);
  return category;
}

function labelForCategoryKey(key) {
  const category = Object.values(promptIntentCategories).find((candidate) => candidate.key === key);
  return category?.label ?? key;
}

function printReport(result) {
  process.stdout.write("Project Focus Local Evals Report\n");
  process.stdout.write(`Reviews: ${result.reviewedInScope}/${result.storedReviews} in current scope\n`);
  if (result.outOfScopeOrMissingReviews > 0) {
    process.stdout.write(`Out of scope or missing messages: ${result.outOfScopeOrMissingReviews}\n`);
  }
  process.stdout.write(`Messages in scope: ${result.totalMessagesInScope}\n`);
  process.stdout.write(
    `Reviewed accuracy: ${result.reviewedInScope > 0 ? percentage(result.reviewedAccuracy) : "No reviewed messages"}\n`
  );
  process.stdout.write(`Correct: ${result.correct}\n`);
  process.stdout.write(`Incorrect: ${result.incorrect}\n`);

  if (result.categories.length > 0) {
    process.stdout.write("\nReviewed Categories\n");
    printTable(
      ["Category", "Reviewed", "Correct", "Incorrect", "Precision", "Recall"],
      result.categories.map((category) => [
        category.label,
        category.reviewed,
        category.correct,
        category.incorrect,
        percentage(category.precision),
        percentage(category.recall)
      ])
    );
  }

  process.stdout.write("\nConfusions\n");
  if (result.confusions.length === 0) {
    process.stdout.write("None\n");
  } else {
    printTable(
      ["Classifier", "Expected", "Count"],
      result.confusions.map((confusion) => [confusion.actualLabel, confusion.expectedLabel, confusion.count])
    );
  }
}

function percentage(value) {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function printTable(headers, rows) {
  const stringRows = [headers, ...rows].map((row) => row.map((cell) => String(cell)));
  const widths = headers.map((_, column) => Math.max(...stringRows.map((row) => row[column]?.length ?? 0)));
  for (const [index, row] of stringRows.entries()) {
    process.stdout.write(row.map((cell, column) => cell.padEnd(widths[column])).join("  ") + "\n");
    if (index === 0) {
      process.stdout.write(widths.map((width) => "-".repeat(width)).join("  ") + "\n");
    }
  }
}
