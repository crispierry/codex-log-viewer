import assert from "node:assert/strict";
import test from "node:test";
import { generateAuditMarkdown, mergeAuditMarkdown } from "../dist/index.js";

test("generateAuditMarkdown preserves submitted user messages with captured AI responses", () => {
  const corpus = auditCorpus();

  const markdown = generateAuditMarkdown(corpus, {
    project: "sample-app",
    generatedAt: "2026-05-19T12:00:00.000Z",
    privacy: "raw"
  });

  assert.match(markdown, /User messages: 2/);
  assert.match(markdown, /Providers: Codex/);
  assert.match(markdown, /AI responses: 2/);
  assert.match(markdown, /> Ship the audit log\./);
  assert.match(markdown, /> Keep every user message\./);
  assert.match(markdown, /> Confirmed the audit generator is in place\./);
  assert.match(markdown, /> Also add the repo convention\./);
  assert.match(markdown, /> Added the worklog rule\./);
});

test("generateAuditMarkdown includes submitted user messages across providers", () => {
  const corpus = mergeCorpora(
    auditCorpus(),
    auditCorpus({
      sessionId: "claude-audit-session",
      provider: "claude",
      sourceLabel: "Claude Code",
      userSourceEvent: "claude.user_message",
      assistantSourceEvent: "claude.assistant_message",
      firstUserMessage: "Use Claude for the architecture review.",
      firstAssistantMessage: "Claude captured the design notes.",
      secondUserMessage: "Add the Claude follow-up.",
      secondAssistantMessage: "Claude added the follow-up."
    }),
    auditCorpus({
      sessionId: "cursor-audit-session",
      provider: "cursor",
      sourceLabel: "Cursor",
      userSourceEvent: "cursor.user_message",
      assistantSourceEvent: "cursor.assistant_message",
      firstUserMessage: "Use Cursor for the local editor workflow.",
      firstAssistantMessage: "Cursor captured the editor workflow.",
      secondUserMessage: "Add the Cursor follow-up.",
      secondAssistantMessage: "Cursor added the follow-up."
    })
  );

  const markdown = generateAuditMarkdown(corpus, {
    generatedAt: "2026-05-19T12:00:00.000Z",
    privacy: "raw"
  });

  assert.match(markdown, /Providers: Claude Code, Codex, Cursor/);
  assert.match(markdown, /User messages: 6/);
  assert.match(markdown, /AI responses: 6/);
  assert.match(markdown, /Provider: `Claude Code`/);
  assert.match(markdown, /Provider: `Cursor`/);
  assert.match(markdown, /> Use Claude for the architecture review\./);
  assert.match(markdown, /> Claude captured the design notes\./);
  assert.match(markdown, /> Use Cursor for the local editor workflow\./);
  assert.match(markdown, /> Cursor captured the editor workflow\./);
});

test("generateAuditMarkdown redacts obvious private strings in public mode", () => {
  const corpus = auditCorpus({
    firstUserMessage: "Email me@example.com and inspect /Users/example/projects/sample-app before committing."
  });

  const publicMarkdown = generateAuditMarkdown(corpus, {
    project: "sample-app",
    generatedAt: "2026-05-19T12:00:00.000Z"
  });
  const rawMarkdown = generateAuditMarkdown(corpus, {
    project: "sample-app",
    generatedAt: "2026-05-19T12:00:00.000Z",
    privacy: "raw"
  });

  assert.match(publicMarkdown, /\[redacted-email\]/);
  assert.match(publicMarkdown, /~\/projects\/sample-app/);
  assert.doesNotMatch(publicMarkdown, /me@example\.com/);
  assert.doesNotMatch(publicMarkdown, /\/Users\/example\/projects\/sample-app/);
  assert.match(rawMarkdown, /me@example\.com/);
  assert.match(rawMarkdown, /\/Users\/example\/projects\/sample-app/);
});

