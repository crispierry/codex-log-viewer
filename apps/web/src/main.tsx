import { StrictMode, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  freshInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

interface DateBucket {
  key: string;
  count: number;
  uniqueCount: number;
  tokens: TokenUsage;
}

interface ProjectListItem {
  project: string;
  cwdSamples: string[];
  sessions: number;
  turns: number;
  messages: number;
  totalTokens: number;
}

interface ModelBucket {
  model: string;
  turns: number;
  tokens: TokenUsage;
}

interface SessionSummary {
  sessionId: string;
  filePath: string;
  project: string;
  cwd?: string;
  firstSeen?: string;
  lastSeen?: string;
  userMessages: number;
  assistantMessages: number;
  totalTokens: number;
  models: string[];
}

interface ProjectSummary {
  project: string;
  generatedAt: string;
  totals: {
    sessions: number;
    turns: number;
    userMessages: number;
    assistantMessages: number;
    uniqueUserMessages: number;
    toolEvents: number;
    unknownEvents: number;
    parseWarnings: number;
  };
  tokens: TokenUsage;
  messagesByDay: DateBucket[];
  messagesByHour: DateBucket[];
  tokensByDay: DateBucket[];
  models: ModelBucket[];
  sessions: SessionSummary[];
}

interface SessionDetail {
  file: {
    filePath: string;
    sessionId: string;
    lineCount: number;
  };
  session?: unknown;
  turns: Array<{ turnId: string; model?: string; effort?: string; cwd?: string; timestamp?: string }>;
  messages: Array<{ role: string; sourceEvent: string; content: string; timestamp?: string; phase?: string }>;
  tokenUsage: Array<{ timestamp?: string; usage: TokenUsage; cumulativeUsage?: TokenUsage }>;
  taskTimings: Array<{ turnId: string; durationMs?: number; timeToFirstTokenMs?: number }>;
  toolEvents: unknown[];
  unknownEvents: unknown[];
  warnings: unknown[];
}

function App() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [project, setProject] = useState("All Projects");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [pathDraft, setPathDraft] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [sessionQuery, setSessionQuery] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | undefined>();
  const [summary, setSummary] = useState<ProjectSummary | undefined>();
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const projectsRequestId = useRef(0);
  const summaryRequestId = useRef(0);
  const detailRequestId = useRef(0);

  const queryString = useMemo(
    () => buildQuery({ project, since, until, paths, refreshKey }),
    [project, since, until, paths, refreshKey]
  );

  useEffect(() => {
    const requestId = projectsRequestId.current + 1;
    projectsRequestId.current = requestId;
    const pathQuery = buildPathQuery(paths, refreshKey);
    fetchJson<{ projects: ProjectListItem[] }>(`/api/projects?${pathQuery}`)
      .then((data) => {
        if (projectsRequestId.current !== requestId) return;
        setProjects(data.projects);
      })
      .catch((fetchError: Error) => {
        if (projectsRequestId.current !== requestId) return;
        setError(fetchError.message);
      });
  }, [paths, refreshKey]);

  useEffect(() => {
    const requestId = summaryRequestId.current + 1;
    summaryRequestId.current = requestId;
    setLoading(true);
    fetchJson<{ summary: ProjectSummary }>(`/api/summary?${queryString}`)
      .then((data) => {
        if (summaryRequestId.current !== requestId) return;
        setSummary(data.summary);
        setError(undefined);
        if (selectedSessionId && !data.summary.sessions.some((session) => session.sessionId === selectedSessionId)) {
          setSelectedSessionId(undefined);
          setSessionDetail(undefined);
        }
      })
      .catch((fetchError: Error) => {
        if (summaryRequestId.current !== requestId) return;
        setError(fetchError.message);
      })
      .finally(() => {
        if (summaryRequestId.current !== requestId) return;
        setLoading(false);
      });
  }, [queryString, refreshKey]);

  useEffect(() => {
    if (!selectedSessionId) {
      setSessionDetail(undefined);
      return;
    }
    const requestId = detailRequestId.current + 1;
    detailRequestId.current = requestId;
    const detailQuery = new URLSearchParams(queryString);
    detailQuery.set("sessionId", selectedSessionId);
    setDetailLoading(true);
    fetchJson<SessionDetail>(`/api/session?${detailQuery.toString()}`)
      .then((data) => {
        if (detailRequestId.current !== requestId) return;
        setSessionDetail(data);
      })
      .catch((fetchError: Error) => {
        if (detailRequestId.current !== requestId) return;
        setError(fetchError.message);
      })
      .finally(() => {
        if (detailRequestId.current !== requestId) return;
        setDetailLoading(false);
      });
  }, [selectedSessionId, queryString]);

  const filteredSessions = useMemo(() => {
    const sessions = summary?.sessions ?? [];
    const query = sessionQuery.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) =>
      [session.sessionId, session.project, session.cwd, session.filePath, session.models.join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [summary, sessionQuery]);

  function applyPaths() {
    setPaths(pathDraft.split(/\n|,/).map((path) => path.trim()).filter(Boolean));
    beginFilterChange();
    setProject("All Projects");
  }

  function resetPaths() {
    setPathDraft("");
    setPaths([]);
    beginFilterChange();
    setProject("All Projects");
  }

  function selectProject(nextProject: string) {
    beginFilterChange();
    setProject(nextProject);
  }

  function selectSession(sessionId: string) {
    detailRequestId.current += 1;
    setSessionDetail(undefined);
    setSelectedSessionId(sessionId);
  }

  function clearSelection() {
    detailRequestId.current += 1;
    setSelectedSessionId(undefined);
    setSessionDetail(undefined);
    setDetailLoading(false);
    setSessionQuery("");
  }

  function beginFilterChange() {
    clearSelection();
    setSummary(undefined);
    setError(undefined);
    setLoading(true);
  }

  function exportUrl(format: "json" | "csv") {
    const exportQuery = new URLSearchParams(queryString);
    exportQuery.set("format", format);
    return `/api/export?${exportQuery.toString()}`;
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Codex Log Viewer</h1>
          <p>Everything runs locally. Pick sources, explore projects, inspect sessions, and export from here.</p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => {
            clearSelection();
            setRefreshKey((value) => value + 1);
          }}>
            Refresh
          </button>
          <a className="button" href={exportUrl("json")}>JSON</a>
          <a className="button" href={exportUrl("csv")}>CSV</a>
          <span className="status">{loading ? "Scanning" : "Ready"}</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <Panel title="Source">
            <label>
              Log paths
              <textarea
                value={pathDraft}
                onChange={(event) => setPathDraft(event.target.value)}
                placeholder="Default: ~/.codex/sessions and ~/.codex/archived_sessions"
              />
            </label>
            <div className="row">
              <button type="button" onClick={applyPaths}>Apply</button>
              <button type="button" className="secondary" onClick={resetPaths}>Default</button>
            </div>
            <p className="hint">
              Add one file or directory per line. The local server reads these paths; the browser never reads files directly.
            </p>
          </Panel>

          <Panel title="Filters">
            <label>
              Project
              <select value={project} onChange={(event) => selectProject(event.target.value)}>
                <option>All Projects</option>
                {projects.map((item) => (
                  <option key={item.project}>{item.project}</option>
                ))}
              </select>
            </label>
            <label>
              Since
              <input
                type="date"
                value={since}
                onChange={(event) => {
                  beginFilterChange();
                  setSince(event.target.value);
                }}
              />
            </label>
            <label>
              Until
              <input
                type="date"
                value={until}
                onChange={(event) => {
                  beginFilterChange();
                  setUntil(event.target.value);
                }}
              />
            </label>
          </Panel>

          <Panel title="Projects">
            <div className="projectList">
              <button
                type="button"
                className={project === "All Projects" ? "projectItem active" : "projectItem"}
                onClick={() => selectProject("All Projects")}
              >
                <span>All Projects</span>
                <strong aria-label={`${formatNumber(projects.reduce((sum, item) => sum + item.totalTokens, 0))} total tokens`}>
                  <span>{formatNumber(projects.reduce((sum, item) => sum + item.totalTokens, 0))}</span>
                  <em>tokens</em>
                </strong>
              </button>
              {projects.map((item) => (
                <button
                  type="button"
                  key={item.project}
                  className={project === item.project ? "projectItem active" : "projectItem"}
                  onClick={() => selectProject(item.project)}
                >
                  <span>{item.project}</span>
                  <strong aria-label={`${formatNumber(item.totalTokens)} tokens`}>
                    <span>{formatNumber(item.totalTokens)}</span>
                    <em>tokens</em>
                  </strong>
                </button>
              ))}
            </div>
          </Panel>
        </aside>

        <section className="content">
          {error ? <div className="error">{error}</div> : null}

          {!summary && loading ? <div className="empty compact">Scanning selected logs</div> : null}

          {summary ? (
            <>
              <section className="metrics" aria-label="Summary metrics">
                <Metric label="Sessions" value={summary.totals.sessions} />
                <Metric label="User messages" value={summary.totals.userMessages} />
                <Metric label="Unique messages" value={summary.totals.uniqueUserMessages} />
                <Metric label="Total tokens" value={summary.tokens.totalTokens} />
                <Metric label="Fresh input" value={summary.tokens.freshInputTokens} />
                <Metric label="Cached input" value={summary.tokens.cachedInputTokens} />
                <Metric label="Output tokens" value={summary.tokens.outputTokens} />
                <Metric label="Reasoning tokens" value={summary.tokens.reasoningOutputTokens} />
              </section>

              <section className="grid two">
                <Panel title="Messages By Day">
                  <BarChart buckets={summary.messagesByDay} valueKey="count" />
                </Panel>
                <Panel title="Messages By Hour">
                  <BarChart buckets={summary.messagesByHour.slice(-72)} valueKey="count" dense />
                </Panel>
              </section>

              <section className="grid two">
                <Panel title="Tokens By Day">
                  <BarChart buckets={summary.tokensByDay} valueKey="tokens" />
                </Panel>
                <Panel title="Models">
                  <ModelTable models={summary.models} />
                </Panel>
              </section>

              <section className="grid sessionsGrid">
                <Panel title="Sessions">
                  <div className="tableTools">
                    <input
                      value={sessionQuery}
                      onChange={(event) => setSessionQuery(event.target.value)}
                      placeholder="Search sessions"
                    />
                    <span>{formatNumber(filteredSessions.length)} sessions</span>
                  </div>
                  <SessionTable
                    sessions={filteredSessions}
                    selectedSessionId={selectedSessionId}
                    onSelect={selectSession}
                  />
                </Panel>

                <Panel title="Session Details">
                  {detailLoading ? <div className="empty compact">Loading session</div> : null}
                  {!detailLoading && !sessionDetail ? (
                    <div className="empty compact">Select a session</div>
                  ) : null}
                  {!detailLoading && sessionDetail ? <SessionInspector detail={sessionDetail} /> : null}
                </Panel>
              </section>

              <section className="footnote">
                Unknown events: {formatNumber(summary.totals.unknownEvents)} · Parse warnings:{" "}
                {formatNumber(summary.totals.parseWarnings)} · Generated:{" "}
                {new Date(summary.generatedAt).toLocaleString()}
              </section>
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ModelTable({ models }: { models: ModelBucket[] }) {
  if (models.length === 0) return <div className="empty compact">No model data</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>Model</th>
          <th>Turns</th>
          <th>Tokens</th>
        </tr>
      </thead>
      <tbody>
        {models.map((model) => (
          <tr key={model.model}>
            <td>{model.model}</td>
            <td>{formatNumber(model.turns)}</td>
            <td>{formatNumber(model.tokens.totalTokens)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SessionTable({
  sessions,
  selectedSessionId,
  onSelect
}: {
  sessions: SessionSummary[];
  selectedSessionId?: string;
  onSelect: (sessionId: string) => void;
}) {
  if (sessions.length === 0) return <div className="empty compact">No sessions in range</div>;
  return (
    <div className="tableScroll">
      <table>
        <thead>
          <tr>
            <th>Session</th>
            <th>Project</th>
            <th>User Msgs</th>
            <th>Tokens</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.sessionId}
              className={selectedSessionId === session.sessionId ? "selected" : undefined}
              onClick={() => onSelect(session.sessionId)}
            >
              <td title={session.filePath}>{session.sessionId}</td>
              <td>{session.project}</td>
              <td>{formatNumber(session.userMessages)}</td>
              <td>{formatNumber(session.totalTokens)}</td>
              <td>{session.lastSeen ? new Date(session.lastSeen).toLocaleString() : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionInspector({ detail }: { detail: SessionDetail }) {
  const userMessages = detail.messages.filter((message) => message.role === "user");
  const assistantMessages = detail.messages.filter((message) => message.role === "assistant");
  const totalTokens = detail.tokenUsage.reduce((sum, item) => sum + item.usage.totalTokens, 0);

  return (
    <div className="inspector">
      <dl>
        <div>
          <dt>File</dt>
          <dd>{detail.file.filePath}</dd>
        </div>
        <div>
          <dt>Lines</dt>
          <dd>{formatNumber(detail.file.lineCount)}</dd>
        </div>
        <div>
          <dt>Turns</dt>
          <dd>{formatNumber(detail.turns.length)}</dd>
        </div>
        <div>
          <dt>Messages</dt>
          <dd>{formatNumber(userMessages.length)} user · {formatNumber(assistantMessages.length)} assistant</dd>
        </div>
        <div>
          <dt>Tokens</dt>
          <dd>{formatNumber(totalTokens)}</dd>
        </div>
      </dl>

      <h3>Turns</h3>
      <div className="chips">
        {detail.turns.map((turn) => (
          <span key={turn.turnId} title={turn.cwd}>{turn.model ?? "unknown"} · {turn.effort ?? "effort"}</span>
        ))}
      </div>

      <h3>Messages</h3>
      <div className="messageList">
        {detail.messages.slice(0, 20).map((message, index) => (
          <article key={`${message.timestamp}-${index}`} className={`message ${message.role}`}>
            <strong>{message.role}</strong>
            <p>{message.content || message.sourceEvent}</p>
          </article>
        ))}
      </div>

      <details>
        <summary>Parser diagnostics</summary>
        <pre>{JSON.stringify({
          tokenEvents: detail.tokenUsage.length,
          taskTimings: detail.taskTimings.length,
          toolEvents: detail.toolEvents.length,
          unknownEvents: detail.unknownEvents.length,
          warnings: detail.warnings.length
        }, null, 2)}</pre>
      </details>
    </div>
  );
}

function BarChart({
  buckets,
  valueKey,
  dense = false
}: {
  buckets: DateBucket[];
  valueKey: "count" | "tokens";
  dense?: boolean;
}) {
  const values = buckets.map((bucket) => (valueKey === "count" ? bucket.count : bucket.tokens.totalTokens));
  const max = Math.max(1, ...values);
  if (buckets.length === 0) {
    return <div className="empty">No data in range</div>;
  }

  return (
    <div className={dense ? "bars dense" : "bars"}>
      {buckets.map((bucket, index) => {
        const value = values[index];
        return (
          <div className="barWrap" key={bucket.key} title={`${bucket.key}: ${formatNumber(value)}`}>
            <div className="bar" style={{ height: `${Math.max(3, (value / max) * 100)}%` }} />
            {!dense ? <span>{bucket.key.slice(5)}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

function buildQuery({
  project,
  since,
  until,
  paths,
  refreshKey
}: {
  project: string;
  since: string;
  until: string;
  paths: string[];
  refreshKey: number;
}): string {
  const query = new URLSearchParams(buildPathQuery(paths, refreshKey));
  if (project !== "All Projects") query.set("project", project);
  if (since) query.set("since", since);
  if (until) query.set("until", until);
  return query.toString();
}

function buildPathQuery(paths: string[], refreshKey = 0): string {
  const query = new URLSearchParams();
  for (const path of paths) query.append("path", path);
  if (refreshKey > 0) query.set("refresh", String(refreshKey));
  return query.toString();
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
