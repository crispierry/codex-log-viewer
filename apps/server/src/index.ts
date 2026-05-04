import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCorpus,
  projectsFromCorpus,
  summarizeParsedCorpus,
  type SummaryOptions
} from "@codex-log-viewer/analytics";

export interface ServerOptions {
  host?: string;
  port?: number;
  paths?: string[];
  webDir?: string;
  openUrl?: boolean;
}

export async function startServer(options: ServerOptions = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3210;
  const webDir = options.webDir ?? defaultWebDir();

  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, { ...options, webDir });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unexpected server error"
      });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    url: `http://${host}:${actualPort}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, options: ServerOptions): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/projects") {
    const corpus = await loadCorpus({ paths: pathsFromQuery(url, options.paths) });
    sendJson(response, 200, { projects: corpus.projects });
    return;
  }

  if (url.pathname === "/api/summary") {
    const loaded = await loadCorpus({ paths: pathsFromQuery(url, options.paths) });
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
    const loaded = await loadCorpus({ paths: pathsFromQuery(url, options.paths) });
    const summary = summarizeParsedCorpus(loaded.corpus, summaryOptionsFromQuery(url, options.paths));
    sendJson(response, 200, { sessions: summary.sessions });
    return;
  }

  await serveStatic(url.pathname, response, options.webDir ?? defaultWebDir());
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

async function serveStatic(pathname: string, response: ServerResponse, webDir: string): Promise<void> {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const candidate = normalize(join(webDir, safePath));
  const normalizedWebDir = normalize(webDir);

  if (!candidate.startsWith(normalizedWebDir)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  if (!existsSync(candidate)) {
    const indexPath = join(webDir, "index.html");
    if (existsSync(indexPath)) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      createReadStream(indexPath).pipe(response);
      return;
    }
    sendJson(response, 404, { error: "Dashboard assets not found. Run npm run build first." });
    return;
  }

  response.writeHead(200, { "content-type": contentType(candidate) });
  createReadStream(candidate).pipe(response);
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value, null, 2));
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function defaultWebDir(): string {
  return fileURLToPath(new URL("../../web/dist", import.meta.url));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const portArg = process.argv.find((arg) => arg.startsWith("--port="));
  const port = portArg ? Number(portArg.split("=")[1]) : Number(process.env.PORT ?? 3210);
  const server = await startServer({ port });
  process.stdout.write(`Codex Log Viewer running at ${server.url}\n`);
}