test("generateAuditMarkdown filters by repository path", () => {
  const sampleCorpus = auditCorpus();
  const otherFile = {
    filePath: "other-session.jsonl",
    sessionId: "other-session",
    lineCount: 3,
    sessions: [],
    turns: [],
    messages: [],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };
  const otherSession = {
    filePath: otherFile.filePath,
    sessionId: otherFile.sessionId,
    cwd: "/Users/example/projects/other-app",
    timestamp: "2026-05-19T13:00:00.000Z"
  };
  const otherMessage = {
    filePath: otherFile.filePath,
    sessionId: otherFile.sessionId,
    lineNumber: 2,
    timestamp: "2026-05-19T13:00:01.000Z",
    role: "user",
    sourceEvent: "event_msg.user_message",
    content: "Do not include this other project.",
    imagesCount: 0,
    localImagesCount: 0
  };
  const corpus = {
    ...sampleCorpus,
    files: [...sampleCorpus.files, { ...otherFile, sessions: [otherSession], messages: [otherMessage] }],
    sessions: [...sampleCorpus.sessions, otherSession],
    messages: [...sampleCorpus.messages, otherMessage]
  };

  const markdown = generateAuditMarkdown(corpus, {
    repoPath: "/Users/example/projects/sample-app",
    generatedAt: "2026-05-19T12:00:00.000Z",
    privacy: "raw"
  });

  assert.match(markdown, /Ship the audit log/);
  assert.doesNotMatch(markdown, /Do not include this other project/);
});

test("generateAuditMarkdown excludes provider logs without repository context from repo audits", () => {
  const corpus = auditCorpus({
    sessionId: "claude-unscoped-session",
    provider: "claude",
    sourceLabel: "Claude Code",
    userSourceEvent: "claude.user_message",
    assistantSourceEvent: "claude.assistant_message",
    cwd: undefined,
    firstUserMessage: "Do not include this unscoped Claude work.",
    firstAssistantMessage: "This response should stay out."
  });

  const markdown = generateAuditMarkdown(corpus, {
    repoPath: "/Users/example/projects/sample-app",
    paths: ["/Users/example/.claude/projects/unscoped.jsonl"],
    generatedAt: "2026-05-19T12:00:00.000Z",
    privacy: "raw"
  });

  assert.match(markdown, /Sessions: 0/);
  assert.match(markdown, /No matching submitted user messages were found\./);
  assert.doesNotMatch(markdown, /Do not include this unscoped Claude work/);
});

test("generateAuditMarkdown does not include unrelated repositories with the same basename", () => {
  const firstCorpus = auditCorpus({
    cwd: "/Users/example/client-a/app",
    firstUserMessage: "Include client A work."
  });
  const secondCorpus = auditCorpus({
    sessionId: "same-name-other-repo",
    cwd: "/Users/example/client-b/app",
    firstUserMessage: "Do not include client B work."
  });
  const corpus = {
    ...firstCorpus,
    files: [...firstCorpus.files, ...secondCorpus.files],
    sessions: [...firstCorpus.sessions, ...secondCorpus.sessions],
    turns: [...firstCorpus.turns, ...secondCorpus.turns],
    messages: [...firstCorpus.messages, ...secondCorpus.messages]
  };

  const markdown = generateAuditMarkdown(corpus, {
    repoPath: "/Users/example/client-a/app",
    generatedAt: "2026-05-19T12:00:00.000Z",
    privacy: "raw"
  });

  assert.match(markdown, /Include client A work/);
  assert.doesNotMatch(markdown, /Do not include client B work/);
});

test("mergeAuditMarkdown appends only new generated sections", () => {
  const firstCorpus = auditCorpus();
  const generated = generateAuditMarkdown(firstCorpus, {
    project: "sample-app",
    generatedAt: "2026-05-19T12:00:00.000Z",
    privacy: "raw"
  });
  const initialMerge = mergeAuditMarkdown("", generated);
  const duplicateMerge = mergeAuditMarkdown(initialMerge.markdown, generated);
  const nextCorpus = auditCorpus({
    sessionId: "audit-session-next",
    firstUserMessage: "Add the next reviewed entry."
  });
  const nextGenerated = generateAuditMarkdown(nextCorpus, {
    project: "sample-app",
    generatedAt: "2026-05-19T12:02:00.000Z",
    privacy: "raw"
  });
  const nextMerge = mergeAuditMarkdown(initialMerge.markdown, nextGenerated);

  assert.equal(initialMerge.appendedSections, 1);
  assert.equal(duplicateMerge.appendedSections, 0);
  assert.equal(duplicateMerge.skippedSections, 1);
  assert.equal(nextMerge.appendedSections, 1);
  assert.match(nextMerge.markdown, /Ship the audit log/);
  assert.match(nextMerge.markdown, /Add the next reviewed entry/);
});

