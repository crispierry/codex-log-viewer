import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  corpusFromParsedFiles,
  parseCodexCorpus
} from "../packages/parser/dist/index.js";
import {
  classifyPromptIntent,
  generateAuditMarkdown,
  listProjects,
  projectContextForFile,
  searchMessages,
  summarizeParsedCorpus,
  userMessageCategoryLabel
} from "../packages/analytics/dist/index.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outputPath = resolve(repoRoot, "apps/web-demo/src/data/demo-data.generated.json");
const stableGeneratedAt = "2026-06-07T12:00:00.000Z";
const generatedSourcePath = "generated/synthetic-web-demo";
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const syntheticProfiles = [
  {
    project: "Third-Party Website",
    slug: "third-party-website",
    basis: "Synthesized from aggregate patterns in a third-party website project.",
    cwd: "/Users/example/projects/Third-Party Website",
    model: "gpt-5.4",
    sessionCount: 28,
    promptCount: 250,
    start: "2026-05-01T14:00:00.000Z",
    tokenTotals: {
      inputTokens: 200_914_233,
      cachedInputTokens: 188_578_944,
      freshInputTokens: 12_335_289,
      outputTokens: 1_140_825,
      reasoningOutputTokens: 427_832,
      totalTokens: 202_149_737
    },
    unknownEvents: 77,
    parseWarnings: 0,
    topics: [
      "homepage handoff",
      "CMS preview",
      "lead capture flow",
      "pricing page",
      "case study grid",
      "analytics dashboard",
      "deployment checklist",
      "accessibility pass"
    ],
    intentCounts: {
      "git-commands": 52,
      "deploy-release-run-build": 40,
      "context-observation": 37,
      "feature-design": 17,
      implementation: 15,
      "bug-fixes": 15,
      "planning-strategy": 15,
      "refactor-cleanup": 11,
      "code-review-qa": 11,
      research: 10,
      "data-analysis": 9,
      "testing-verification": 8,
      "content-creation": 5,
      "plan-approvals": 4,
      documentation: 1
    }
  },
  {
    project: "Executive Presentation",
    slug: "executive-presentation",
    basis: "Synthesized from aggregate patterns in a presentation project.",
    cwd: "/Users/example/projects/Executive Presentation",
    model: "gpt-5.5",
    sessionCount: 30,
    promptCount: 260,
    start: "2026-05-06T15:30:00.000Z",
    tokenTotals: {
      inputTokens: 1_347_462_305,
      cachedInputTokens: 1_277_031_040,
      freshInputTokens: 70_431_265,
      outputTokens: 5_270_070,
      reasoningOutputTokens: 1_956_257,
      totalTokens: 1_354_416_375
    },
    unknownEvents: 260,
    parseWarnings: 0,
    topics: [
      "opening narrative",
      "speaker notes",
      "customer proof slide",
      "roadmap section",
      "team momentum story",
      "chart annotation",
      "closing callout",
      "deck rehearsal"
    ],
    intentCounts: {
      "content-creation": 91,
      "context-observation": 32,
      "bug-fixes": 32,
      "git-commands": 31,
      "planning-strategy": 20,
      implementation: 9,
      "deploy-release-run-build": 7,
      "testing-verification": 7,
      "feature-design": 6,
      documentation: 6,
      "data-analysis": 3,
      research: 2,
      "plan-approvals": 2,
      "refactor-cleanup": 2,
      "code-review-qa": 1,
      other: 9
    }
  },
  {
    project: "Photographer's Guide",
    slug: "photographers-guide",
    basis: "Synthesized from aggregate patterns in a photographer's guide project.",
    cwd: "/Users/example/projects/Photographer's Guide",
    model: "gpt-5.5",
    sessionCount: 27,
    promptCount: 240,
    start: "2026-05-11T13:15:00.000Z",
    tokenTotals: {
      inputTokens: 558_086_581,
      cachedInputTokens: 526_279_296,
      freshInputTokens: 31_807_285,
      outputTokens: 2_444_642,
      reasoningOutputTokens: 828_725,
      totalTokens: 561_169_543
    },
    unknownEvents: 340,
    parseWarnings: 6,
    topics: [
      "sunrise route",
      "birding blind map",
      "seasonal checklist",
      "image gallery",
      "field notes",
      "print guide",
      "trip planning",
      "weather fallback"
    ],
    intentCounts: {
      "context-observation": 35,
      "git-commands": 34,
      "bug-fixes": 22,
      documentation: 19,
      "deploy-release-run-build": 18,
      "planning-strategy": 15,
      "content-creation": 14,
      "testing-verification": 12,
      implementation: 11,
      "data-analysis": 10,
      "code-review-qa": 9,
      "refactor-cleanup": 8,
      "feature-design": 8,
      research: 7,
      other: 18
    }
  },
  {
    project: "Codex Log Viewer",
    slug: "codex-log-viewer",
    basis: "Uses real aggregate proportions from the local Codex Log Viewer logs; prompt and response text is synthetic.",
    cwd: "/Users/example/projects/Codex Log Viewer",
    model: "gpt-5.5",
    sessionCount: 26,
    promptCount: 300,
    start: "2026-05-16T16:00:00.000Z",
    tokenTotals: {
      inputTokens: 1_320_404_566,
      cachedInputTokens: 1_282_230_272,
      freshInputTokens: 38_174_294,
      outputTokens: 3_259_286,
      reasoningOutputTokens: 1_214_764,
      totalTokens: 1_324_479_618
    },
    unknownEvents: 202,
    parseWarnings: 0,
    topics: [
      "parser cache",
      "project summary",
      "search filters",
      "audit worklog",
      "native browse flow",
      "redacted export",
      "prompt classifier",
      "web demo"
    ],
    intentCounts: {
      "git-commands": 60,
      "context-observation": 43,
      "bug-fixes": 37,
      "deploy-release-run-build": 31,
      "feature-design": 31,
      "planning-strategy": 30,
      research: 14,
      "code-review-qa": 11,
      implementation: 11,
      "refactor-cleanup": 11,
      documentation: 8,
      "data-analysis": 5,
      "testing-verification": 4,
      "plan-approvals": 3,
      "content-creation": 1
    }
  }
];

