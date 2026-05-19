import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { defaultCodexLogRoots, discoverCodexLogFiles } from "./discover.js";
import { parseCodexLogFile } from "./parser.js";
import type {
  CachedParsedCodexCorpus,
  ParsedCodexCorpus,
  ParsedCodexFile,
  ParseCacheMetadata,
  ParseOptions
} from "./types.js";

const CACHE_SCHEMA_VERSION = 1;
const PARSER_CACHE_VERSION = "parser-v2";

interface CacheManifest {
  schemaVersion: number;
  parserVersion: string;
  entries: Record<string, CacheManifestEntry>;
}

interface CacheManifestEntry {
  filePath: string;
  cacheFile: string;
  size: number;
  mtimeMs: number;
  sessionId: string;
  lineCount: number;
  updatedAt: string;
}

interface FileFingerprint {
  cacheKey: string;
  filePath: string;
  size: number;
  mtimeMs: number;
  cacheFile: string;
}

interface SourceScope {
  path: string;
  isFile: boolean;
}

export async function parseCodexCorpusWithCache(options: ParseOptions = {}): Promise<CachedParsedCodexCorpus> {
  if (!options.cacheDir) {
    const files = await discoverCodexLogFiles(options.paths);
    const parsedFiles = await Promise.all(files.map((file) => parseCodexLogFile(file)));
    return {
      corpus: corpusFromParsedFiles(parsedFiles),
      cache: cacheMetadata("updated", 0, parsedFiles.length, 0, parsedFiles.length)
    };
  }

  const cacheDirectory = resolve(options.cacheDir);
  const filesDirectory = resolve(cacheDirectory, "files");
  await mkdir(filesDirectory, { recursive: true });

  const discoveredFiles = await canonicalLogFiles(await discoverCodexLogFiles(options.paths));
  const fingerprints = await Promise.all(discoveredFiles.map((filePath) => fingerprintFor(filePath)));
  const activeKeys = new Set(fingerprints.map((fingerprint) => fingerprint.cacheKey));
  const sourceScopes = await scopesFor(options.paths ?? defaultCodexLogRoots());
  const manifest = await readManifest(cacheDirectory);
  let removedFiles = 0;

  for (const [cacheKey, entry] of Object.entries(manifest.entries)) {
    const isActiveScope = isInAnyScope(entry.filePath, sourceScopes);
    const shouldRemove = options.rebuildCache
      ? isActiveScope
      : isActiveScope && !activeKeys.has(cacheKey);
    if (!shouldRemove) {
      continue;
    }
    removedFiles += 1;
    delete manifest.entries[cacheKey];
    await removeCachedFile(filesDirectory, entry.cacheFile);
  }

  const parsedFiles: ParsedCodexFile[] = [];
  let reusedFiles = 0;
  let reparsedFiles = 0;

  for (const fingerprint of fingerprints) {
    const entry = manifest.entries[fingerprint.cacheKey];
    const cached = !options.rebuildCache && entry && sameFingerprint(entry, fingerprint)
      ? await readCachedParsedFile(filesDirectory, entry.cacheFile)
      : undefined;

    if (cached) {
      reusedFiles += 1;
      parsedFiles.push(cached);
      continue;
    }

    const parsed = await parseCodexLogFile(fingerprint.filePath);
    reparsedFiles += 1;
    parsedFiles.push(parsed);
    manifest.entries[fingerprint.cacheKey] = {
      filePath: fingerprint.filePath,
      cacheFile: fingerprint.cacheFile,
      size: fingerprint.size,
      mtimeMs: fingerprint.mtimeMs,
      sessionId: parsed.sessionId,
      lineCount: parsed.lineCount,
      updatedAt: new Date().toISOString()
    };
    await writeCachedParsedFile(filesDirectory, fingerprint.cacheFile, parsed);
  }

  await writeManifest(cacheDirectory, manifest);

  const status = options.rebuildCache
    ? "rebuilt"
    : reparsedFiles > 0 || removedFiles > 0
      ? "updated"
      : "ready";
  return {
    corpus: corpusFromParsedFiles(parsedFiles),
    cache: cacheMetadata(status, reusedFiles, reparsedFiles, removedFiles, parsedFiles.length)
  };
}

