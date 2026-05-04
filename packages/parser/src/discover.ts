import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

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

async function collectJsonlFiles(path: string, files: Set<string>): Promise<void> {
  let info;
  try {
    info = await stat(path);
  } catch {
    return;
  }

  if (info.isFile()) {
    if (path.endsWith(".jsonl")) {
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
      await collectJsonlFiles(join(path, entry.name), files);
    })
  );
}

