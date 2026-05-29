import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateAuditMarkdown,
  classifyPromptIntent,
  loadCorpus,
  mergeAuditMarkdown,
  promptIntentEvalMessages,
  searchMessages,
  summaryToCsv,
  summaryToJson,
  summarizeParsedCorpus,
  userMessageCategoryLabel,
  type LoadedCorpus,
  type ParseCacheMetadata,
  type PromptIntentEvalReview,
  type PromptIntentEvalReviewState,
  type SummaryOptions
} from "@codex-log-viewer/analytics";

export interface ServerOptions {
  host?: string;
  port?: number;
  paths?: string[];
  authToken?: string;
  cacheDir?: string;
  evalsDir?: string;
}

interface CorpusCacheEntry {
  promise: Promise<LoadedCorpus>;
  loaded?: LoadedCorpus;
}

export async function startServer(options: ServerOptions = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3210;
  const keepAlive = setInterval(() => undefined, 60_000);
  const corpusCache = new Map<string, CorpusCacheEntry>();

  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, options, corpusCache);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unexpected server error"
      });
    }
  });

  try {
    await listen(server, port, host);
  } catch (error) {
    clearInterval(keepAlive);
    throw error;
  }
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    url: `http://${host}:${actualPort}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => {
          clearInterval(keepAlive);
          return error ? reject(error) : resolve();
        })
      )
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: ServerOptions,
  corpusCache: Map<string, CorpusCacheEntry>
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (!isAuthorized(request, options.authToken)) {
    sendJson(response, 401, { error: "Unauthorized" });
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/projects") {
    const corpus = await loadCachedCorpus(url, options, corpusCache);
    sendJson(response, 200, withCacheMetadata({ projects: corpus.projects }, corpus.cache));
    return;
  }

  if (url.pathname === "/api/summary") {
    const loaded = await loadCachedCorpus(url, options, corpusCache);
    const summary = summarizeParsedCorpus(loaded.corpus, summaryOptionsFromQuery(url, options.paths));
    sendJson(response, 200, withCacheMetadata({ summary }, loaded.cache));
    return;
  }

  if (url.pathname === "/api/sessions") {
    const loaded = await loadCachedCorpus(url, options, corpusCache);
    const summary = summarizeParsedCorpus(loaded.corpus, summaryOptionsFromQuery(url, options.paths));
    sendJson(response, 200, { sessions: summary.sessions });
    return;
  }

  if (url.pathname === "/api/session") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      sendJson(response, 400, { error: "sessionId is required" });
      return;
    }
    const filePath = url.searchParams.get("filePath") ?? undefined;
    const dateKey = url.searchParams.get("dateKey") ?? undefined;
    const loaded = await loadCachedCorpus(url, options, corpusCache);
    const summaryOptions = summaryOptionsFromQuery(url, options.paths);
    const summary = summarizeParsedCorpus(loaded.corpus, summaryOptions);
    const visibleSession = summary.sessions.find(
      (session) =>
        session.sessionId === sessionId &&
        (!filePath || session.filePath === filePath) &&
        (!dateKey || session.dateKey === dateKey)
    );
    if (!visibleSession) {
      sendJson(response, 404, { error: "Session not found" });
      return;
    }
    const file = loaded.corpus.files.find(
      (candidate) => candidate.sessionId === sessionId && candidate.filePath === visibleSession.filePath
    );
    const session = loaded.corpus.sessions.find(
      (candidate) => candidate.sessionId === sessionId && candidate.filePath === visibleSession.filePath
    );
    if (!file) {
      sendJson(response, 404, { error: "Session not found" });
      return;
    }
    sendJson(response, 200, {
      session,
      file: {
        filePath: file.filePath,
        sessionId: file.sessionId,
        lineCount: file.lineCount
      },
      turns: file.turns,
      messages: file.messages.map((message) => {
        const promptIntent = message.sourceEvent === "event_msg.user_message"
          ? classifyPromptIntent(message.content)
          : undefined;
        return {
          ...message,
          category: message.sourceEvent === "event_msg.user_message"
            ? userMessageCategoryLabel(message.content)
            : undefined,
          promptIntentKey: promptIntent?.key,
          promptIntent: promptIntent?.label
        };
      }),
      tokenUsage: file.tokenUsage,
      taskTimings: file.taskTimings,
      toolEvents: file.toolEvents,
      unknownEvents: file.unknownEvents,
      warnings: file.warnings
    });
    return;
  }

  if (url.pathname === "/api/messages/search") {
    const loaded = await loadCachedCorpus(url, options, corpusCache);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    sendJson(response, 200, withCacheMetadata({
      search: searchMessages(loaded.corpus, {
        ...summaryOptionsFromQuery(url, options.paths),
        query: url.searchParams.get("q") ?? "",
        role: roleFromQuery(url.searchParams.get("role")),
        model: url.searchParams.get("model") ?? undefined,
        sessionId: url.searchParams.get("sessionId") ?? undefined,
        filePath: url.searchParams.get("filePath") ?? undefined,
        dateKey: url.searchParams.get("dateKey") ?? undefined,
        submittedOnly: url.searchParams.get("submittedOnly") === "true",
        hiddenCategories: url.searchParams.getAll("hiddenCategory"),
        limit
      })
    }, loaded.cache));
    return;
  }

  if (url.pathname === "/api/evals/messages") {
    const loaded = await loadCachedCorpus(url, options, corpusCache);
    const reviews = await readEvalReviews(options);
    sendJson(response, 200, withCacheMetadata({
      evals: promptIntentEvalMessages(loaded.corpus, {
        ...summaryOptionsFromQuery(url, options.paths),
        q: url.searchParams.get("q") ?? "",
        categoryKey: url.searchParams.get("categoryKey") ?? undefined,
        reviewState: reviewStateFromQuery(url.searchParams.get("reviewState")),
        limit: Number(url.searchParams.get("limit") ?? 200),
        offset: Number(url.searchParams.get("offset") ?? 0),
        reviews
      })
    }, loaded.cache));
    return;
  }

  if (url.pathname === "/api/evals/reviews" && request.method === "POST") {
    const body = await readJsonBody(request);
    const evalId = typeof body.evalId === "string" ? body.evalId.trim() : "";
    const actualKey = typeof body.actualKey === "string" ? body.actualKey.trim() : "";
    const expectedKey = typeof body.expectedKey === "string" ? body.expectedKey.trim() : "";
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;
    if (!evalId || !actualKey || !expectedKey) {
      sendJson(response, 400, { error: "evalId, actualKey, and expectedKey are required" });
      return;
    }
    const review = await saveEvalReview(options, {
      evalId,
      actualKey,
      expectedKey,
      isCorrect: actualKey === expectedKey,
      reviewedAt: new Date().toISOString(),
      note
    });
    sendJson(response, 200, { review });
    return;
  }

  if (url.pathname === "/api/evals/reviews" && request.method === "DELETE") {
    const evalId = url.searchParams.get("evalId")?.trim();
    if (!evalId) {
      sendJson(response, 400, { error: "evalId is required" });
      return;
    }
    await deleteEvalReview(options, evalId);
    sendJson(response, 200, { review: { evalId, deleted: true } });
    return;
  }

  if (url.pathname === "/api/export") {
    const loaded = await loadCachedCorpus(url, options, corpusCache);
    const summaryOptions = summaryOptionsFromQuery(url, options.paths);
    const summary = summarizeParsedCorpus(loaded.corpus, summaryOptions);
    const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
    const isRawJson = url.searchParams.get("privacy") === "raw";
    const filename = `codex-log-viewer-${summary.project.replaceAll(/[^a-z0-9-]+/gi, "-").toLowerCase()}.${format}`;
    if (format === "csv") {
      sendText(response, 200, summaryToCsv(summary), "text/csv; charset=utf-8", filename);
      return;
    }
    sendText(response, 200, summaryToJson(summary, { redacted: !isRawJson }), "application/json; charset=utf-8", filename);
    return;
  }

  if (url.pathname === "/api/audit" && request.method === "GET") {
    const repoPath = url.searchParams.get("repoPath");
    if (!repoPath) {
      sendJson(response, 400, { error: "repoPath is required" });
      return;
    }
    const loaded = await loadCachedCorpus(url, options, corpusCache);
    const summaryOptions = summaryOptionsFromQuery(url, options.paths);
    const targetPath = auditTargetPath(repoPath);
    const generatedMarkdown = generateAuditMarkdown(loaded.corpus, {
      ...summaryOptions,
      repoPath: resolve(repoPath),
      includeResponses: url.searchParams.get("includeResponses") !== "false",
      privacy: url.searchParams.get("privacy") === "raw" ? "raw" : "public"
    });
    const existingMarkdown = await readOptionalTextFile(targetPath);
    const merge = mergeAuditMarkdown(existingMarkdown, generatedMarkdown);
    sendJson(response, 200, {
      audit: {
        targetPath,
        generatedMarkdown,
        existingMarkdown,
        mergedMarkdown: merge.markdown,
        appendedSections: merge.appendedSections,
        skippedSections: merge.skippedSections,
        existingSections: merge.existingSections,
        generatedSections: merge.generatedSections
      }
    });
    return;
  }

  if (url.pathname === "/api/audit" && request.method === "POST") {
    const body = await readJsonBody(request);
    const repoPath = typeof body.repoPath === "string" ? body.repoPath : undefined;
    const requestedTargetPath = typeof body.targetPath === "string" ? body.targetPath : undefined;
    const markdown = typeof body.markdown === "string" ? body.markdown : undefined;
    if (!repoPath || markdown === undefined) {
      sendJson(response, 400, { error: "repoPath and markdown are required" });
      return;
    }
    const targetPath = auditTargetPath(repoPath);
    if (requestedTargetPath && resolve(requestedTargetPath) !== targetPath) {
      sendJson(response, 400, { error: "targetPath must match the selected repository audit worklog path" });
      return;
    }
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, markdown, "utf8");
    sendJson(response, 200, {
      audit: {
        targetPath,
        bytesWritten: Buffer.byteLength(markdown, "utf8")
      }
    });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function loadCachedCorpus(
  url: URL,
  options: ServerOptions,
  corpusCache: Map<string, CorpusCacheEntry>
): Promise<LoadedCorpus> {
  const paths = pathsFromQuery(url, options.paths);
  const refreshCache = url.searchParams.has("refresh");
  const rebuildCache = url.searchParams.get("rebuild") === "1";
  const cacheDir = options.cacheDir ?? serverCacheDir();
  const key = cacheKey(paths, cacheDir);
  const cached = corpusCache.get(key);

  if (cached && !cached.loaded) {
    return cached.promise;
  }

  if (!refreshCache && !rebuildCache && cached) {
    if (cached.loaded) {
      return Promise.resolve(withReadyCache(cached.loaded));
    }
    return cached.promise;
  }

  const entry: CorpusCacheEntry = {
    promise: loadCorpus({
      paths,
      cacheDir,
      refreshCache,
      rebuildCache
    })
  };
  entry.promise = entry.promise.then((loaded) => {
    entry.loaded = loaded;
    return loaded;
  }).catch((error) => {
    corpusCache.delete(key);
    throw error;
  });
  corpusCache.set(key, entry);
  return entry.promise;
}

function summaryOptionsFromQuery(url: URL, fallbackPaths?: string[]): SummaryOptions {
  return {
    paths: pathsFromQuery(url, fallbackPaths),
    project: projectFromQuery(url),
    since: url.searchParams.get("since") ?? undefined,
    until: url.searchParams.get("until") ?? undefined
  };
}

function projectFromQuery(url: URL): string | undefined {
  const project = url.searchParams.get("project")?.trim();
  return project && project !== "All Projects" ? project : undefined;
}

function pathsFromQuery(url: URL, fallbackPaths?: string[]): string[] | undefined {
  const queryPaths = url.searchParams.getAll("path").filter(Boolean);
  return queryPaths.length > 0 ? queryPaths : fallbackPaths;
}

function auditTargetPath(repoPath: string): string {
  return join(resolve(repoPath), "docs", "ai-worklog.md");
}

async function readOptionalTextFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (!body) {
    return {};
  }
  const parsed = JSON.parse(body);
  return isObject(parsed) ? parsed : {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function roleFromQuery(value: string | null): "all" | "user" | "automation" | "assistant" | "system" | "developer" | "unknown" {
  switch (value) {
    case "user":
    case "automation":
    case "assistant":
    case "system":
    case "developer":
    case "unknown":
      return value;
    default:
      return "all";
  }
}

function reviewStateFromQuery(value: string | null): PromptIntentEvalReviewState {
  switch (value) {
    case "unreviewed":
    case "correct":
    case "incorrect":
      return value;
    default:
      return "all";
  }
}

function cacheKey(paths: string[] | undefined, cacheDir: string | undefined): string {
  const sourceKey = paths && paths.length > 0 ? [...paths].sort().join("\n") : "__default__";
  return `${cacheDir ?? "__no_cache__"}\n${sourceKey}`;
}

function serverCacheDir(): string | undefined {
  return process.env.CODEX_LOG_VIEWER_CACHE_DIR;
}

function evalsDirectory(options: ServerOptions): string | undefined {
  return options.evalsDir ?? process.env.CODEX_LOG_VIEWER_EVALS_DIR;
}

function evalReviewsPath(options: ServerOptions): string | undefined {
  const directory = evalsDirectory(options);
  return directory ? resolve(directory, "reviews-v1.json") : undefined;
}

async function readEvalReviews(options: ServerOptions): Promise<Record<string, PromptIntentEvalReview>> {
  const path = evalReviewsPath(options);
  if (!path) {
    return {};
  }
  try {
    const store = JSON.parse(await readFile(path, "utf8")) as {
      version?: number;
      reviews?: Record<string, PromptIntentEvalReview>;
    };
    return isObject(store.reviews) ? store.reviews : {};
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeEvalReviews(
  options: ServerOptions,
  reviews: Record<string, PromptIntentEvalReview>
): Promise<void> {
  const path = evalReviewsPath(options);
  if (!path) {
    throw new Error("Evals review storage is not configured.");
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ version: 1, reviews }, null, 2)}\n`, "utf8");
}

