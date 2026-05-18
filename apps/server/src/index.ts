import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCorpus,
  searchMessages,
  summaryToCsv,
  summarizeParsedCorpus,
  type LoadedCorpus,
  type SummaryOptions
} from "@codex-log-viewer/analytics";

export interface ServerOptions {
  host?: string;
  port?: number;
  paths?: string[];
}

interface CorpusCacheEntry {
  expiresAt: number;
  promise: Promise<LoadedCorpus>;
}

const corpusCache = new Map<string, CorpusCacheEntry>();
const CACHE_TTL_MS = 30_000;

export async function startServer(options: ServerOptions = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3210;
  const keepAlive = setInterval(() => undefined, 60_000);

  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, options);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unexpected server error"
      });
    }
  });

  await listen(server, port, host);
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

async function handleRequest(request: IncomingMessage, response: ServerResponse, options: ServerOptions): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/projects") {
    const corpus = await loadCachedCorpus(url, options.paths);
    sendJson(response, 200, { projects: corpus.projects });
    return;
  }

  if (url.pathname === "/api/summary") {
    const loaded = await loadCachedCorpus(url, options.paths);
    const summaryOptions = summaryOptionsFromQuery(url, options.paths);
    const project = url.searchParams.get("project");
    sendJson(response, 200, {
      summary: summarizeParsedCorpus(loaded.corpus, {
        ...summaryOptions,
        project: project && project !== "All Projects" ? project : undefined
      })
    });
    return;
  }

  if (url.pathname === "/api/sessions") {
    const loaded = await loadCachedCorpus(url, options.paths);
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
    const loaded = await loadCachedCorpus(url, options.paths);
    const file = loaded.corpus.files.find((candidate) => candidate.sessionId === sessionId);
    const session = loaded.corpus.sessions.find((candidate) => candidate.sessionId === sessionId);
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
      messages: file.messages,
      tokenUsage: file.tokenUsage,
      taskTimings: file.taskTimings,
      toolEvents: file.toolEvents,
      unknownEvents: file.unknownEvents,
      warnings: file.warnings
    });
    return;
  }

  if (url.pathname === "/api/messages/search") {
    const loaded = await loadCachedCorpus(url, options.paths);
    const project = url.searchParams.get("project");
    const limit = Number(url.searchParams.get("limit") ?? 100);
    sendJson(response, 200, {
      search: searchMessages(loaded.corpus, {
        ...summaryOptionsFromQuery(url, options.paths),
        project: project && project !== "All Projects" ? project : undefined,
        query: url.searchParams.get("q") ?? "",
        role: "all",
        limit
      })
    });
    return;
  }

  if (url.pathname === "/api/export") {
    const loaded = await loadCachedCorpus(url, options.paths);
    const summary = summarizeParsedCorpus(loaded.corpus, summaryOptionsFromQuery(url, options.paths));
    const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
    const filename = `codex-log-viewer-${summary.project.replaceAll(/[^a-z0-9-]+/gi, "-").toLowerCase()}.${format}`;
    if (format === "csv") {
      sendText(response, 200, summaryToCsv(summary), "text/csv; charset=utf-8", filename);
      return;
    }
    sendText(response, 200, `${JSON.stringify(summary, null, 2)}\n`, "application/json; charset=utf-8", filename);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function loadCachedCorpus(url: URL, fallbackPaths?: string[]): Promise<LoadedCorpus> {
  const paths = pathsFromQuery(url, fallbackPaths);
  const forceRefresh = url.searchParams.has("refresh");
  const key = cacheKey(paths);
  const now = Date.now();
  const cached = corpusCache.get(key);

  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = loadCorpus({ paths }).catch((error) => {
    corpusCache.delete(key);
    throw error;
  });
  corpusCache.set(key, {
    expiresAt: now + CACHE_TTL_MS,
    promise
  });
  return promise;
}

function summaryOptionsFromQuery(url: URL, fallbackPaths?: string[]): SummaryOptions {
  return {
    paths: pathsFromQuery(url, fallbackPaths),
    project: url.searchParams.get("project") ?? undefined,
    since: url.searchParams.get("since") ?? undefined,
    until: url.searchParams.get("until") ?? undefined
  };
}

function pathsFromQuery(url: URL, fallbackPaths?: string[]): string[] | undefined {
  const queryPaths = url.searchParams.getAll("path").filter(Boolean);
  return queryPaths.length > 0 ? queryPaths : fallbackPaths;
}

function cacheKey(paths: string[] | undefined): string {
  return paths && paths.length > 0 ? [...paths].sort().join("\n") : "__default__";
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value, null, 2));
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
  const port = portArg ? Number(portArg.split("=")[1]) : Number(process.env.PORT ?? 3210);
  const server = await startServer({ port });
  if (urlFileArg) {
    await writeFile(urlFileArg.slice("--url-file=".length), `${server.url}\n`);
  }
  process.stdout.write(`Codex Log Viewer running at ${server.url}\n`);
}