test("mergeAuditMarkdown skips generated sections when reviewed user messages already exist", () => {
  const generated = generateAuditMarkdown(auditCorpus(), {
    project: "sample-app",
    generatedAt: "2026-05-19T12:00:00.000Z",
    privacy: "raw"
  });
  const existing = [
    "# AI Worklog",
    "",
    "## Reviewed entry",
    "",
    "### User Messages",
    "",
    "> Ship the audit log.",
    "> Keep every user message.",
    "",
    "> Also add the repo convention.",
    ""
  ].join("\n");

  const merge = mergeAuditMarkdown(existing, generated);

  assert.equal(merge.appendedSections, 0);
  assert.equal(merge.skippedSections, 1);
  assert.equal(merge.markdown.includes("Confirmed the audit generator is in place."), false);
});

function auditCorpus(overrides = {}) {
  const sessionId = overrides.sessionId ?? "audit-session";
  const provider = overrides.provider ?? "codex";
  const sourceLabel = overrides.sourceLabel ?? "Codex";
  const metadata = {
    provider,
    sourceLabel,
    inputKind: overrides.inputKind ?? `${provider}-test`
  };
  const cwd = Object.hasOwn(overrides, "cwd") ? overrides.cwd : "/Users/example/projects/sample-app";
  const userSourceEvent = overrides.userSourceEvent ?? "event_msg.user_message";
  const assistantSourceEvent = overrides.assistantSourceEvent ?? "response_item.message";
  const file = {
    ...metadata,
    filePath: `${sessionId}.jsonl`,
    sessionId,
    lineCount: 6,
    sessions: [],
    turns: [],
    messages: [],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };
  const session = {
    ...metadata,
    filePath: file.filePath,
    sessionId: file.sessionId,
    cwd,
    timestamp: "2026-05-19T12:00:00.000Z"
  };
  const turns = [
    {
      ...metadata,
      filePath: file.filePath,
      sessionId: file.sessionId,
      turnId: "audit-turn-1",
      timestamp: "2026-05-19T12:00:01.000Z",
      cwd: session.cwd,
      model: "gpt-5.5"
    },
    {
      ...metadata,
      filePath: file.filePath,
      sessionId: file.sessionId,
      turnId: "audit-turn-2",
      timestamp: "2026-05-19T12:01:00.000Z",
      cwd: session.cwd,
      model: "gpt-5.5"
    }
  ];
  const messages = [
    {
      ...metadata,
      filePath: file.filePath,
      sessionId: file.sessionId,
      lineNumber: 3,
      turnId: "audit-turn-1",
      timestamp: "2026-05-19T12:00:02.000Z",
      role: "user",
      sourceEvent: userSourceEvent,
      content: overrides.firstUserMessage ?? "Ship the audit log.\nKeep every user message.",
      imagesCount: 0,
      localImagesCount: 0
    },
    {
      ...metadata,
      filePath: file.filePath,
      sessionId: file.sessionId,
      lineNumber: 4,
      turnId: "audit-turn-1",
      timestamp: "2026-05-19T12:00:03.000Z",
      role: "assistant",
      sourceEvent: assistantSourceEvent,
      content: overrides.firstAssistantMessage ?? "Confirmed the audit generator is in place.",
      imagesCount: 0,
      localImagesCount: 0
    },
    {
      ...metadata,
      filePath: file.filePath,
      sessionId: file.sessionId,
      lineNumber: 5,
      turnId: "audit-turn-2",
      timestamp: "2026-05-19T12:01:01.000Z",
      role: "user",
      sourceEvent: userSourceEvent,
      content: overrides.secondUserMessage ?? "Also add the repo convention.",
      imagesCount: 0,
      localImagesCount: 0
    },
    {
      ...metadata,
      filePath: file.filePath,
      sessionId: file.sessionId,
      lineNumber: 6,
      turnId: "audit-turn-2",
      timestamp: "2026-05-19T12:01:02.000Z",
      role: "assistant",
      sourceEvent: assistantSourceEvent,
      content: overrides.secondAssistantMessage ?? "Added the worklog rule.",
      imagesCount: 0,
      localImagesCount: 0
    }
  ];

  return {
    files: [{ ...file, sessions: [session], turns, messages }],
    sessions: [session],
    turns,
    messages,
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };
}

function mergeCorpora(...corpora) {
  return {
    files: corpora.flatMap((corpus) => corpus.files),
    sessions: corpora.flatMap((corpus) => corpus.sessions),
    turns: corpora.flatMap((corpus) => corpus.turns),
    messages: corpora.flatMap((corpus) => corpus.messages),
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };
}
