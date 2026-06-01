import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ProviderFilter } from "./types.js";

const IGNORED_DIRECTORIES = new Set(["node_modules", ".git"]);

export function defaultCodexLogRoots(homeDir = homedir()): string[] {
  return [
    join(homeDir, ".codex", "sessions"),
    join(homeDir, ".codex", "archived_sessions")
  ];
}

export function defaultClaudeLogRoots(homeDir = homedir()): string[] {
  return [
    join(homeDir, ".claude", "projects")
  ];
}

export function defaultCursorLogRoots(homeDir = homedir()): string[] {
  return [
    join(homeDir, "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb"),
    join(homeDir, "Library", "Application Support", "Cursor - Insiders", "User", "globalStorage", "state.vscdb")
  ];
}

export function defaultLogRoots(provider: ProviderFilter = "codex", homeDir = homedir()): string[] {
  switch (provider) {
    case "all":
      return [
        ...defaultCodexLogRoots(homeDir),
        ...defaultClaudeLogRoots(homeDir),
        ...defaultCursorLogRoots(homeDir)
      ];
    case "claude":
      return defaultClaudeLogRoots(homeDir);
    case "cursor":
      return defaultCursorLogRoots(homeDir);
    case "codex":
    default:
      return defaultCodexLogRoots(homeDir);
  }
}

export async function discoverCodexLogFiles(paths = defaultCodexLogRoots()): Promise<string[]> {
  return discoverLogFiles(paths, "codex");
}

export async function discoverLogFiles(
  paths: string[] | undefined = undefined,
  provider: ProviderFilter | undefined = undefined,
  homeDir = homedir()
): Promise<string[]> {
  const files = new Set<string>();
  const effectiveProvider = provider ?? (paths && paths.length > 0 ? "all" : "codex");
  const roots = paths ?? defaultLogRoots(effectiveProvider, homeDir);

  for (const inputPath of roots) {
    await collectLogFiles(resolve(inputPath), files, effectiveProvider, true);
  }

  return [...files].sort();
}

async function collectLogFiles(rootPath: string, files: Set<string>, provider: ProviderFilter, explicitInput = false): Promise<void> {
  const pending = [{ path: rootPath, explicitInput }];

  while (pending.length > 0) {
    const current = pending.pop() as { path: string; explicitInput: boolean };
    let info;
    try {
      info = await stat(current.path);
    } catch {
      continue;
    }

    if (info.isFile()) {
      if (isSupportedLogFile(current.path, provider, current.explicitInput)) {
        files.add(current.path);
      }
      continue;
    }

    if (!info.isDirectory()) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const entryPath = join(current.path, entry.name);
      if (entry.isFile() && isSupportedLogFile(entryPath, provider, false)) {
        files.add(entryPath);
      } else if (entry.isDirectory() || entry.isSymbolicLink()) {
        pending.push({ path: entryPath, explicitInput: false });
      }
    }
  }
}

function isSupportedLogFile(path: string, provider: ProviderFilter, explicitInput: boolean): boolean {
  if (path.endsWith(".jsonl")) {
    return provider === "all" || provider === "codex" || provider === "claude";
  }
  if (path.endsWith(".vscdb")) {
    return (provider === "all" || provider === "cursor") && (explicitInput || isCursorGlobalState(path));
  }
  if (explicitInput && path.endsWith(".md")) {
    return provider === "all" || provider === "cursor";
  }
  return false;
}

function isCursorGlobalState(path: string): boolean {
  return /\/Cursor\/User\/globalStorage\/state\.vscdb$/u.test(path) ||
    /\/User\/globalStorage\/state\.vscdb$/u.test(path);
}
