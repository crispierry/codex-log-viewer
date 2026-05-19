import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootViewPath = resolve("apps/macos/Sources/CodexLogViewerMac/RootView.swift");
const rootView = readFileSync(rootViewPath, "utf8");

const requiredIdentifiers = [
  "refresh-button",
  "export-json-button",
  "export-csv-button",
  "status-pill",
  "source-paths-editor",
  "source-picker-button",
  "source-apply-button",
  "source-default-button",
  "project-sidebar",
  "since-toggle",
  "since-date-picker",
  "until-toggle",
  "until-date-picker",
  "message-search-field",
  "message-search-button",
  "show-sent-messages-button",
  "message-role-filter",
  "message-model-filter",
  "message-search-results-table",
  "session-search-field",
  "sessions-table",
  "copy-search-session-button",
  "copy-search-project-button",
  "copy-search-snippet-button",
  "retry-button"
];

const missing = requiredIdentifiers.filter(
  (identifier) => !rootView.includes(`.accessibilityIdentifier("${identifier}")`)
);

if (missing.length > 0) {
  console.error("Missing required native accessibility identifiers:");
  for (const identifier of missing) {
    console.error(`- ${identifier}`);
  }
  process.exit(1);
}

console.log(`Native accessibility identifier check passed for ${requiredIdentifiers.length} controls.`);
