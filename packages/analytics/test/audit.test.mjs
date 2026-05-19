import assert from "node:assert/strict";
import test from "node:test";
import { generateAuditMarkdown, mergeAuditMarkdown } from "../dist/index.js";

test("generateAuditMarkdown preserves submitted user messages with captured Codex responses", () => {
  const corpus = auditCorpus();

  const markdown = generateAuditMarkdown(corpus, {
    project: "sample-app",
    generatedAt: "2026-05-19T12:00:00.000Z",
    privacy: "raw"
  });

  assert.match(markdown, /User messages: 2/);
  assert.match(markdown, /Codex responses: 2/);
  assert.match(markdown, /> Ship the audit log\./);
  assert.match(markdown, /> Keep every user message\./);
  assert.match(markdown, /> Confirmed the audit generator is in place\./);
  assert.match(markdown, /> Also add the repo convention\./);
  assert.match(markdown, /> Added the worklog rule\./);
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
  const file = {
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
    filePath: file.filePath,
    sessionId: file.sessionId,
    cwd: "/Users/example/projects/sample-app",
    timestamp: "2026-05-19T12:00:00.000Z"
  };
  const turns = [
    {
      filePath: file.filePath,
      sessionId: file.sessionId,
      turnId: "audit-turn-1",
      timestamp: "2026-05-19T12:00:01.000Z",
      cwd: session.cwd,
      model: "gpt-5.5"
    },
    {
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
      filePath: file.filePath,
      sessionId: file.sessionId,
      lineNumber: 3,
      turnId: "audit-turn-1",
      timestamp: "2026-05-19T12:00:02.000Z",
      role: "user",
      sourceEvent: "event_msg.user_message",
      content: overrides.firstUserMessage ?? "Ship the audit log.\nKeep every user message.",
      imagesCount: 0,
      localImagesCount: 0
    },
    {
      filePath: file.filePath,
      sessionId: file.sessionId,
      lineNumber: 4,
      turnId: "audit-turn-1",
      timestamp: "2026-05-19T12:00:03.000Z",
      role: "assistant",
      sourceEvent: "response_item.message",
      content: "Confirmed the audit generator is in place.",
      imagesCount: 0,
      localImagesCount: 0
    },
    {
      filePath: file.filePath,
      sessionId: file.sessionId,
      lineNumber: 5,
      turnId: "audit-turn-2",
      timestamp: "2026-05-19T12:01:01.000Z",
      role: "user",
      sourceEvent: "event_msg.user_message",
      content: "Also add the repo convention.",
      imagesCount: 0,
      localImagesCount: 0
    },
    {
      filePath: file.filePath,
      sessionId: file.sessionId,
      lineNumber: 6,
      turnId: "audit-turn-2",
      timestamp: "2026-05-19T12:01:02.000Z",
      role: "assistant",
      sourceEvent: "event_msg.agent_message",
      content: "Added the worklog rule.",
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
