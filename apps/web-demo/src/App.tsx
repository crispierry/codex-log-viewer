import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  FileText,
  Folder,
  Grid2X2,
  Search,
  Send,
  ShieldCheck,
  Wand2,
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
type DateRange = "all" | "last7" | "last30";

interface BrowseInteraction extends DemoInteraction {
  project: string;
  cwd?: string;
  sessionFirstSeen?: string;
}

const demoData = demoDataRaw as DemoData;
const allProjectsName = "All Projects";
const browseVisibleMessageCount = 10;
const latestDemoTimestamp = latestInteractionTimestamp(demoData.sessionDetails);
const dateRangeOptions: Array<{ id: DateRange; label: string }> = [
  { id: "all", label: "All Time" },
  { id: "last7", label: "Last 7 Days" },
  { id: "last30", label: "Last 30 Days" }
];
const sections: Array<{ id: Section; label: string }> = [
  { id: "browse", label: "Browse" },
  { id: "overview", label: "Overview" },
  { id: "search", label: "Search" },
  { id: "audit", label: "Audit" }
];

export default function App() {
  const [selectedProject, setSelectedProject] = useState(allProjectsName);
  const [selectedSection, setSelectedSection] = useState<Section>("overview");
  const [selectedInteractionId, setSelectedInteractionId] = useState<string>();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<SearchRole>("all");
  const [selectedSearchId, setSelectedSearchId] = useState<string>();
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>("all");
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);

  const summary = demoData.summaries[selectedProject] ?? demoData.summaries[allProjectsName];
  const dateRangeLabel = dateRangeOptions.find((option) => option.id === selectedDateRange)?.label ?? "All Time";
  const projectInteractions = useMemo(
    () => interactionsForProject(demoData.sessionDetails, selectedProject),
    [selectedProject]
  );
  const browseInteractions = useMemo(
    () => filterInteractionsByDateRange(projectInteractions, selectedDateRange, latestDemoTimestamp),
    [projectInteractions, selectedDateRange]
  );
  const selectedInteraction = browseInteractions.find((item) => item.id === selectedInteractionId) ??
    browseInteractions[0];
  const searchResults = useMemo(
    () => searchMessages(demoData.messages, selectedProject, query, role, selectedDateRange, latestDemoTimestamp),
    [selectedDateRange, selectedProject, query, role]
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
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-title">
            <img src="./app-icon.svg" alt="" />
            <div>
              <h2>Codex Logs</h2>
              <p>Static synthetic demo</p>
            </div>
          </div>

          <div className="sidebar-section">
            <span className="sidebar-section-label">Library</span>
            <ProjectButton
              active={selectedProject === allProjectsName}
              icon={<Grid2X2 size={15} aria-hidden="true" />}
              label={allProjectsName}
              count={demoData.summaries[allProjectsName].totals.userMessages}
              meta={`${demoData.summaries[allProjectsName].totals.sessions} sessions`}
              onClick={() => setSelectedProject(allProjectsName)}
            />
          </div>

          <div className="sidebar-section">
            <div className="project-section-header">
              <span>Projects</span>
              <button type="button" aria-label="Sort projects by messages">
                Sort: Messages
              </button>
            </div>
            <nav className="project-nav" aria-label="Projects">
              {demoData.projects.map((project) => (
                <ProjectButton
                  key={project.project}
                  active={selectedProject === project.project}
                  icon={<Folder size={15} aria-hidden="true" />}
                  label={project.project}
                  count={project.messages}
                  meta={`${project.sessions} sessions`}
                  onClick={() => setSelectedProject(project.project)}
                />
              ))}
            </nav>
          </div>

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
              <p>{activityRange(summary)} <span aria-hidden="true">·</span> Up to date.</p>
            </div>

            <div
              className="date-range-control"
              onBlur={(event) => {
                const nextFocusedElement = event.relatedTarget;
                if (!(nextFocusedElement instanceof Node) || !event.currentTarget.contains(nextFocusedElement)) {
                  setIsDateMenuOpen(false);
                }
              }}
            >
              <button
                className="date-range-button"
                type="button"
                aria-haspopup="menu"
                aria-expanded={isDateMenuOpen}
                onClick={() => setIsDateMenuOpen((current) => !current)}
              >
                <CalendarDays size={15} aria-hidden="true" />
                <span>{dateRangeLabel}</span>
              </button>
              {isDateMenuOpen && (
                <div className="date-range-menu" role="menu" aria-label="Date range">
                  {dateRangeOptions.map((option) => (
                    <button
                      key={option.id}
                      className={option.id === selectedDateRange ? "active" : ""}
                      type="button"
                      role="menuitemradio"
                      aria-checked={option.id === selectedDateRange}
                      onClick={() => {
                        setSelectedDateRange(option.id);
                        setIsDateMenuOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="section-tabs" role="tablist" aria-label="Sections">
              {sections.map((section) => {
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

function ProjectButton(props: {
  active: boolean;
  icon: ReactNode;
  label: string;
  count: number;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      className={props.active ? "project-button active" : "project-button"}
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      title={`${props.label}: ${props.count.toLocaleString()} sent messages, ${props.meta}`}
    >
      <span className="project-icon">{props.icon}</span>
      <span className="project-title">{props.label}</span>
      <span className="message-count-badge">{formatNumber(props.count)}</span>
    </button>
  );
}

function Overview({ summary }: { summary: ProjectSummary }) {
  const [showsAllCategories, setShowsAllCategories] = useState(false);
  const hourlyMessages = hourlyCounts(summary);
  const weekdayMessages = weekdayCounts(summary);
  const hourlyTokens = hourlyTokenCounts(summary);
  const maxHourlyMessages = Math.max(...hourlyMessages.map((bucket) => bucket.count), 1);
  const maxWeekdayMessages = Math.max(...weekdayMessages.map((bucket) => bucket.count), 1);
  const maxHourlyTokens = Math.max(...hourlyTokens.map((bucket) => bucket.input + bucket.output), 1);
  const maxHourlyOutput = Math.max(...hourlyTokens.map((bucket) => bucket.output), 1);
  const maxIntentCount = Math.max(...summary.promptIntents.buckets.map((bucket) => bucket.count), 1);
  const leadingBucket = summary.promptIntents.buckets[0];
  const visibleBuckets = showsAllCategories
    ? summary.promptIntents.buckets
    : summary.promptIntents.buckets.slice(0, 7);

  return (
    <section className="section-stack">
      <div className="metrics-grid">
        <Metric label="Sessions" value={formatNumber(summary.totals.sessions)} />
        <Metric label="Sent Messages" value={formatNumber(summary.totals.userMessages)} />
        <Metric label="Automations" value={formatNumber(summary.totals.automationMessages)} />
        <Metric label="Unique Messages" value={formatNumber(summary.totals.uniqueUserMessages)} />
        <Metric label="Total Tokens" value={formatNumber(summary.tokens.totalTokens)} />
        <Metric label="Fresh Input" value={formatNumber(summary.tokens.freshInputTokens)} />
        <Metric label="Cached Input" value={formatNumber(summary.tokens.cachedInputTokens)} />
        <Metric label="Output Tokens" value={formatNumber(summary.tokens.outputTokens)} />
        <Metric label="Reasoning Tokens" value={formatNumber(summary.tokens.reasoningOutputTokens)} />
      </div>

      <Panel title="Project Focus" className="project-focus-panel">
        <div className="project-focus-header">
          <div>
            <strong>{formatNumber(summary.promptIntents.totalMessages)} prompts analyzed</strong>
            <span>{classificationSubtitle(summary)}</span>
          </div>
          {leadingBucket && (
            <span className="top-category-pill">
              <span className={`intent-dot ${intentClass(leadingBucket.key)}`} />
              Top: {leadingBucket.label}
            </span>
          )}
        </div>

        <div className="project-focus-body">
          <ProjectFocusDonut summary={summary} />
          <div className="project-focus-list">
            {visibleBuckets.map((bucket) => (
              <div className="focus-row" key={bucket.key}>
                <div className="focus-row-title">
                  <span className={`intent-dot ${intentClass(bucket.key)}`} />
                  <strong>{bucket.label}</strong>
                  <span>{formatNumber(bucket.count)} · {bucket.percentage.toFixed(1)}%</span>
                </div>
                <div className="native-progress">
                  <span
                    className={intentClass(bucket.key)}
                    style={{ "--bar-width": `${Math.max(3, (bucket.count / maxIntentCount) * 100)}%` } as CSSProperties}
                  />
                </div>
                <small>
                  {formatNumber(bucket.sessionCount)} {bucket.sessionCount === 1 ? "session" : "sessions"}
                  {bucket.examples[0] ? `   ${bucket.examples[0]}` : ""}
                </small>
              </div>
            ))}
            {summary.promptIntents.buckets.length > 7 && (
              <button
                className="show-categories-button"
                type="button"
                onClick={() => setShowsAllCategories((current) => !current)}
              >
                {showsAllCategories
                  ? "Show fewer categories"
                  : `Show all ${summary.promptIntents.buckets.length} categories`}
              </button>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Charts" className="charts-panel">
        <div className="chart-panel-list">
          <ChartPanel title="Messages by Hour">
            {hourlyMessages.map((bucket) => (
              <BarRow
                key={bucket.hour}
                label={hourLabel(bucket.hour)}
                value={`${bucket.count} messages`}
                width={(bucket.count / maxHourlyMessages) * 100}
                tone="blue"
              />
            ))}
          </ChartPanel>

          <ChartPanel title="Messages by Day of Week">
            {weekdayMessages.map((bucket) => (
              <BarRow
                key={bucket.label}
                label={bucket.label}
                value={`${bucket.count} messages`}
                width={(bucket.count / maxWeekdayMessages) * 100}
                tone="teal"
              />
            ))}
          </ChartPanel>

          <ChartPanel title="Tokens by Hour">
            {hourlyTokens.map((bucket) => (
              <BarRow
                key={bucket.hour}
                label={hourLabel(bucket.hour)}
                value={`${formatCompact(bucket.input + bucket.output)} tokens`}
                width={((bucket.input + bucket.output) / maxHourlyTokens) * 100}
                tone="gold"
              />
            ))}
          </ChartPanel>

          <ChartPanel title="Output Tokens by Hour">
            {hourlyTokens.map((bucket) => (
              <BarRow
                key={bucket.hour}
                label={hourLabel(bucket.hour)}
                value={`${formatCompact(bucket.output)} output`}
                width={(bucket.output / maxHourlyOutput) * 100}
                tone="teal"
              />
            ))}
          </ChartPanel>
        </div>
      </Panel>

      <Panel title="Repeated Prompts">
        <div className="repeat-list">
          {summary.repeatedUserMessages.length > 0 ? summary.repeatedUserMessages.slice(0, 5).map((item) => (
            <div className="repeat-row" key={item.id}>
              <div>
                <span>{item.count} repeats</span>
                <span>{item.sessionCount} sessions</span>
              </div>
              <strong>{item.sample}</strong>
              <small>{item.projects.join(", ")}</small>
            </div>
          )) : (
            <EmptyState>No repeated prompts in this project slice.</EmptyState>
          )}
        </div>
      </Panel>

    </section>
  );
}

function Browse(props: {
  interactions: BrowseInteraction[];
  selectedInteraction?: BrowseInteraction;
  onSelect: (id: string) => void;
}) {
  const messageWindowSubtitle = props.interactions.length > browseVisibleMessageCount
    ? `${formatNumber(props.interactions.length)} sent · ${browseVisibleMessageCount} at a time`
    : `${formatNumber(props.interactions.length)} sent`;

  return (
    <section className="browser-grid">
      <div className="list-panel">
        <div className="column-title">
          <Send size={19} aria-hidden="true" />
          <h2>User Messages</h2>
        </div>
        <div className="prompt-list">
          {props.interactions.map((interaction) => (
            <button
              key={interaction.id}
              className={interaction.id === props.selectedInteraction?.id ? "prompt-row active" : "prompt-row"}
              type="button"
              onClick={() => props.onSelect(interaction.id)}
            >
              <span className="prompt-row-meta">
                <PromptIntentBadge label={interaction.promptIntent} intentKey={interaction.promptIntentKey} />
                <span className="prompt-project" title={interaction.project}>
                  <Folder size={12} aria-hidden="true" />
                  <span>{interaction.project}</span>
                </span>
                <span title={formatDateTime(interaction.timestamp)}>{formatDateTime(interaction.timestamp)}</span>
                <span>{interaction.model}</span>
              </span>
              <strong>{interaction.userMessage}</strong>
            </button>
          ))}
        </div>
        <BrowserStatusBar title="User Messages" subtitle={messageWindowSubtitle} />
      </div>

      <div className="detail-panel">
        <div className="interaction-scroll">
          {props.selectedInteraction ? <InteractionDetail interaction={props.selectedInteraction} /> : (
            <EmptyState>No submitted prompts are available for this project.</EmptyState>
          )}
        </div>
        <BrowserStatusBar
          title="Codex Interaction"
          subtitle={props.selectedInteraction ? interactionSubtitle(props.selectedInteraction) : undefined}
        />
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
  const roleOptions: Array<{ value: SearchRole; label: string }> = [
    { value: "all", label: "All" },
    { value: "user", label: "User Sent" },
    { value: "automation", label: "Automation" },
    { value: "assistant", label: "Assistant" },
    { value: "system", label: "System" },
    { value: "developer", label: "Developer" }
  ];

  return (
    <section className="search-layout">
      <Panel title="Message Search">
        <div className="search-toolbar">
          <label className="search-input">
            <Search size={17} aria-hidden="true" />
            <input
              value={props.query}
              onChange={(event) => props.onQueryChange(event.target.value)}
              aria-label="Search messages"
              placeholder="Search messages across projects"
            />
          </label>
          <button className="native-button" type="button">Search</button>
        </div>

        <div className="search-filter-row" role="group" aria-label="Message role">
          {roleOptions.map((option) => (
            <button
              key={option.value}
              className={props.role === option.value ? "active" : ""}
              type="button"
              aria-pressed={props.role === option.value}
              onClick={() => props.onRoleChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="search-summary">{formatNumber(props.results.length)} matches in the current project and date filters.</p>

        {props.results.length > 0 ? (
          <>
            <div className="search-table" role="table" aria-label="Message search results">
              <div className="search-table-header" role="row">
                <span>Date/Time</span>
                <span>Message</span>
                <span>Project</span>
                <span>Role</span>
              </div>
              <div className="search-table-body">
                {props.results.map((result) => (
                  <button
                    key={result.id}
                    className={result.id === props.selectedResult?.id ? "search-row active" : "search-row"}
                    type="button"
                    onClick={() => props.onSelect(result.id)}
                  >
                    <span>{compactDateTime(result.timestamp)}</span>
                    <span>
                      {result.promptIntent && <PromptIntentBadge label={result.promptIntent} intentKey={result.promptIntentKey} />}
                      <strong>{result.snippet}</strong>
                    </span>
                    <span>{result.project}</span>
                    <span>{result.role}</span>
                  </button>
                ))}
              </div>
            </div>

            <SearchResultDetail result={props.selectedResult} query={props.query} />
          </>
        ) : (
          <EmptyState>No matches. Try another phrase or broaden the current filters.</EmptyState>
        )}
      </Panel>
    </section>
  );
}

function Audit({ summary }: { summary: ProjectSummary }) {
  return (
    <section className="audit-native">
      <div className="audit-control-bar">
        <div className="audit-path-row">
          <Folder size={16} aria-hidden="true" />
          <input readOnly value="/Users/example/projects/Codex Log Viewer" aria-label="Repository path" />
          <button className="icon-button" type="button" aria-label="Choose repository">
            <Folder size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="audit-action-row">
          <label className="switch-control">
            <input type="checkbox" checked readOnly />
            <span>Responses</span>
          </label>

          <span className="audit-target-path">{demoData.auditPreview.targetPath}</span>

          <button className="native-button" type="button">
            <Wand2 size={15} aria-hidden="true" />
            Generate
          </button>
          <button className="native-button prominent" type="button">
            <CheckCircle2 size={15} aria-hidden="true" />
            Approve
          </button>
          <button className="native-button" type="button" onClick={() => downloadSummaryJson(summary)}>
            <Download size={15} aria-hidden="true" />
            JSON
          </button>
          <button className="native-button" type="button" onClick={() => downloadSummaryCsv(summary)}>
            <Download size={15} aria-hidden="true" />
            CSV
          </button>
        </div>
      </div>

      <div className="audit-preview-pane">
        <div className="audit-preview-header">
          <div>
            <h2>Merged Worklog Preview</h2>
            <p>{demoData.auditPreview.appendedSections} new sections · {demoData.auditPreview.skippedSections} present</p>
          </div>
          <span>
            <FileText size={15} aria-hidden="true" />
            {demoData.auditPreview.appendedSections} generated
          </span>
          <span>
            <CheckCircle2 size={15} aria-hidden="true" />
            Public synthetic mode
          </span>
        </div>
        <pre className="markdown-preview">{demoData.auditPreview.generatedMarkdown}</pre>
      </div>
    </section>
  );
}

function Metric(props: { icon?: ReactNode; label: string; value: string; tone?: "warn" }) {
  return (
    <div className={props.tone === "warn" ? "metric warn" : "metric"}>
      {props.icon && <span>{props.icon}</span>}
      <div>
        <small>{props.label}</small>
        <strong>{props.value}</strong>
      </div>
    </div>
  );
}

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={className ? `panel ${className}` : "panel"}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ProjectFocusDonut({ summary }: { summary: ProjectSummary }) {
  const total = Math.max(summary.promptIntents.totalMessages, 1);
  let cursor = 0;
  const stops = summary.promptIntents.buckets.map((bucket) => {
    const start = cursor;
    const end = cursor + (bucket.count / total) * 100;
    cursor = end;
    return `${intentColor(bucket.key)} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });
  const gradient = stops.length > 0
    ? stops.join(", ")
    : "rgba(255, 255, 255, 0.16) 0% 100%";

  return (
    <div
      className="project-focus-donut"
      aria-label={`${formatNumber(summary.promptIntents.totalMessages)} prompts analyzed`}
      style={{ "--donut-gradient": gradient } as CSSProperties}
    >
      <div className="donut-center">
        <strong>{formatNumber(summary.promptIntents.totalMessages)}</strong>
        <span>prompts</span>
      </div>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="chart-panel">
      <h3>{title}</h3>
      <div className="bar-list">{children}</div>
    </section>
  );
}

function BrowserStatusBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="browser-status-bar">
      <strong>{title}</strong>
      {subtitle && <span>{subtitle}</span>}
    </div>
  );
}

function PromptIntentBadge({ intentKey, label }: { intentKey?: string; label?: string }) {
  if (!label) {
    return null;
  }
  return <span className={`prompt-intent-badge ${intentClass(intentKey)}`}>{label}</span>;
}

function SearchResultDetail({ result, query }: { result?: MessageSearchResult; query: string }) {
  if (!result) {
    return <EmptyState>Select a search result to inspect the full message.</EmptyState>;
  }

  return (
    <div className="search-result-detail">
      <h3>Selected Result</h3>
      <div className={`selected-message-card ${intentClass(result.promptIntentKey)}`}>
        <div className="selected-message-meta">
          {result.promptIntent && <PromptIntentBadge label={result.promptIntent} intentKey={result.promptIntentKey} />}
          <span>{result.project}</span>
          <span>{formatDateTime(result.timestamp)}</span>
        </div>
        <p>{highlightlessPreview(result.content, query)}</p>
      </div>
      <div className="search-metadata-grid">
        <MetadataItem label="Date/Time" value={formatDateTime(result.timestamp)} />
        {result.promptIntent && <MetadataItem label="Category" value={result.promptIntent} />}
        <MetadataItem label="Project" value={result.project} />
        <MetadataItem label="Role" value={result.role} />
        <MetadataItem label="Session Day" value={result.dateKey} />
        <MetadataItem label="Session ID" value={result.sessionId.slice(0, 8)} />
      </div>
    </div>
  );
}

function MetadataItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "Unknown"}</strong>
    </div>
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
  role: SearchRole,
  dateRange: DateRange,
  latestTimestamp?: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  const cutoff = dateRangeCutoff(dateRange, latestTimestamp);
  return messages.filter((message) => {
    if (project !== allProjectsName && message.project !== project) {
      return false;
    }
    if (cutoff && !isTimestampInRange(message.timestamp, cutoff)) {
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

function filterInteractionsByDateRange(
  interactions: BrowseInteraction[],
  dateRange: DateRange,
  latestTimestamp?: string
) {
  const cutoff = dateRangeCutoff(dateRange, latestTimestamp);
  if (!cutoff) {
    return interactions;
  }
  return interactions.filter((interaction) => isTimestampInRange(interaction.timestamp, cutoff));
}

function latestInteractionTimestamp(sessionDetails: SessionDetail[]) {
  return sessionDetails
    .flatMap((session) => session.interactions.map((interaction) => interaction.timestamp).filter(Boolean))
    .sort()
    .at(-1);
}

function dateRangeCutoff(dateRange: DateRange, latestTimestamp?: string) {
  if (dateRange === "all" || !latestTimestamp) {
    return undefined;
  }
  const latestDate = new Date(latestTimestamp);
  if (Number.isNaN(latestDate.getTime())) {
    return undefined;
  }
  const days = dateRange === "last7" ? 7 : 30;
  const cutoff = new Date(latestDate);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

function isTimestampInRange(timestamp: string | undefined, cutoff: Date) {
  if (!timestamp) {
    return false;
  }
  const date = new Date(timestamp);
  return !Number.isNaN(date.getTime()) && date >= cutoff;
}

function interactionSubtitle(interaction: BrowseInteraction) {
  const responseCount = interaction.assistantMessage ? 1 : 0;
  const responseLabel = `${responseCount} ${responseCount === 1 ? "response" : "responses"}`;
  if (interaction.tools.length > 0) {
    return `${responseLabel} · ${interaction.tools.length} ${interaction.tools.length === 1 ? "tool" : "tools"}`;
  }
  return responseLabel;
}

function hourlyCounts(summary: ProjectSummary) {
  const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const bucket of summary.messagesByHour) {
    const hour = bucketHour(bucket.key);
    if (hour !== undefined) {
      counts[hour].count += bucket.count;
    }
  }
  return counts.filter((bucket) => bucket.count > 0);
}

function hourlyTokenCounts(summary: ProjectSummary) {
  const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, input: 0, output: 0 }));
  for (const bucket of summary.messagesByHour) {
    const hour = bucketHour(bucket.key);
    if (hour !== undefined) {
      counts[hour].input += bucket.tokens.inputTokens;
      counts[hour].output += bucket.tokens.outputTokens;
    }
  }
  return counts.filter((bucket) => bucket.input > 0 || bucket.output > 0);
}

function weekdayCounts(summary: ProjectSummary) {
  const counts = Array.from({ length: 7 }, (_, index) => ({
    index,
    label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(Date.UTC(2026, 0, 4 + index))),
    count: 0
  }));
  for (const bucket of summary.messagesByDay) {
    const day = new Date(`${bucket.key}T12:00:00`);
    if (!Number.isNaN(day.getTime())) {
      counts[day.getDay()].count += bucket.count;
    }
  }
  return counts.filter((bucket) => bucket.count > 0);
}

function bucketHour(key: string) {
  const match = key.match(/T(\d{2})/);
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : undefined;
}

function hourLabel(hour: number) {
  if (hour === 0) {
    return "12 AM";
  }
  if (hour < 12) {
    return `${hour} AM`;
  }
  if (hour === 12) {
    return "12 PM";
  }
  return `${hour - 12} PM`;
}

function classificationSubtitle(summary: ProjectSummary) {
  const classified = formatNumber(summary.promptIntents.classifiedMessages);
  const unclassified = summary.promptIntents.unclassifiedMessages;
  if (unclassified === 0) {
    return `${classified} classified by work type`;
  }
  return `${classified} classified · ${formatNumber(unclassified)} other`;
}

function intentClass(key?: string) {
  switch (key) {
    case "feature-design":
      return "intent-cyan";
    case "implementation":
      return "intent-accent";
    case "bug-fixes":
      return "intent-red";
    case "git-commands":
      return "intent-purple";
    case "deploy-release":
    case "deploy-release-run-build":
    case "run-build-app":
    case "planning-strategy":
      return "intent-orange";
    case "code-review-qa":
      return "intent-blue";
    case "research":
      return "intent-mint";
    case "documentation":
      return "intent-brown";
    case "testing-verification":
      return "intent-indigo";
    case "refactor-cleanup":
      return "intent-pink";
    case "content-creation":
      return "intent-teal";
    case "data-analysis":
      return "intent-yellow";
    case "plan-approvals":
      return "intent-gray";
    default:
      return "intent-secondary";
  }
}

function intentColor(key?: string) {
  switch (intentClass(key)) {
    case "intent-cyan":
      return "var(--cyan)";
    case "intent-accent":
    case "intent-blue":
      return "var(--blue)";
    case "intent-red":
      return "var(--red)";
    case "intent-purple":
      return "var(--purple)";
    case "intent-orange":
      return "var(--orange)";
    case "intent-mint":
      return "var(--mint)";
    case "intent-brown":
      return "var(--brown)";
    case "intent-indigo":
      return "var(--indigo)";
    case "intent-pink":
      return "var(--pink)";
    case "intent-teal":
      return "var(--teal)";
    case "intent-yellow":
      return "var(--yellow)";
    case "intent-gray":
    case "intent-secondary":
    default:
      return "var(--secondary)";
  }
}

function activityRange(summary: ProjectSummary) {
  const first = formatHeaderDateTime(summary.activity.firstSeen);
  const last = formatHeaderDateTime(summary.activity.lastSeen);
  if (!first || !last) {
    return "No activity";
  }
  return `First session ${first} - Last session ${last}`;
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

function formatHeaderDateTime(value?: string) {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
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

function compactDateTime(value?: string) {
  if (!value) {
    return "No timestamp";
  }
  return new Intl.DateTimeFormat("en", {
    month: "numeric",
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

function highlightlessPreview(value: string, query: string) {
  const text = value.trim();
  return query.trim() ? text : text;
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
