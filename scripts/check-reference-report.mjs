import { readFile } from "node:fs/promises";
import { summarizeProject } from "../packages/analytics/dist/index.js";

const parsed = parseArgs(process.argv.slice(2));

if (!parsed.reference) {
  throw new Error("Missing --reference <summary-json>.");
}

const reference = unwrapSummary(JSON.parse(await readFile(parsed.reference, "utf8")));
const actual = await summarizeProject({
  paths: parsed.paths.length > 0 ? parsed.paths : undefined,
  project: parsed.project,
  since: parsed.since,
  until: parsed.until
});
const tolerance = parsed.tolerance;
const failures = [];

compareNumberGroup("totals", actual.totals, reference.totals, [
  "sessions",
  "turns",
  "userMessages",
  "assistantMessages",
  "uniqueUserMessages",
  "toolEvents",
  "unknownEvents",
  "parseWarnings"
]);
compareNumberGroup("tokens", actual.tokens, reference.tokens, [
  "inputTokens",
  "cachedInputTokens",
  "freshInputTokens",
  "outputTokens",
  "reasoningOutputTokens",
  "totalTokens"
]);
compareModelBuckets();
compareBucketCounts("messagesByDay", "count");
compareBucketCounts("messagesByDay", "uniqueCount");
compareBucketTokens("tokensByDay");

if (failures.length > 0) {
  process.stderr.write(`Reference report parity failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Reference report parity passed.\n");
}

function compareNumberGroup(groupName, actualGroup = {}, referenceGroup = {}, keys) {
  for (const key of keys) {
    compareNumber(`${groupName}.${key}`, actualGroup[key], referenceGroup[key]);
  }
}

function compareModelBuckets() {
  const actualModels = new Map((actual.models ?? []).map((model) => [model.model, model]));
  const referenceModels = new Map((reference.models ?? []).map((model) => [model.model, model]));
  for (const [modelName, referenceModel] of referenceModels.entries()) {
    const actualModel = actualModels.get(modelName);
    if (!actualModel) {
      failures.push(`models.${modelName} is missing`);
      continue;
    }
    compareNumber(`models.${modelName}.turns`, actualModel.turns, referenceModel.turns);
    compareNumberGroup(`models.${modelName}.tokens`, actualModel.tokens, referenceModel.tokens, [
      "inputTokens",
      "cachedInputTokens",
      "freshInputTokens",
      "outputTokens",
      "reasoningOutputTokens",
      "totalTokens"
    ]);
  }
}

function compareBucketCounts(bucketName, key) {
  const actualBuckets = new Map((actual[bucketName] ?? []).map((bucket) => [bucket.key, bucket]));
  const referenceBuckets = new Map((reference[bucketName] ?? []).map((bucket) => [bucket.key, bucket]));
  for (const [bucketKey, referenceBucket] of referenceBuckets.entries()) {
    const actualBucket = actualBuckets.get(bucketKey);
    if (!actualBucket) {
      failures.push(`${bucketName}.${bucketKey} is missing`);
      continue;
    }
    compareNumber(`${bucketName}.${bucketKey}.${key}`, actualBucket[key], referenceBucket[key]);
  }
}

function compareBucketTokens(bucketName) {
  const actualBuckets = new Map((actual[bucketName] ?? []).map((bucket) => [bucket.key, bucket]));
  const referenceBuckets = new Map((reference[bucketName] ?? []).map((bucket) => [bucket.key, bucket]));
  for (const [bucketKey, referenceBucket] of referenceBuckets.entries()) {
    const actualBucket = actualBuckets.get(bucketKey);
    if (!actualBucket) {
      failures.push(`${bucketName}.${bucketKey} is missing`);
      continue;
    }
    compareNumberGroup(`${bucketName}.${bucketKey}.tokens`, actualBucket.tokens, referenceBucket.tokens, [
      "inputTokens",
      "cachedInputTokens",
      "freshInputTokens",
      "outputTokens",
      "reasoningOutputTokens",
      "totalTokens"
    ]);
  }
}

function compareNumber(label, actualValue, referenceValue) {
  if (typeof referenceValue !== "number") {
    return;
  }
  if (typeof actualValue !== "number") {
    failures.push(`${label}: actual value is missing`);
    return;
  }

  const allowedDelta = tolerance === 0 ? 0 : Math.max(1, Math.abs(referenceValue) * tolerance);
  const delta = Math.abs(actualValue - referenceValue);
  if (delta > allowedDelta) {
    failures.push(`${label}: expected ${referenceValue}, got ${actualValue}, delta ${delta}`);
  }
}

function unwrapSummary(value) {
  if (value && typeof value === "object" && "summary" in value) {
    return value.summary;
  }
  return value;
}

function parseArgs(argv) {
  const result = {
    reference: undefined,
    paths: [],
    project: undefined,
    since: undefined,
    until: undefined,
    tolerance: 0
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const next = argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith("--") ? next : undefined);
    if (inlineValue === undefined && value === next) {
      index += 1;
    }

    switch (rawKey) {
      case "reference":
        result.reference = value;
        break;
      case "path":
        if (value) {
          result.paths.push(value);
        }
        break;
      case "project":
      case "since":
      case "until":
        result[rawKey] = value;
        break;
      case "tolerance":
        result.tolerance = value ? Number(value) : 0;
        break;
      default:
        throw new Error(`Unknown option --${rawKey}.`);
    }
  }

  if (!Number.isFinite(result.tolerance) || result.tolerance < 0) {
    throw new Error("--tolerance must be a non-negative number.");
  }

  return result;
}