async function saveEvalReview(options: ServerOptions, review: PromptIntentEvalReview): Promise<PromptIntentEvalReview> {
  const reviews = await readEvalReviews(options);
  reviews[review.evalId] = review;
  await writeEvalReviews(options, reviews);
  return review;
}

async function deleteEvalReview(options: ServerOptions, evalId: string): Promise<void> {
  const reviews = await readEvalReviews(options);
  delete reviews[evalId];
  await writeEvalReviews(options, reviews);
}

function withReadyCache(loaded: LoadedCorpus): LoadedCorpus {
  if (!loaded.cache) {
    return loaded;
  }
  return {
    ...loaded,
    cache: {
      ...loaded.cache,
      cacheStatus: "ready",
      reusedFiles: loaded.cache.totalFiles,
      parsedFiles: 0,
      removedFiles: 0,
      updatedAt: new Date().toISOString()
    }
  };
}

function withCacheMetadata<T extends Record<string, unknown>>(body: T, cache: ParseCacheMetadata | undefined): T & Partial<ParseCacheMetadata> {
  return cache ? { ...body, ...cache } : body;
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value, null, 2));
}

function isAuthorized(request: IncomingMessage, authToken: string | undefined): boolean {
  if (!authToken) {
    return true;
  }

  const authorization = request.headers.authorization;
  if (authorization === `Bearer ${authToken}`) {
    return true;
  }

  const localToken = request.headers["x-codex-log-viewer-token"];
  return localToken === authToken;
}

