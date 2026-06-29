import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const args = process.argv.slice(2);

const options = parseArgs(args);
const currentVersion = parseVersion(
  JSON.parse(await readFile(resolve(repoRoot, "app-version.json"), "utf8")),
  "app-version.json"
);

if (options.tag) {
  const expectedTag = `v${formatVersion(currentVersion)}`;
  if (options.tag !== expectedTag) {
    throw new Error(`Expected release tag ${expectedTag}, received ${options.tag}.`);
  }
}

if (options.compareRef) {
  const baseVersion = parseVersion(readVersionFromGit(options.compareRef), `${options.compareRef}:app-version.json`);
  if (options.requirePrMinor) {
    if (onlyWorkflowFilesChanged(options.compareRef)) {
      process.stdout.write("Skipping PR minor version check for workflow-only changes.\n");
    } else {
      const expectedMinor = baseVersion.minor + 1;
      if (currentVersion.major !== baseVersion.major || currentVersion.minor !== expectedMinor) {
        throw new Error(
          `Expected this PR to bump the app version from ${formatVersion(baseVersion)} to ` +
            `${baseVersion.major}.${expectedMinor}.x, received ${formatVersion(currentVersion)}. ` +
            "Run npm run version:pr after updating from the target branch."
        );
      }
    }
  }
}

process.stdout.write(`App version ${formatVersion(currentVersion)} checked.\n`);

function parseArgs(values) {
  const parsed = {
    compareRef: undefined,
    requirePrMinor: false,
    tag: undefined
  };

  for (let index = 0; index < values.length; index += 1) {
    const arg = values[index];
    if (arg === "--compare-ref") {
      parsed.compareRef = requiredValue(values, index, arg);
      index += 1;
    } else if (arg === "--require-pr-minor") {
      parsed.requirePrMinor = true;
    } else if (arg === "--tag") {
      parsed.tag = requiredValue(values, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (parsed.requirePrMinor && !parsed.compareRef) {
    throw new Error("--require-pr-minor requires --compare-ref.");
  }

  return parsed;
}

function requiredValue(values, index, flag) {
  const value = values[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function readVersionFromGit(ref) {
  const raw = execFileSync("git", ["show", `${ref}:app-version.json`], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return JSON.parse(raw);
}

function onlyWorkflowFilesChanged(ref) {
  const raw = execFileSync("git", ["diff", "--name-only", `${ref}...HEAD`], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const changedFiles = raw
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);

  return (
    changedFiles.length > 0 &&
    changedFiles.every((file) => file.startsWith(".github/workflows/"))
  );
}

function parseVersion(raw, label) {
  const patchValue = raw.patch ?? raw.build;
  return {
    major: numericPart(raw.major, `${label} major`),
    minor: numericPart(raw.minor, `${label} minor`),
    patch: numericPart(patchValue, `${label} patch`)
  };
}

function numericPart(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}
