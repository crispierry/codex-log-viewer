import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { explainPromptIntent, promptIntentCategories } from "../packages/analytics/dist/index.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultFixturePath = resolve(repoRoot, "fixtures/prompt-intents/gold-labels.json");
const args = parseArgs(process.argv.slice(2));
const fixturePath = resolve(repoRoot, args.fixture ?? defaultFixturePath);
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const result = evaluateFixture(fixture, fixturePath);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  printReport(result);
}

if (result.mismatches.length > 0 || result.accuracy < result.minimumAccuracy) {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--fixture") {
      parsed.fixture = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--fixture=")) {
      parsed.fixture = arg.slice("--fixture=".length);
    }
  }
  return parsed;
}

function evaluateFixture(fixture, fixturePath) {
  const examples = validateFixture(fixture);
  const categoryByKey = new Map(Object.values(promptIntentCategories).map((category) => [category.key, category]));
  const expectedCounts = new Map();
  const predictedCounts = new Map();
  const correctCounts = new Map();
  const ruleCounts = new Map();
  const confidenceCounts = new Map();
  const confusionCounts = new Map();
  const mismatches = [];
  const previousChanges = [];

  for (const example of examples) {
    if (!categoryByKey.has(example.expectedKey)) {
      throw new Error(`Unknown expectedKey for ${example.id}: ${example.expectedKey}`);
    }
    if (example.previousKey && !categoryByKey.has(example.previousKey)) {
      throw new Error(`Unknown previousKey for ${example.id}: ${example.previousKey}`);
    }

    const explanation = explainPromptIntent(example.message);
    const actualKey = explanation.category.key;
    increment(expectedCounts, example.expectedKey);
    increment(predictedCounts, actualKey);
    increment(ruleCounts, explanation.ruleKey);
    increment(confidenceCounts, explanation.confidence);

    if (actualKey === example.expectedKey) {
      increment(correctCounts, example.expectedKey);
    } else {
      increment(confusionCounts, `${example.expectedKey}\t${actualKey}`);
      mismatches.push({
        id: example.id,
        expectedKey: example.expectedKey,
        actualKey,
        ruleKey: explanation.ruleKey,
        confidence: explanation.confidence,
        signals: explanation.signals,
        message: compactMessage(example.message)
      });
    }

    if (example.previousKey && example.previousKey !== actualKey) {
      previousChanges.push({
        id: example.id,
        previousKey: example.previousKey,
        actualKey,
        expectedKey: example.expectedKey,
        status: actualKey === example.expectedKey ? "expected-change" : "unexpected-change"
      });
    }
  }

  const total = examples.length;
  const correct = total - mismatches.length;
  const accuracy = total > 0 ? correct / total : 1;
  const categoryKeys = [...new Set([...expectedCounts.keys(), ...predictedCounts.keys()])].sort();
  const perCategory = categoryKeys.map((key) => {
    const expected = expectedCounts.get(key) ?? 0;
    const predicted = predictedCounts.get(key) ?? 0;
    const correctForCategory = correctCounts.get(key) ?? 0;
    return {
      key,
      label: categoryByKey.get(key)?.label ?? key,
      expected,
      predicted,
      correct: correctForCategory,
      precision: predicted > 0 ? round(correctForCategory / predicted) : null,
      recall: expected > 0 ? round(correctForCategory / expected) : null
    };
  });

  const confusions = [...confusionCounts.entries()]
    .map(([key, count]) => {
      const [expectedKey, actualKey] = key.split("\t");
      return { expectedKey, actualKey, count };
    })
    .sort((a, b) => b.count - a.count || a.expectedKey.localeCompare(b.expectedKey) || a.actualKey.localeCompare(b.actualKey));

  const rules = [...ruleCounts.entries()]
    .map(([ruleKey, count]) => ({ ruleKey, count }))
    .sort((a, b) => b.count - a.count || a.ruleKey.localeCompare(b.ruleKey));

  const confidence = [...confidenceCounts.entries()]
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => a.level.localeCompare(b.level));

  return {
    fixturePath,
    version: fixture.version,
    description: fixture.description,
    total,
    correct,
    accuracy: round(accuracy),
    minimumAccuracy: fixture.minimumAccuracy ?? 1,
    perCategory,
    confusions,
    rules,
    confidence,
    previousChanges,
    mismatches
  };
}

function validateFixture(fixture) {
  if (!fixture || typeof fixture !== "object" || !Array.isArray(fixture.examples)) {
    throw new Error("Fixture must be an object with an examples array.");
  }
  return fixture.examples.map((example, index) => {
    if (!example || typeof example !== "object") {
      throw new Error(`Example ${index + 1} must be an object.`);
    }
    const id = stringField(example, "id", index);
    const message = stringField(example, "message", index);
    const expectedKey = stringField(example, "expectedKey", index);
    const previousKey = optionalStringField(example, "previousKey", index);
    return { id, message, expectedKey, previousKey };
  });
}

function stringField(example, field, index) {
  if (typeof example[field] !== "string") {
    throw new Error(`Example ${index + 1} field ${field} must be a string.`);
  }
  return example[field];
}

function optionalStringField(example, field, index) {
  if (example[field] === undefined) {
    return undefined;
  }
  if (typeof example[field] !== "string") {
    throw new Error(`Example ${index + 1} field ${field} must be a string when present.`);
  }
  return example[field];
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function compactMessage(message) {
  const compacted = message.trim().replace(/\s+/gu, " ");
  return compacted.length > 120 ? `${compacted.slice(0, 117)}...` : compacted;
}

function printReport(result) {
  process.stdout.write("Project Focus Classifier Check\n");
  process.stdout.write(`Fixture: ${result.fixturePath}\n`);
  process.stdout.write(`Examples: ${result.total}\n`);
  process.stdout.write(
    `Accuracy: ${result.correct}/${result.total} (${(result.accuracy * 100).toFixed(1)}%; minimum ${(result.minimumAccuracy * 100).toFixed(1)}%)\n`
  );

  process.stdout.write("\nPer Category\n");
  printTable(
    ["Category", "Expected", "Predicted", "Correct", "Precision", "Recall"],
    result.perCategory.map((category) => [
      category.label,
      category.expected,
      category.predicted,
      category.correct,
      percentage(category.precision),
      percentage(category.recall)
    ])
  );

  process.stdout.write("\nRule Coverage\n");
  printTable(["Rule", "Examples"], result.rules.map((rule) => [rule.ruleKey, rule.count]));

  if (result.previousChanges.length > 0) {
    process.stdout.write("\nKnown Previous-Label Changes\n");
    printTable(
      ["Example", "Previous", "Actual", "Expected", "Status"],
      result.previousChanges.map((change) => [
        change.id,
        change.previousKey,
        change.actualKey,
        change.expectedKey,
        change.status
      ])
    );
  }

  if (result.confusions.length > 0) {
    process.stdout.write("\nConfusions\n");
    printTable(
      ["Expected", "Actual", "Count"],
      result.confusions.map((confusion) => [confusion.expectedKey, confusion.actualKey, confusion.count])
    );
  } else {
    process.stdout.write("\nConfusions\nNone\n");
  }

  if (result.mismatches.length > 0) {
    process.stdout.write("\nMismatches\n");
    printTable(
      ["Example", "Expected", "Actual", "Rule", "Message"],
      result.mismatches.map((mismatch) => [
        mismatch.id,
        mismatch.expectedKey,
        mismatch.actualKey,
        mismatch.ruleKey,
        mismatch.message
      ])
    );
  }
}

function percentage(value) {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
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
