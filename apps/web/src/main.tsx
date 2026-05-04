import { StrictMode, useEffect, useMemo, useState } from "react";
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

function App() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [project, setProject] = useState("All Projects");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [summary, setSummary] = useState<ProjectSummary | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    fetchJson<{ projects: ProjectListItem[] }>("/api/projects")
      .then((data) => setProjects(data.projects))
      .catch((fetchError: Error) => setError(fetchError.message));
  }, []);

  useEffect(() => {
    const query = new URLSearchParams();
    if (project !== "All Projects") query.set("project", project);
    if (since) query.set("since", since);
    if (until) query.set("until", until);
    setLoading(true);
    fetchJson<{ summary: ProjectSummary }>(`/api/summary?${query.toString()}`)
      .then((data) => {
        setSummary(data.summary);
        setError(undefined);
      })
      .catch((fetchError: Error) => setError(fetchError.message))
      .finally(() => setLoading(false));
  }, [project, since, until]);

  const topSessions = useMemo(() => summary?.sessions.slice(0, 15) ?? [], [summary]);

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Codex Log Viewer</h1>
          <p>Local project analytics from Codex JSONL sessions</p>
        </div>
        <div className="status">{loading ? "Scanning logs" : "Ready"}</div>
      </header>

      <section className="controls" aria-label="Filters">
        <label>
          Project
          <select value={project} onChange={(event) => setProject(event.target.value)}>
            <option>All Projects</option>
            {projects.map((item) => (
              <option key={item.project}>{item.project}</option>
            ))}
          </select>
        </label>
        <label>
          Since
          <input type="date" value={since} onChange={(event) => setSince(event.target.value)} />
        </label>
        <label>
          Until
          <input type="date" value={until} onChange={(event) => setUntil(event.target.value)} />
        </label>
      </section>

      {error ? <div className="error">{error}</div> : null}

      {summary ? (
        <>
          <section className="metrics" aria-label="Summary metrics">
            <Metric label="Sessions" value={summary.totals.sessions} />
            <Metric label="User messages" value={summary.totals.userMessages} />
            <Metric label="Unique messages" value={summary.totals.uniqueUserMessages} />
            <Metric label="Total tokens" value={summary.tokens.totalTokens} />
            <Metric label="Input tokens" value={summary.tokens.inputTokens} />
            <Metric label="Cached input" value={summary.tokens.cachedInputTokens} />
            <Metric label="Output tokens" value={summary.tokens.outputTokens} />
            <Metric label="Reasoning tokens" value={summary.tokens.reasoningOutputTokens} />
          </section>

          <section className="grid two">
            <Panel title="Messages By Day">
              <BarChart buckets={summary.messagesByDay} valueKey="count" />
            </Panel>
            <Panel title="Messages By Hour">
              <BarChart buckets={summary.messagesByHour.slice(-48)} valueKey="count" dense />
            </Panel>
          </section>

          <section className="grid two">
            <Panel title="Tokens By Day">
              <BarChart buckets={summary.tokensByDay} valueKey="tokens" />
            </Panel>
            <Panel title="Models">
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Turns</th>
                    <th>Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.models.map((model) => (
                    <tr key={model.model}>
                      <td>{model.model}</td>
                      <td>{formatNumber(model.turns)}</td>
                      <td>{formatNumber(model.tokens.totalTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </section>

          <Panel title="Sessions">
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
                {topSessions.map((session) => (
                  <tr key={session.sessionId}>
                    <td title={session.filePath}>{session.sessionId}</td>
                    <td>{session.project}</td>
                    <td>{formatNumber(session.userMessages)}</td>
                    <td>{formatNumber(session.totalTokens)}</td>
                    <td>{session.lastSeen ? new Date(session.lastSeen).toLocaleString() : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <section className="footnote">
            Unknown events: {formatNumber(summary.totals.unknownEvents)} · Parse warnings:{" "}
            {formatNumber(summary.totals.parseWarnings)}
          </section>
        </>
      ) : null}
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

