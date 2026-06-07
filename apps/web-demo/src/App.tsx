import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Code2,
  Download,
  ExternalLink,
  FileText,
  ListTree,
  Search,
  ShieldCheck,
  Terminal,
  Wrench
} from "lucide-react";
import demoDataRaw from "./data/demo-data.generated.json";
import type {
  DemoData,
  DemoInteraction,
  MessageRole,
  MessageSearchResult,
  ProjectSummary,
  SessionDetail,
  TokenUsage
} from "./types";

type Section = "overview" | "browse" | "search" | "audit";
type SearchRole = MessageRole | "all";

interface BrowseInteraction extends DemoInteraction {
  project: string;
  cwd?: string;
  sessionFirstSeen?: string;
}

const demoData = demoDataRaw as DemoData;
const allProjectsName = "All Projects";
const sections: Array<{ id: Section; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "browse", label: "Browse", icon: ListTree },
  { id: "search", label: "Search", icon: Search },
  { id: "audit", label: "Audit", icon: FileText }
];

export default function App() {
  const [selectedProject, setSelectedProject] = useState(allProjectsName);
  const [selectedSection, setSelectedSection] = useState<Section>("overview");
  const [selectedInteractionId, setSelectedInteractionId] = useState<string>();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<SearchRole>("all");
  const [selectedSearchId, setSelectedSearchId] = useState<string>();

  const summary = demoData.summaries[selectedProject] ?? demoData.summaries[allProjectsName];
  const browseInteractions = useMemo(
    () => interactionsForProject(demoData.sessionDetails, selectedProject),
    [selectedProject]
  );
  const selectedInteraction = browseInteractions.find((item) => item.id === selectedInteractionId) ??
    browseInteractions[0];
  const searchResults = useMemo(
    () => searchMessages(demoData.messages, selectedProject, query, role),
    [selectedProject, query, role]
  );
  const selectedSearchResult = searchResults.find((item) => item.id === selectedSearchId) ?? searchResults[0];
  const selectedTabId = `section-tab-${selectedSection}`;

  useEffect(() => {
    if (!selectedInteraction || selectedInteraction.id === selectedInteractionId) {
      return;
    }
    setSelectedInteractionId(selectedInteraction.id);
  }, [selectedInteraction, selectedInteractionId]);

  useEffect(() => {
    if (!selectedSearchResult || selectedSearchResult.id === selectedSearchId) {
      return;
    }
    setSelectedSearchId(selectedSearchResult.id);
  }, [selectedSearchId, selectedSearchResult]);

  return (
    <div className="site-page">
      <SiteHeader />

      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <img src="./app-icon.svg" alt="" />
            <div>
              <strong>Codex Log Viewer</strong>
              <span>Static synthetic demo</span>
            </div>
          </div>

          <nav className="project-nav" aria-label="Projects">
            <ProjectButton
              active={selectedProject === allProjectsName}
              label={allProjectsName}
              meta={`${demoData.summaries[allProjectsName].totals.sessions} sessions`}
              onClick={() => setSelectedProject(allProjectsName)}
            />
            {demoData.projects.map((project) => (
              <ProjectButton
                key={project.project}
                active={selectedProject === project.project}
                label={project.project}
                meta={`${project.messages} prompts`}
                onClick={() => setSelectedProject(project.project)}
              />
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="source-pill">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>Generated synthetic data</span>
            </div>
            <a className="link-button" href={demoData.links.repository} target="_blank" rel="noreferrer">
              <Code2 size={17} aria-hidden="true" />
              <span>Repository</span>
              <ExternalLink size={14} aria-hidden="true" />
            </a>
            <a className="link-button" href={demoData.links.releases} target="_blank" rel="noreferrer">
              <Download size={17} aria-hidden="true" />
              <span>Download app</span>
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </aside>

        <main className="workspace">
          <header className="workspace-header">
            <div className="workspace-title">
              <h1>{summary.project}</h1>
              <p>{activityRange(summary)} · {demoData.source.fixturePath}</p>
            </div>

            <div className="section-tabs" role="tablist" aria-label="Sections">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    className={section.id === selectedSection ? "active" : ""}
                    id={`section-tab-${section.id}`}
                    role="tab"
                    aria-controls="section-panel"
                    aria-selected={section.id === selectedSection}
                    type="button"
                    onClick={() => setSelectedSection(section.id)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {section.label}
                  </button>
                );
              })}
            </div>
          </header>

          <div id="section-panel" role="tabpanel" aria-labelledby={selectedTabId}>
            {selectedSection === "overview" && <Overview summary={summary} />}
            {selectedSection === "browse" && (
              <Browse
                interactions={browseInteractions}
                selectedInteraction={selectedInteraction}
                onSelect={setSelectedInteractionId}
              />
            )}
            {selectedSection === "search" && (
              <SearchSection
                query={query}
                role={role}
                results={searchResults}
                selectedResult={selectedSearchResult}
                onQueryChange={setQuery}
                onRoleChange={setRole}
                onSelect={setSelectedSearchId}
              />
            )}
            {selectedSection === "audit" && <Audit summary={summary} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function SiteHeader() {
  const links = [
    { label: "Ask Me Anything", href: "/ask" },
    { label: "Writing", href: "/writing" },
    { label: "Notes", href: "/posts" },
    { label: "Projects", href: "/projects" },
    { label: "Photography", href: "/photography" }
  ];

  return (
    <header className="site-header">
      <div className="site-top-bar" />
      <div className="site-nav">
        <a className="site-brand" href="/">
          <span className="site-logo-mark" aria-hidden="true" />
          <span>Cristiano Pierry</span>
        </a>
        <nav className="site-links" aria-label="Personal website">
          {links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="site-network-band" aria-hidden="true">
        <span className="network-node node-a" />
        <span className="network-node node-b" />
        <span className="network-node node-c" />
        <span className="network-node node-d" />
      </div>
    </header>
  );
}

function ProjectButton(props: {
  active: boolean;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      className={props.active ? "project-button active" : "project-button"}
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      <span>{props.label}</span>
      <small>{props.meta}</small>
    </button>
  );
}

function Overview({ summary }: { summary: ProjectSummary }) {
  const maxDailyMessages = Math.max(...summary.messagesByDay.map((bucket) => bucket.count), 1);
  const maxIntentCount = Math.max(...summary.promptIntents.buckets.map((bucket) => bucket.count), 1);
  const maxModelTokens = Math.max(...summary.models.map((model) => model.tokens.totalTokens), 1);

  return (
    <section className="section-stack">
      <div className="metrics-grid">
        <Metric icon={<Activity size={18} />} label="Sessions" value={formatNumber(summary.totals.sessions)} />
        <Metric icon={<ListTree size={18} />} label="User prompts" value={formatNumber(summary.totals.userMessages)} />
        <Metric icon={<BarChart3 size={18} />} label="Total tokens" value={formatCompact(summary.tokens.totalTokens)} />
        <Metric icon={<Search size={18} />} label="Unique prompts" value={formatNumber(summary.totals.uniqueUserMessages)} />
        <Metric icon={<Wrench size={18} />} label="Tool events" value={formatNumber(summary.totals.toolEvents)} />
        <Metric icon={<Terminal size={18} />} label="Warnings" value={formatNumber(summary.totals.parseWarnings)} tone="warn" />
      </div>

      <div className="overview-grid">
        <Panel title="Activity By Day">
          <div className="bar-list">
            {summary.messagesByDay.map((bucket) => (
              <BarRow
                key={bucket.key}
                label={shortDate(bucket.key)}
                value={`${bucket.count} prompts`}
                width={(bucket.count / maxDailyMessages) * 100}
                tone="teal"
              />
            ))}
          </div>
        </Panel>

        <Panel title="Model Usage">
          <div className="bar-list">
            {summary.models.map((model) => (
              <BarRow
                key={model.model}
                label={model.model}
                value={`${formatCompact(model.tokens.totalTokens)} tokens`}
                width={(model.tokens.totalTokens / maxModelTokens) * 100}
                tone="blue"
              />
            ))}
          </div>
        </Panel>

        <Panel title="Project Focus">
          <div className="bar-list">
            {summary.promptIntents.buckets.slice(0, 7).map((bucket) => (
              <BarRow
                key={bucket.key}
                label={bucket.label}
                value={`${bucket.count} · ${bucket.percentage}%`}
                width={(bucket.count / maxIntentCount) * 100}
                tone="gold"
              />
            ))}
          </div>
        </Panel>

        <Panel title="Repeated Prompts">
          <div className="repeat-list">
            {summary.repeatedUserMessages.length > 0 ? summary.repeatedUserMessages.map((item) => (
              <div className="repeat-row" key={item.id}>
                <strong>{item.sample}</strong>
                <span>{item.count} uses across {item.sessionCount} sessions</span>
              </div>
            )) : (
              <EmptyState>No repeated prompts in this project slice.</EmptyState>
            )}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function Browse(props: {
  interactions: BrowseInteraction[];
  selectedInteraction?: BrowseInteraction;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="browser-grid">
      <div className="list-panel">
        <div className="panel-heading">
          <h2>Submitted Prompts</h2>
          <span>{props.interactions.length}</span>
        </div>
        <div className="prompt-list">
          {props.interactions.map((interaction) => (
            <button
              key={interaction.id}
              className={interaction.id === props.selectedInteraction?.id ? "prompt-row active" : "prompt-row"}
              type="button"
              onClick={() => props.onSelect(interaction.id)}
            >
              <strong>{interaction.userMessage}</strong>
              <span>{interaction.project} · {formatDateTime(interaction.timestamp)}</span>
              <small>{interaction.promptIntent}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="detail-panel">
        {props.selectedInteraction ? <InteractionDetail interaction={props.selectedInteraction} /> : (
          <EmptyState>No submitted prompts are available for this project.</EmptyState>
        )}
      </div>
    </section>
  );
}

function InteractionDetail({ interaction }: { interaction: BrowseInteraction }) {
  return (
    <div className="interaction-detail">
      <div className="detail-title">
        <div>
          <p>{interaction.project}</p>
          <h2>{interaction.userMessage}</h2>
        </div>
        <span className="intent-badge">{interaction.promptIntent}</span>
      </div>

      <div className="detail-meta">
        <span>{interaction.model}</span>
        <span>{interaction.effort ?? "default"} effort</span>
        <span>{formatDuration(interaction.durationMs)}</span>
        <span>{formatDateTime(interaction.timestamp)}</span>
      </div>

      <div className="response-block">
        <h3>Codex Response</h3>
        <p>{interaction.assistantMessage}</p>
      </div>

      {interaction.contextMessages.length > 0 && (
        <div className="response-block subdued">
          <h3>Context</h3>
          {interaction.contextMessages.map((message) => <p key={message}>{message}</p>)}
        </div>
      )}

      <div className="detail-columns">
        <Panel title="Token Use">
          <TokenStack usage={interaction.tokenUsage} />
        </Panel>
        <Panel title="Tool Activity">
          <div className="tool-list">
            {interaction.tools.length > 0 ? interaction.tools.map((tool, index) => (
              <div className="tool-row" key={`${tool.eventType}-${tool.callId ?? index}`}>
                <Wrench size={15} aria-hidden="true" />
                <div>
                  <strong>{tool.name ?? tool.eventType}</strong>
                  <span>{tool.content ?? tool.cwd ?? "Completed"}</span>
                </div>
              </div>
            )) : <EmptyState>No tool calls recorded.</EmptyState>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SearchSection(props: {
  query: string;
  role: SearchRole;
  results: MessageSearchResult[];
  selectedResult?: MessageSearchResult;
  onQueryChange: (value: string) => void;
  onRoleChange: (value: SearchRole) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="search-layout">
      <div className="search-toolbar">
        <label className="search-input">
          <Search size={17} aria-hidden="true" />
          <input
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            aria-label="Search messages"
            placeholder="Search synthetic messages"
          />
        </label>
        <select
          value={props.role}
          aria-label="Message role"
          onChange={(event) => props.onRoleChange(event.target.value as SearchRole)}
        >
          <option value="all">All roles</option>
          <option value="user">User</option>
          <option value="assistant">Assistant</option>
          <option value="developer">Developer</option>
        </select>
        <span className="result-count">{props.results.length} matches</span>
      </div>

      <div className="search-grid">
        <div className="search-results">
          {props.results.map((result) => (
            <button
              key={result.id}
              className={result.id === props.selectedResult?.id ? "search-row active" : "search-row"}
              type="button"
              onClick={() => props.onSelect(result.id)}
            >
              <span>{result.role}</span>
              <strong>{result.snippet}</strong>
              <small>{result.project} · {formatDateTime(result.timestamp)}</small>
            </button>
          ))}
        </div>

        <div className="message-detail">
          {props.selectedResult ? (
            <>
              <div className="detail-title compact">
                <div>
                  <p>{props.selectedResult.role}</p>
                  <h2>{props.selectedResult.project}</h2>
                </div>
                {props.selectedResult.promptIntent && <span className="intent-badge">{props.selectedResult.promptIntent}</span>}
              </div>
              <pre>{props.selectedResult.content.trim()}</pre>
              <div className="detail-meta">
                <span>{props.selectedResult.model ?? "unknown model"}</span>
                <span>{props.selectedResult.sourceEvent}</span>
                <span>{props.selectedResult.sessionId}</span>
              </div>
            </>
          ) : <EmptyState>No matching messages.</EmptyState>}
        </div>
      </div>
    </section>
  );
}

function Audit({ summary }: { summary: ProjectSummary }) {
  return (
    <section className="audit-grid">
      <div className="audit-main">
        <div className="panel-heading">
          <h2>AI Worklog Preview</h2>
          <span>{demoData.auditPreview.appendedSections} new sections</span>
        </div>
        <pre className="markdown-preview">{demoData.auditPreview.generatedMarkdown}</pre>
      </div>

      <aside className="export-panel">
        <Panel title="Export Preview">
          <div className="export-actions">
            <button type="button" onClick={() => downloadSummaryJson(summary)}>
              <Download size={17} aria-hidden="true" />
              JSON
            </button>
            <button type="button" onClick={() => downloadSummaryCsv(summary)}>
              <Download size={17} aria-hidden="true" />
              CSV
            </button>
          </div>
          <div className="export-facts">
            <span>Target</span>
            <strong>{demoData.auditPreview.targetPath}</strong>
            <span>Privacy</span>
            <strong>Public synthetic mode</strong>
            <span>Generated</span>
            <strong>{formatDateTime(demoData.generatedAt)}</strong>
          </div>
        </Panel>

        <Panel title="Current Summary">
          <TokenStack usage={summary.tokens} />
        </Panel>
      </aside>
    </section>
  );
}

function Metric(props: { icon: ReactNode; label: string; value: string; tone?: "warn" }) {
  return (
    <div className={props.tone === "warn" ? "metric warn" : "metric"}>
      <span>{props.icon}</span>
      <div>
        <strong>{props.value}</strong>
        <small>{props.label}</small>
      </div>
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

function BarRow(props: {
  label: string;
  value: string;
  width: number;
  tone: "teal" | "blue" | "gold";
}) {
  return (
    <div className={`bar-row ${props.tone}`}>
      <div className="bar-label">
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </div>
      <div className="bar-track">
        <span style={{ "--bar-width": `${Math.max(4, props.width)}%` } as CSSProperties} />
      </div>
    </div>
  );
}

function TokenStack({ usage }: { usage?: TokenUsage }) {
  if (!usage) {
    return <EmptyState>No token event recorded.</EmptyState>;
  }
  const max = Math.max(usage.inputTokens, usage.cachedInputTokens, usage.outputTokens, usage.reasoningOutputTokens, 1);
  return (
    <div className="token-stack">
      <BarRow label="Input" value={formatCompact(usage.inputTokens)} width={(usage.inputTokens / max) * 100} tone="blue" />
      <BarRow label="Cached" value={formatCompact(usage.cachedInputTokens)} width={(usage.cachedInputTokens / max) * 100} tone="teal" />
      <BarRow label="Output" value={formatCompact(usage.outputTokens)} width={(usage.outputTokens / max) * 100} tone="gold" />
      <div className="token-total">
        <span>Total</span>
        <strong>{formatCompact(usage.totalTokens)}</strong>
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}

function interactionsForProject(sessionDetails: SessionDetail[], project: string): BrowseInteraction[] {
  return sessionDetails
    .filter((session) => project === allProjectsName || session.project === project)
    .flatMap((session) =>
      session.interactions.map((interaction) => ({
        ...interaction,
        project: session.project,
        cwd: session.cwd,
        sessionFirstSeen: session.firstSeen
      }))
    )
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
}

function searchMessages(
  messages: MessageSearchResult[],
  project: string,
  query: string,
  role: SearchRole
) {
  const normalizedQuery = query.trim().toLowerCase();
  return messages.filter((message) => {
    if (project !== allProjectsName && message.project !== project) {
      return false;
    }
    if (role !== "all" && message.role !== role) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return `${message.content} ${message.snippet} ${message.project}`.toLowerCase().includes(normalizedQuery);
  });
}

function activityRange(summary: ProjectSummary) {
  const first = formatShortDate(summary.activity.firstSeen);
  const last = formatShortDate(summary.activity.lastSeen);
  if (!first || !last) {
    return "No activity";
  }
  return `${first} to ${last}`;
}

function shortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function formatShortDate(value?: string) {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatDateTime(value?: string) {
  if (!value) {
    return "No timestamp";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDuration(value?: number) {
  if (!value) {
    return "No duration";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  return `${Math.round(value / 1000)} sec`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function downloadSummaryJson(summary: ProjectSummary) {
  downloadFile(
    `codex-log-viewer-${slug(summary.project)}-synthetic.json`,
    `${JSON.stringify({ summary, privacy: demoData.source.privacy }, null, 2)}\n`,
    "application/json"
  );
}

function downloadSummaryCsv(summary: ProjectSummary) {
  const rows = [
    ["metric", "value"],
    ["project", summary.project],
    ["sessions", summary.totals.sessions],
    ["userMessages", summary.totals.userMessages],
    ["uniqueUserMessages", summary.totals.uniqueUserMessages],
    ["toolEvents", summary.totals.toolEvents],
    ["parseWarnings", summary.totals.parseWarnings],
    ["totalTokens", summary.tokens.totalTokens],
    ["inputTokens", summary.tokens.inputTokens],
    ["cachedInputTokens", summary.tokens.cachedInputTokens],
    ["outputTokens", summary.tokens.outputTokens]
  ];
  downloadFile(
    `codex-log-viewer-${slug(summary.project)}-synthetic.csv`,
    rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n",
    "text/csv"
  );
}

function downloadFile(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function slug(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "all-projects";
}