function sendText(
  response: ServerResponse,
  statusCode: number,
  value: string,
  contentTypeValue: string,
  filename?: string
): void {
  response.writeHead(statusCode, {
    "content-type": contentTypeValue,
    ...(filename ? { "content-disposition": `attachment; filename="${filename}"` } : {})
  });
  response.end(value);
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolvePromise();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }

  return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(entrypoint));
}

if (isMainModule()) {
  const portArg = process.argv.find((arg) => arg.startsWith("--port="));
  const urlFileArg = process.argv.find((arg) => arg.startsWith("--url-file="));
  const authTokenArg = process.argv.find((arg) => arg.startsWith("--auth-token="));
  const cacheDirArg = process.argv.find((arg) => arg.startsWith("--cache-dir="));
  const evalsDirArg = process.argv.find((arg) => arg.startsWith("--evals-dir="));
  const port = portArg ? Number(portArg.split("=")[1]) : Number(process.env.PORT ?? 3210);
  const authToken = authTokenArg?.slice("--auth-token=".length) ?? process.env.CODEX_LOG_VIEWER_AUTH_TOKEN;
  const cacheDir = cacheDirArg?.slice("--cache-dir=".length) ?? process.env.CODEX_LOG_VIEWER_CACHE_DIR;
  const evalsDir = evalsDirArg?.slice("--evals-dir=".length) ?? process.env.CODEX_LOG_VIEWER_EVALS_DIR;
  const server = await startServer({ port, authToken, cacheDir, evalsDir });
  if (urlFileArg) {
    await writeFile(urlFileArg.slice("--url-file=".length), `${server.url}\n`);
  }
  process.stdout.write(`Codex Log Viewer running at ${server.url}\n`);
}
