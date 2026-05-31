import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const IGNORED_DIRECTORIES = new Set(["node_modules", ".git"]);

export function defaultCodexLogRoots(homeDir = homedir()): string[] {
  return [
    join(homeDir, ".codex", "sessions"),
    join(homeDir, ".codex", "archived_sessions")
  ];
}

export async function discoverCodexLogFiles(paths = defaultCodexLogRoots()): Promise<string[]> {
  const files = new Set<string>();

  for (const inputPath of paths) {
    await collectJsonlFiles(resolve(inputPath), files);
  }

  return [...files].sort();
}

async function collectJsonlFiles(rootPath: string, files: Set<string>): Promise<void> {
  const pending = [rootPath];

  while (pending.length > 0) {
    const currentPath = pending.pop() as string;
    let info;
    try {
      info = await stat(currentPath);
    } catch {
      continue;
    }

    if (info.isFile()) {
      if (currentPath.endsWith(".jsonl")) {
        files.add(currentPath);
      }
      continue;
    }

    if (!info.isDirectory()) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const entryPath = join(currentPath, entry.name);
      if (entry.isFile() && entryPath.endsWith(".jsonl")) {
        files.add(entryPath);
      } else if (entry.isDirectory() || entry.isSymbolicLink()) {
        pending.push(entryPath);
      }
    }
  }
}
