import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus, promptIntentEvalFixtureDraft } from "../packages/analytics/dist/index.js";

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
const draft = promptIntentEvalFixtureDraft(loaded.corpus, {
  project: args.project,
  since: args.since,
  until: args.until,
  categoryKey: args.categoryKey,
  reviews,
  includeCorrect: args.includeCorrect,
  includeIncorrect: args.includeIncorrect
});
const output = JSON.stringify(draft, null, 2) + "\n";

if (args.stdout) {
  process.stdout.write(output);
} else {
  const outputPath = resolve(repoRoot, args.output ?? ".codex/evals/project-focus-reviewed-fixture-draft.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
  process.stdout.write(`Exported ${draft.examples.length} reviewed fixture draft examples to ${outputPath}\n`);
  process.stdout.write("Prompt text was not exported. Replace placeholders before copying examples into tracked fixtures.\n");
}

function parseArgs(argv) {
  const parsed = {
    paths: [],
    includeCorrect: true,
    includeIncorrect: true
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stdout") {
      parsed.stdout = true;
      continue;
    }
    if (arg === "--incorrect-only") {
      parsed.includeCorrect = false;
      parsed.includeIncorrect = true;
      continue;
    }
    if (arg === "--correct-only") {
      parsed.includeCorrect = true;
      parsed.includeIncorrect = false;
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
    if (arg === "--output") {
      parsed.output = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      parsed.output = arg.slice("--output=".length);
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