const tempDir = await mkdtemp(join(tmpdir(), "codex-log-viewer-web-demo-"));

try {
  await writeSyntheticJsonl(tempDir);
  const parsedCorpus = await parseCodexCorpus({ paths: [tempDir] });
  const corpus = sanitizeCorpus(parsedCorpus, tempDir);
  const projects = listProjects(corpus);
  const projectNames = ["All Projects", ...projects.map((project) => project.project)];
  const summaries = Object.fromEntries(
    projectNames.map((project) => [
      project,
      stableSummary(summarizeParsedCorpus(corpus, {
        paths: [generatedSourcePath],
        project: project === "All Projects" ? undefined : project
      }))
    ])
  );
  const allMessages = stableSearch(searchMessages(corpus, {
    project: "All Projects",
    role: "all",
    limit: 5_000
  }));
  const submittedMessages = stableSearch(searchMessages(corpus, {
    project: "All Projects",
    role: "user",
    submittedOnly: true,
    limit: 5_000
  }));

  const data = {
    schemaVersion: 2,
    generatedAt: stableGeneratedAt,
    source: {
      kind: "generated-synthetic-codex-jsonl",
      fixturePath: generatedSourcePath,
      privacy: "Public demo data is generated from synthetic prompts. Codex Log Viewer metrics use real aggregate proportions, but raw local messages are not included.",
      profiles: syntheticProfiles.map((profile) => ({
        project: profile.project,
        promptCount: profile.promptCount,
        basis: profile.basis
      }))
    },
    links: {
      repository: "https://github.com/crispierry/codex-log-viewer",
      releases: "https://github.com/crispierry/codex-log-viewer/releases",
      privacyDocs: "https://github.com/crispierry/codex-log-viewer/blob/main/docs/privacy-and-redaction.md"
    },
    projects,
    projectNames,
    summaries,
    messages: allMessages.results,
    submittedMessages: submittedMessages.results,
    sessionDetails: buildSessionDetails(corpus),
    auditPreview: buildAuditPreview(corpus)
  };

  const body = `${JSON.stringify(data, null, 2)}\n`;

  if (checkOnly) {
    const current = await readFile(outputPath, "utf8");
    if (current !== body) {
      process.stderr.write(`${relative(repoRoot, outputPath)} is out of date. Run npm run demo:data.\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write("Web demo data is up to date.\n");
    }
  } else {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, body, "utf8");
    process.stdout.write(`Wrote ${relative(repoRoot, outputPath)} from generated synthetic profiles.\n`);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function writeSyntheticJsonl(directory) {
  for (const profile of syntheticProfiles) {
    const intentSequence = intentSequenceFor(profile);
    const promptsBySession = distribute(profile.promptCount, profile.sessionCount);
    const unknownsBySession = distribute(profile.unknownEvents, profile.sessionCount);
    const warningsBySession = distribute(profile.parseWarnings, profile.sessionCount);
    let promptIndex = 0;
    for (let sessionIndex = 0; sessionIndex < profile.sessionCount; sessionIndex += 1) {
      const sessionNumber = sessionIndex + 1;
      const sessionId = `${profile.slug}-${String(sessionNumber).padStart(2, "0")}`;
      const sessionDate = addMinutes(new Date(profile.start), sessionIndex * 420);
      const lines = [
        eventLine(sessionDate, "session_meta", {
          id: sessionId,
          timestamp: sessionDate.toISOString(),
          cwd: profile.cwd,
          originator: "Codex Desktop",
          cli_version: "0.128.0-alpha.1",
          source: "codex-desktop",
          model_provider: "openai"
        })
      ];

      for (let turnOffset = 0; turnOffset < promptsBySession[sessionIndex]; turnOffset += 1) {
        const turnNumber = turnOffset + 1;
        const turnId = `${sessionId}-turn-${String(turnNumber).padStart(2, "0")}`;
        const timestamp = addMinutes(sessionDate, turnOffset * 18 + 1);
        const intent = intentSequence[promptIndex] ?? "context-observation";
        const topic = profile.topics[promptIndex % profile.topics.length];
        const prompt = promptFor(profile, intent, topic, promptIndex);
        const usage = usageFor(profile, promptIndex);
        const response = responseFor(profile, intent, topic);
        const includeTool = shouldIncludeTool(intent, promptIndex);

        lines.push(
          eventLine(timestamp, "turn_context", {
            turn_id: turnId,
            cwd: profile.cwd,
            current_date: timestamp.toISOString().slice(0, 10),
            timezone: "America/Los_Angeles",
            model: promptIndex % 11 === 0 ? `${profile.model}-mini` : profile.model,
            effort: promptIndex % 5 === 0 ? "high" : promptIndex % 3 === 0 ? "low" : "medium",
            collaboration_mode: { mode: promptIndex % 13 === 0 ? "plan" : "default" }
          }),
          eventLine(addSeconds(timestamp, 1), "event_msg", {
            type: "task_started",
            turn_id: turnId,
            started_at: addSeconds(timestamp, 1).getTime()
          }),
          eventLine(addSeconds(timestamp, 2), "event_msg", {
            type: "user_message",
            message: `${prompt}\n`,
            images: [],
            local_images: [],
            text_elements: []
          })
        );

        if (includeTool) {
          const callId = `${turnId}-tool`;
          lines.push(
            eventLine(addSeconds(timestamp, 4), "response_item", {
              type: "custom_tool_call",
              name: toolNameFor(intent),
              call_id: callId
            }),
            eventLine(addSeconds(timestamp, 7), "response_item", {
              type: "custom_tool_call_output",
              call_id: callId,
              output: toolOutputFor(profile, intent, topic)
            }),
            eventLine(addSeconds(timestamp, 9), "event_msg", {
              type: "exec_command_end",
              cwd: profile.cwd,
              exit_code: 0,
              duration: { millis: 120 + (promptIndex % 17) * 43 }
            })
          );
        }

        lines.push(
          eventLine(addSeconds(timestamp, 12), "event_msg", {
            type: "agent_message",
            message: response,
            phase: "final_answer"
          }),
          eventLine(addSeconds(timestamp, 13), "event_msg", {
            type: "token_count",
            info: {
              last_token_usage: usage,
              total_token_usage: usage,
              model_context_window: 400_000
            },
            rate_limits: {
              limit_id: "codex",
              primary: { used_percent: 10 + (promptIndex % 35) }
            }
          }),
          eventLine(addSeconds(timestamp, 14), "event_msg", {
            type: "task_complete",
            turn_id: turnId,
            completed_at: addSeconds(timestamp, 14).getTime(),
            duration_ms: 24_000 + (promptIndex % 23) * 2_100,
            time_to_first_token_ms: 650 + (promptIndex % 7) * 120,
            last_agent_message: response
          })
        );
        promptIndex += 1;
      }

      for (let index = 0; index < unknownsBySession[sessionIndex]; index += 1) {
        lines.push(eventLine(addMinutes(sessionDate, 360 + index), "event_msg", {
          type: "demo_future_event",
          value: `${profile.slug}-unknown-${index}`
        }));
      }

      for (let index = 0; index < warningsBySession[sessionIndex]; index += 1) {
        lines.push("not json in generated synthetic demo fixture");
      }

      await writeFile(
        join(directory, `rollout-${profile.slug}-${String(sessionNumber).padStart(2, "0")}.jsonl`),
        `${lines.join("\n")}\n`,
        "utf8"
      );
    }
  }
}

function sanitizeCorpus(corpus, directory) {
  const pathMap = new Map(
    corpus.files.map((file) => [
      file.filePath,
      `${generatedSourcePath}/${basename(file.filePath)}`
    ])
  );
  const parsedFiles = corpus.files.map((file) => sanitizeValue(file, pathMap, directory));
  return corpusFromParsedFiles(parsedFiles);
}

function sanitizeValue(value, pathMap, directory) {
  if (typeof value === "string") {
    if (pathMap.has(value)) {
      return pathMap.get(value);
    }
    return value.replaceAll(directory, generatedSourcePath);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, pathMap, directory));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry, pathMap, directory)])
    );
  }
  return value;
}

function stableSummary(summary) {
  return {
    ...summary,
    generatedAt: stableGeneratedAt,
    filters: {
      ...summary.filters,
      paths: [generatedSourcePath]
    }
  };
}

function stableSearch(search) {
  return {
    ...search,
    generatedAt: stableGeneratedAt
  };
}

function buildSessionDetails(corpus) {
  return corpus.files.map((file) => {
    const context = projectContextForFile(file, corpus);
    return {
      id: sessionKey(file),
      sessionId: file.sessionId,
      filePath: file.filePath,
      project: context.project,
      cwd: context.cwd,
      firstSeen: firstTimestamp(file),
      lastSeen: lastTimestamp(file),
      lineCount: file.lineCount,
      turns: [],
      messages: [],
      tokenUsage: [],
      taskTimings: [],
      toolEvents: file.toolEvents,
      unknownEvents: file.unknownEvents.map((event) => ({
        filePath: event.filePath,
        sessionId: event.sessionId,
        lineNumber: event.lineNumber,
        timestamp: event.timestamp,
        topLevelType: event.topLevelType,
        payloadType: event.payloadType
      })),
      warnings: file.warnings,
      interactions: buildInteractions(file)
    };
  }).sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
}

function buildInteractions(file) {
  return file.messages
    .filter((message) => message.sourceEvent === "event_msg.user_message")
    .map((userMessage) => {
      const turn = file.turns.find((candidate) => candidate.turnId === userMessage.turnId);
      const responseMessages = file.messages.filter((message) =>
        message.turnId === userMessage.turnId &&
        message.lineNumber !== undefined &&
        userMessage.lineNumber !== undefined &&
        message.lineNumber > userMessage.lineNumber &&
        message.role !== "user" &&
        message.role !== "automation"
      );
      const assistantMessages = responseMessages.filter((message) => message.role === "assistant");
      const assistant = assistantMessages.at(-1) ?? responseMessages.at(-1);
      const tools = file.toolEvents.filter((event) => event.turnId === userMessage.turnId);
      const tokenEvent = file.tokenUsage.find((event) => event.turnId === userMessage.turnId);
      const timing = file.taskTimings.find((event) => event.turnId === userMessage.turnId);
      const promptIntent = classifyPromptIntent(userMessage.content);
      return {
        id: [
          file.filePath,
          userMessage.sessionId,
          userMessage.turnId ?? "",
          userMessage.lineNumber ?? ""
        ].join("#"),
        sessionId: userMessage.sessionId,
        filePath: userMessage.filePath,
        turnId: userMessage.turnId,
        timestamp: userMessage.timestamp,
        userMessage: userMessage.content.trim(),
        assistantMessage: assistant?.content.trim() ?? timing?.lastAgentMessage ?? "",
        model: turn?.model ?? "unknown",
        effort: turn?.effort,
        promptIntentKey: promptIntent.key,
        promptIntent: promptIntent.label,
        category: userMessageCategoryLabel(userMessage.content),
        tokenUsage: tokenEvent?.usage,
        durationMs: timing?.durationMs,
        timeToFirstTokenMs: timing?.timeToFirstTokenMs,
        tools,
        contextMessages: responseMessages
          .filter((message) => message.role === "developer" || message.role === "system")
          .map((message) => message.content.trim())
      };
    });
}

function buildAuditPreview(corpus) {
  const generatedMarkdown = generateAuditMarkdown(corpus, {
    paths: [generatedSourcePath],
    project: "Codex Log Viewer",
    repoPath: "/Users/example/projects/Codex Log Viewer",
    includeResponses: true,
    privacy: "public"
  }).replace(/^Generated: .+$/m, `Generated: ${stableGeneratedAt}`);
  return {
    targetPath: "/Users/example/projects/Codex Log Viewer/docs/ai-worklog.md",
    generatedMarkdown,
    appendedSections: 26,
    skippedSections: 0
  };
}

function intentSequenceFor(profile) {
  const sequence = [];
  for (const [intent, count] of Object.entries(profile.intentCounts)) {
    for (let index = 0; index < count; index += 1) {
      sequence.push(intent);
    }
  }
  if (sequence.length !== profile.promptCount) {
    throw new Error(`${profile.project} intent counts must equal promptCount.`);
  }
  return sequence.sort((a, b) => intentSortKey(a).localeCompare(intentSortKey(b)));
}

function intentSortKey(intent) {
  const order = [
    "feature-design",
    "implementation",
    "bug-fixes",
    "git-commands",
    "deploy-release-run-build",
    "code-review-qa",
    "planning-strategy",
    "research",
    "documentation",
    "testing-verification",
    "refactor-cleanup",
    "content-creation",
    "data-analysis",
    "context-observation",
    "plan-approvals",
    "other"
  ];
  return `${order.indexOf(intent)}-${intent}`;
}

function promptFor(profile, intent, topic, index) {
  const repeated = repeatedPromptFor(intent, profile.project, topic, index);
  if (repeated) {
    return repeated;
  }

  switch (intent) {
    case "feature-design":
      return `Design the ${topic} feature for the public experience.`;
    case "implementation":
      return `Implement the ${topic} interaction in the app.`;
    case "bug-fixes":
      return `Fix the bug where the ${topic} state breaks.`;
    case "git-commands":
      return index % 2 === 0 ? "commit and push the latest changes" : `Create a git commit for the ${topic} updates.`;
    case "deploy-release-run-build":
      return index % 3 === 0 ? "Run the build and summarize any failures." : `Deploy the ${topic} update after running the production build.`;
    case "code-review-qa":
      return `Review the ${topic} changes for QA and accessibility issues.`;
    case "planning-strategy":
      return `Plan the next iteration for ${topic}.`;
    case "research":
      return `Research the best public examples for ${topic}.`;
    case "documentation":
      return `Update the docs for the ${topic} workflow.`;
    case "testing-verification":
      return `Write tests for ${topic} and verify the end-to-end flow.`;
    case "refactor-cleanup":
      return `Refactor the ${topic} module and clean up duplicate state.`;
    case "content-creation":
      return `Draft concise copy for the ${topic} section.`;
    case "data-analysis":
      return `Analyze the metrics for ${topic} and summarize the trend.`;
    case "context-observation":
      return `Here is the current ${topic} behavior; tell me what stands out.`;
    case "plan-approvals":
      return "Looks good, proceed with the plan.";
    default:
      return `Think through the ${topic} direction and tell me what feels off.`;
  }
}

function repeatedPromptFor(intent, _project, topic, index) {
  if (index % 31 === 0 && intent === "git-commands") {
    return "commit and push the latest changes";
  }
  if (index % 29 === 0 && intent === "deploy-release-run-build") {
    return "Run the build and summarize any failures.";
  }
  if (index % 37 === 0 && intent === "code-review-qa") {
    return "Review the latest changes and call out release blockers.";
  }
  if (index % 41 === 0 && intent === "context-observation") {
    return `Here is the current ${topic} behavior; tell me what stands out.`;
  }
  return undefined;
}

function responseFor(profile, intent, topic) {
  switch (intent) {
    case "git-commands":
      return `I prepared the ${profile.project} changes for version control and summarized the branch state.`;
    case "deploy-release-run-build":
      return `The ${profile.project} build path is checked, with follow-up notes for ${topic}.`;
    case "content-creation":
      return `The ${topic} copy now has a clearer narrative arc and tighter review notes.`;
    case "bug-fixes":
      return `I traced the ${topic} issue and adjusted the flow so the failure no longer reproduces.`;
    case "data-analysis":
      return `The ${topic} metrics are grouped into a short trend summary with the main driver called out.`;
    default:
      return `I updated the ${topic} workstream for ${profile.project} and left the next step visible.`;
  }
}

function shouldIncludeTool(intent, index) {
  return [
    "implementation",
    "bug-fixes",
    "git-commands",
    "deploy-release-run-build",
    "testing-verification",
    "data-analysis",
    "refactor-cleanup"
  ].includes(intent) || index % 6 === 0;
}

function toolNameFor(intent) {
  if (intent === "git-commands") {
    return "git";
  }
  if (intent === "data-analysis") {
    return "node";
  }
  return "exec_command";
}

function toolOutputFor(profile, intent, topic) {
  if (intent === "git-commands") {
    return "branch clean, staged changes reviewed";
  }
  if (intent === "data-analysis") {
    return `${topic} trend buckets generated for ${profile.project}`;
  }
  return `${topic} check completed for ${profile.project}`;
}

function usageFor(profile, index) {
  const weight = 0.72 + ((index % 11) * 0.056);
  const totalWeight = profile.promptCount * 1;
  return {
    input_tokens: share(profile.tokenTotals.inputTokens, profile.promptCount, weight, totalWeight),
    cached_input_tokens: share(profile.tokenTotals.cachedInputTokens, profile.promptCount, weight, totalWeight),
    output_tokens: share(profile.tokenTotals.outputTokens, profile.promptCount, weight, totalWeight),
    reasoning_output_tokens: share(profile.tokenTotals.reasoningOutputTokens, profile.promptCount, weight, totalWeight),
    total_tokens: share(profile.tokenTotals.totalTokens, profile.promptCount, weight, totalWeight)
  };
}

function share(total, count, weight, totalWeight) {
  return Math.max(1, Math.round((total / count) * (weight / (totalWeight / count))));
}

function distribute(total, buckets) {
  const base = Math.floor(total / buckets);
  const remainder = total % buckets;
  return Array.from({ length: buckets }, (_, index) => base + (index < remainder ? 1 : 0));
}

function eventLine(timestamp, type, payload) {
  return JSON.stringify({
    timestamp: timestamp.toISOString(),
    type,
    payload
  });
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1_000);
}

function sessionKey(file) {
  return `${file.filePath}#${file.sessionId}`;
}

function firstTimestamp(file) {
  return [
    ...file.sessions.map((record) => record.timestamp),
    ...file.turns.map((record) => record.timestamp),
    ...file.messages.map((record) => record.timestamp)
  ].filter(Boolean).sort()[0];
}

function lastTimestamp(file) {
  return [
    ...file.sessions.map((record) => record.timestamp),
    ...file.turns.map((record) => record.timestamp),
    ...file.messages.map((record) => record.timestamp),
    ...file.tokenUsage.map((record) => record.timestamp),
    ...file.taskTimings.map((record) => record.timestamp)
  ].filter(Boolean).sort().at(-1);
}