export function corpusFromParsedFiles(parsedFiles: ParsedCodexFile[]): ParsedCodexCorpus {
  return {
    files: parsedFiles,
    sessions: parsedFiles.flatMap((file) => file.sessions),
    turns: parsedFiles.flatMap((file) => file.turns),
    messages: parsedFiles.flatMap((file) => file.messages),
    tokenUsage: parsedFiles.flatMap((file) => file.tokenUsage),
    taskTimings: parsedFiles.flatMap((file) => file.taskTimings),
    toolEvents: parsedFiles.flatMap((file) => file.toolEvents),
    unknownEvents: parsedFiles.flatMap((file) => file.unknownEvents),
    warnings: parsedFiles.flatMap((file) => file.warnings)
  };
}

function emptyManifest(): CacheManifest {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    parserVersion: PARSER_CACHE_VERSION,
    entries: {}
  };
}

async function readManifest(cacheDirectory: string): Promise<CacheManifest> {
  try {
    const manifest = JSON.parse(await readFile(resolve(cacheDirectory, "manifest.json"), "utf8")) as CacheManifest;
    if (
      manifest.schemaVersion === CACHE_SCHEMA_VERSION &&
      manifest.parserVersion === PARSER_CACHE_VERSION &&
      manifest.entries &&
      typeof manifest.entries === "object"
    ) {
      return manifest;
    }
  } catch {
    // A missing or malformed manifest simply means the cache is cold.
  }
  return emptyManifest();
}

async function writeManifest(cacheDirectory: string, manifest: CacheManifest): Promise<void> {
  await writeFile(resolve(cacheDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function readCachedParsedFile(filesDirectory: string, cacheFile: string): Promise<ParsedCodexFile | undefined> {
  try {
    const parsed = JSON.parse(await readFile(resolve(filesDirectory, cacheFile), "utf8")) as ParsedCodexFile;
    if (typeof parsed.filePath === "string" && typeof parsed.sessionId === "string") {
      return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function writeCachedParsedFile(filesDirectory: string, cacheFile: string, parsed: ParsedCodexFile): Promise<void> {
  await writeFile(resolve(filesDirectory, cacheFile), `${JSON.stringify(parsed)}\n`, "utf8");
}

async function removeCachedFile(filesDirectory: string, cacheFile: string): Promise<void> {
  await rm(resolve(filesDirectory, cacheFile), { force: true });
}

async function canonicalLogFiles(files: string[]): Promise<string[]> {
  const canonical = new Set<string>();
  await Promise.all(
    files.map(async (filePath) => {
      canonical.add(await canonicalPath(filePath));
    })
  );
  return [...canonical].sort();
}

async function fingerprintFor(filePath: string): Promise<FileFingerprint> {
  const info = await stat(filePath);
  const cacheKey = createHash("sha256").update(filePath).digest("hex");
  return {
    cacheKey,
    filePath,
    size: info.size,
    mtimeMs: info.mtimeMs,
    cacheFile: `${cacheKey}.json`
  };
}

function sameFingerprint(entry: CacheManifestEntry, fingerprint: FileFingerprint): boolean {
  return entry.filePath === fingerprint.filePath &&
    entry.size === fingerprint.size &&
    entry.mtimeMs === fingerprint.mtimeMs &&
    entry.cacheFile === fingerprint.cacheFile;
}

async function scopesFor(paths: string[]): Promise<SourceScope[]> {
  return Promise.all(
    paths.map(async (inputPath) => {
      const resolved = resolve(inputPath);
      try {
        const canonical = await canonicalPath(resolved);
        const info = await stat(canonical);
        return { path: canonical, isFile: info.isFile() };
      } catch {
        return { path: resolved, isFile: resolved.endsWith(".jsonl") };
      }
    })
  );
}

async function canonicalPath(filePath: string): Promise<string> {
  try {
    return await realpath(filePath);
  } catch {
    return resolve(filePath);
  }
}

function isInAnyScope(filePath: string, scopes: SourceScope[]): boolean {
  return scopes.some((scope) => {
    if (scope.isFile) {
      return filePath === scope.path;
    }
    const scoped = relative(scope.path, filePath);
    return scoped === "" || (!scoped.startsWith("..") && !isAbsolute(scoped));
  });
}

function cacheMetadata(
  cacheStatus: ParseCacheMetadata["cacheStatus"],
  reusedFiles: number,
  parsedFiles: number,
  removedFiles: number,
  totalFiles: number
): ParseCacheMetadata {
  return {
    cacheStatus,
    reusedFiles,
    parsedFiles,
    removedFiles,
    totalFiles,
    updatedAt: new Date().toISOString()
  };
}
