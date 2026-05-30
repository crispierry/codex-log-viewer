import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ProviderFilter } from "./types.js";

export function defaultCodexLogRoots(homeDir = homedir()): string[] {
  return [
    join(homeDir, ".codex", "sessions"),
    join(homeDir, ".codex", "archived_sessions")
  ];
}

export async function discoverCodexLogFiles(paths = defaultCodexLogRoots()): Promise<string[]> {
  return discoverLogFiles(paths, "codex");
}

export async function discoverLogFiles(paths = defaultCodexLogRoots(), provider: ProviderFilter = "all"): Promise<string[]> {
  const files = new Set<string>();

  for (const inputPath of paths) {
    await collectLogFiles(resolve(inputPath), files, provider, true);
  }

  return [...files].sort();
}

async function collectLogFiles(path: string, files: Set<string>, provider: ProviderFilter, explicitInput = false): Promise<void> {
  let info;
  try {
    info = await stat(path);
  } catch {
    return;
  }

  if (info.isFile()) {
    if (isSupportedLogFile(path, provider, explicitInput)) {
      files.add(path);
    }
    return;
  }

  if (!info.isDirectory()) {
    return;
  }

  const entries = await readdir(path, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name === "node_modules" || entry.name === ".git") {
        return;
      }
      await collectLogFiles(join(path, entry.name), files, provider);
    })
  );
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
