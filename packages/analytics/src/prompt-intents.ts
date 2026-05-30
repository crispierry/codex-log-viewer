import type { PromptIntentCategory } from "./types.js";

export type PromptIntentRuleConfidence = "high" | "medium" | "low";

export interface PromptIntentExplanation {
  category: PromptIntentCategory;
  ruleKey: string;
  ruleLabel: string;
  confidence: PromptIntentRuleConfidence;
  signals: string[];
}

export const promptIntentCategories = {
  featureDesign: { key: "feature-design", label: "Feature design" },
  implementation: { key: "implementation", label: "Implementation" },
  bugFixes: { key: "bug-fixes", label: "Bug fixes" },
  gitCommands: { key: "git-commands", label: "Git commands" },
  deployRelease: { key: "deploy-release-run-build", label: "Deploy/release/run/build" },
  runBuildApp: { key: "deploy-release-run-build", label: "Deploy/release/run/build" },
  codeReviewQa: { key: "code-review-qa", label: "Code review/QA" },
  planningStrategy: { key: "planning-strategy", label: "Planning/strategy" },
  research: { key: "research", label: "Research" },
  documentation: { key: "documentation", label: "Documentation" },
  testingVerification: { key: "testing-verification", label: "Testing/verification" },
  refactorCleanup: { key: "refactor-cleanup", label: "Refactor/cleanup" },
  contentCreation: { key: "content-creation", label: "Content creation" },
  dataAnalysis: { key: "data-analysis", label: "Data/metrics" },
  feedbackContext: { key: "feedback-context", label: "Context/observation" },
  planApprovals: { key: "plan-approvals", label: "Plan approvals" },
  other: { key: "other", label: "Other" }
} as const satisfies Record<string, PromptIntentCategory>;

export function classifyPromptIntent(message: string): PromptIntentCategory {
  return explainPromptIntent(message).category;
}

export function explainPromptIntent(message: string): PromptIntentExplanation {
  const literal = normalizeLiteralPrompt(message);
  const command = normalizedCommandText(literal);
  const matchText = command === literal ? command : `${literal} ${command}`;
  const commandSignal = command === literal ? [] : ["normalized-command"];

  if (isPlanApprovalPrompt(literal)) {
    return explanation(promptIntentCategories.planApprovals, "plan-approval", "Short approval", "high", [
      "approval",
      ...commandSignal
    ]);
  }
  if (isDeployReleasePrompt(command)) {
    return explanation(promptIntentCategories.deployRelease, "deploy-release", "Deploy/release wording", "high", [
      "deploy-release",
      ...commandSignal
    ]);
  }
  if (isGitCommandPrompt(command)) {
    return explanation(promptIntentCategories.gitCommands, "git-command", "Git command wording", "high", [
      "git-command",
      ...commandSignal
    ]);
  }
  if (isRunBuildAppPrompt(command)) {
    return explanation(promptIntentCategories.runBuildApp, "run-build-app", "Run/build app wording", "high", [
      "run-build-app",
      ...commandSignal
    ]);
  }
  if (isCodeReviewQaPrompt(command)) {
    return explanation(promptIntentCategories.codeReviewQa, "code-review-qa", "Review/QA wording", "high", [
      "code-review-qa",
      ...commandSignal
    ]);
  }
  if (isTestingVerificationPrompt(matchText)) {
    return explanation(promptIntentCategories.testingVerification, "testing-verification", "Testing/verification wording", "high", [
      "testing-verification",
      ...commandSignal
    ]);
  }
  if (isDocumentationPrompt(matchText)) {
    return explanation(promptIntentCategories.documentation, "documentation", "Documentation wording", "high", [
      "documentation",
      ...commandSignal
    ]);
  }
  const directBugFix = isDirectBugFixPrompt(literal) || isDirectBugFixPrompt(command);
  const bugFix = isBugFixPrompt(matchText);
  const strongFeatureDesign = isStrongFeatureDesignPrompt(matchText);
  if (directBugFix) {
    return explanation(promptIntentCategories.bugFixes, "direct-bug-fix", "Direct bug-fix request", "high", [
      "direct-fix",
      "bug-signal",
      ...commandSignal
    ]);
  }
  if (bugFix && strongFeatureDesign) {
    return explanation(
      promptIntentCategories.featureDesign,
      "feature-design-mixed-bug-rationale",
      "Feature work with incidental bug rationale",
      "medium",
      ["strong-feature-signal", "bug-rationale", ...commandSignal]
    );
  }
  if (bugFix) {
    return explanation(promptIntentCategories.bugFixes, "bug-fix", "Bug/problem wording", "medium", [
      "bug-signal",
      ...commandSignal
    ]);
  }
  if (isPlanningStrategyPrompt(matchText)) {
    return explanation(promptIntentCategories.planningStrategy, "planning-strategy", "Planning/strategy wording", "high", [
      "planning-strategy",
      ...commandSignal
    ]);
  }
  if (isDataAnalysisPrompt(matchText)) {
    return explanation(promptIntentCategories.dataAnalysis, "data-analysis", "Data/metrics wording", "high", [
      "data-analysis",
      ...commandSignal
    ]);
  }
  if (isContentCreationPrompt(matchText)) {
    return explanation(promptIntentCategories.contentCreation, "content-creation", "Content creation wording", "high", [
      "content-creation",
      ...commandSignal
    ]);
  }
  if (strongFeatureDesign) {
    return explanation(promptIntentCategories.featureDesign, "strong-feature-design", "Explicit feature/capability wording", "high", [
      "strong-feature-signal",
      ...commandSignal
    ]);
  }
  if (isRefactorCleanupPrompt(matchText)) {
    return explanation(promptIntentCategories.refactorCleanup, "refactor-cleanup", "Refactor/cleanup wording", "high", [
      "refactor-cleanup",
      ...commandSignal
    ]);
  }
  if (isFeatureDesignPrompt(matchText)) {
    return explanation(promptIntentCategories.featureDesign, "feature-design", "Feature/design wording", "medium", [
      "feature-design",
      ...commandSignal
    ]);
  }
  if (isImplementationPrompt(matchText)) {
    return explanation(promptIntentCategories.implementation, "implementation", "Implementation wording", "medium", [
      "implementation",
      ...commandSignal
    ]);
  }
  if (isResearchPrompt(matchText)) {
    return explanation(promptIntentCategories.research, "research", "Research/investigation wording", "medium", [
      "research",
      ...commandSignal
    ]);
  }
  if (isFeedbackContextPrompt(matchText)) {
    return explanation(promptIntentCategories.feedbackContext, "context-observation", "Context/observation wording", "medium", [
      "context-observation",
      ...commandSignal
    ]);
  }
  if (isBroadActionRequestPrompt(matchText)) {
    return explanation(promptIntentCategories.implementation, "broad-action-request", "Broad action request", "low", [
      "broad-action",
      ...commandSignal
    ]);
  }
  if (literal) {
    return explanation(promptIntentCategories.feedbackContext, "fallback-context", "Fallback non-empty prompt", "low", [
      "non-empty"
    ]);
  }
  return explanation(promptIntentCategories.other, "empty-prompt", "Empty prompt", "low", ["empty"]);
}

function explanation(
  category: PromptIntentCategory,
  ruleKey: string,
  ruleLabel: string,
  confidence: PromptIntentRuleConfidence,
  signals: string[]
): PromptIntentExplanation {
  return {
    category,
    ruleKey,
    ruleLabel,
    confidence,
    signals
  };
}

function normalizeLiteralPrompt(message: string): string {
  return message.trim().replace(/\s+/gu, " ").toLowerCase();
}

function normalizedCommandText(normalized: string): string {
  let value = normalized;
  let changed = true;
  while (changed) {
    const previous = value;
    value = value
      .replace(/^(ok|okay)[, ]+/u, "")
      .replace(/^(please|pls)[, ]+/u, "")
      .replace(/^(can|could|would) you\s+/u, "")
      .replace(/^i would like (you )?to\s+/u, "")
      .replace(/^i want (you )?to\s+/u, "")
      .replace(/^let'?s\s+/u, "");
    changed = value !== previous;
  }
  return value.replace(/\s+(please|for me)$/u, "").trim();
}

function isPlanApprovalPrompt(normalized: string): boolean {
  if (normalized.length > 80) {
    return false;
  }
  const value = normalized
    .replace(/[.!]+$/u, "")
    .replace(/\s*,\s*/gu, ", ")
    .trim();
  const oneWordApproval = /^(yes|yeah|yep|yup|sure|ok|okay|approved|confirmed|execute)$/u.test(value);
  const shortApproval =
    /^(yes|yeah|yep|yup|sure|ok|okay),? (please|go ahead|proceed|do it|do that|sounds good|let's do it|lets do it)$/u.test(value);
  const phraseApproval =
    /^(sounds good|looks good|that works|works for me|go ahead|please do|yes please do|do it|do that|proceed|approved|confirmed|ship it|let's do it|lets do it|let's do that|lets do that|execute it|execute that|execute this|execute the plan|execute the changes)( please)?$/u.test(value);
  return oneWordApproval || shortApproval || phraseApproval;
}

function isDeployReleasePrompt(normalized: string): boolean {
  if (/\brelease notes?\b/u.test(normalized)) {
    return false;
  }
  const directDeploy =
    /^(publish|deploy|release|ship)( (it|this|the app|the build|the release|the site|the website|to (main|origin|github|production|prod|release)|production|prod))?$/u.test(normalized);
  const releaseWork =
    /\b(deploy|deployment|release|production|prod|notariz(?:e|ation)|distribution|ship(?:ped|ping)?)\b/u.test(normalized);
  return directDeploy || releaseWork;
}

function isGitCommandPrompt(normalized: string): boolean {
  const directGitCommand =
    /^(git )?(commit|comet|push|merge|rebase|branch|checkout|switch|pull|fetch|stash|tag|open pr|create pr|close pr|merge pr)\b/u.test(normalized);
  const explicitGitInspection = /^git (status|diff|log)\b/u.test(normalized);
  const gitObjectAction =
    /^(create|make|open|merge|close|delete|remove|clean|switch|checkout) ((a|the|current|new|this) )*(branch|commit|pull request|pr|worktree|work tree)\b/u.test(normalized);
  const worktreeCleanup = /^(close|delete|remove|clean) ((the|current|this) )*(worktree|work tree)\b/u.test(normalized);
  const commitStateQuestion =
    /^are all files\b/u.test(normalized) ||
    /^(are|is|did|do|does|have|has)\b.*\b(all|everything|files?|changes?|work|worktree|work tree|repo|repository|anything|we)\b.*\b(committed|commited|commit|pushed|push|staged|unstaged|uncommitted|dirty|clean|checked in)\b\??$/u.test(normalized) ||
    /^(all|everything|files?|changes?|anything|repo|repository|worktree|work tree)\b.*\b(committed|commited|pushed|staged|unstaged|uncommitted|dirty|clean)\b\??$/u.test(normalized);
  return directGitCommand || explicitGitInspection || gitObjectAction || worktreeCleanup || commitStateQuestion;
}

function isRunBuildAppPrompt(normalized: string): boolean {
  const appLaunchCommand =
    /^(run|start|restart|launch|open|relaunch|rerun) (the )?(app|application|desktop app|mac app|macos app|native app|packaged app|server|local server|dev server|development server)\b/u.test(normalized);
  const devServerCommand = /^(run|start|restart) (npm run dev|dev|desktop|local app)\b/u.test(normalized);
  const localBuildCommand =
    /\b(rebuild|build|package|packaged|relaunch|restart|run|start)\b.*\b(app|application|server|local|mac app|macos app|native app)\b/u.test(normalized);
  return appLaunchCommand || devServerCommand || localBuildCommand;
}

function isCodeReviewQaPrompt(normalized: string): boolean {
  const reviewCommand =
    /^(code review|do a code review|run a code review|review code|review the code|review this code|review the diff|review the changes)\b/u.test(normalized);
  const reviewTarget =
    /^(review|inspect|audit) (the )?(code|diff|changes|change set|pull request|pr|implementation)\b/u.test(normalized);
  const priorityFinding = /\b(p0|p1|p2|p3|regression risk|code review|review finding|finding)\b/u.test(normalized);
  return reviewCommand || reviewTarget || priorityFinding;
}

function isTestingVerificationPrompt(normalized: string): boolean {
  const directTest =
    /^(run|rerun|execute|fix|update)? ?(the )?(tests?|test suite|lint|smoke test|accessibility check|typecheck|verification)\b/u.test(normalized);
  const verificationTerms =
    /\b(test|tests|tested|testing|lint|typecheck|smoke|qa|verify|verification|accessibility|playwright|screenshot check)\b/u.test(normalized);
  return directTest || verificationTerms;
}

function isDocumentationPrompt(normalized: string): boolean {
  return /\b(docs?|documentation|readme|usage guide|help|worklog|ai worklog|changelog|release notes?|write-up|guide)\b/u.test(normalized);
}

function isDirectBugFixPrompt(normalized: string): boolean {
  const directFix =
    /^(fix|repair|resolve|debug|address|correct)\b/u.test(normalized) ||
    /^(can|could|would) (you|we) (please )?(fix|repair|resolve|debug|address|correct)\b/u.test(normalized);
  const bugFixPhrase = /\bbug fixes?\b/u.test(normalized);
  const fixBugObject =
    /\b(fix|repair|resolve|debug|address|correct)\b.{0,80}\b(bug|broken|wrong|not working|doesn'?t work|isn'?t working|fails?|failing|failure|error|crash|regression|issues?|problem|p0|p1|p2|p3)\b/u.test(normalized);
  const bugObjectFix =
    /\b(bug|broken|wrong|not working|doesn'?t work|isn'?t working|fails?|failing|failure|error|crash|regression|issues?|problem|p0|p1|p2|p3)\b.{0,80}\b(fix|repair|resolve|debug|address|correct)\b/u.test(normalized);
  return directFix || bugFixPhrase || fixBugObject || bugObjectFix;
}

function isStrongFeatureDesignPrompt(normalized: string): boolean {
  const explicitFeatureWork =
    /\b(features? (we )?(need|want|should|have) to (add|build|create|support|include)|add(?:ing)? (a |an |the |new )?features?|new features?|feature work)\b/u.test(normalized);
  const productCapability =
    /\b(add|build|create|show|display|put|include|support|enable|wire|hook up)\b.{0,120}\b(dialog|loading|notice|indicator|spinner|feedback|sync|synchroni[sz]e|background|refresh|filter|setting|option|button|view|chart|summary|panel|window|sidebar|column|label|badge|workflow)\b/u.test(normalized);
  const desiredAppBehavior =
    /\bi want (it|the app|the application|codex|codex log viewer) to\b/u.test(normalized);
  const capabilityLanguage =
    /\b(ability to|option for|new capability|periodically synchroni[sz]e|background sync)\b/u.test(normalized);
  return explicitFeatureWork || productCapability || desiredAppBehavior || capabilityLanguage;
}

function isBugFixPrompt(normalized: string): boolean {
  const directFix =
    /^(fix|repair|resolve|debug|address|correct)\b/u.test(normalized);
  const bugTerms =
    /\b(bug|broken|wrong|not working|doesn'?t work|isn'?t working|fix(?:ed|ing)?|fails?|failing|failure|error|crash|regression|issues?|problem|p0|p1|p2|p3)\b/u.test(normalized);
  const screenshotIssue =
    /\b(still seeing|why do we have|why is|what happened|this is wrong|this looks wrong|it is not|this is not|when i click)\b/u.test(normalized);
  return directFix || bugTerms || screenshotIssue;
}

function isRefactorCleanupPrompt(normalized: string): boolean {
  const cleanupTerms =
    /\b(declutter|clean ?up|cleanup|simplify|reorganize|remove|hide|go away|reclaim|less clutter|we don'?t need|you don'?t need|i don'?t want|move .* menu|move .* bottom|rename|refactor|dedupe|consolidate)\b/u.test(normalized);
  return cleanupTerms;
}

function isPlanningStrategyPrompt(normalized: string): boolean {
  const directPlan = /^(\/plan|create a plan|make a plan|plan this|plan it|create an implementation plan)\b/u.test(normalized);
  const decisionTerms =
    /\b(strategy|roadmap|approach|proposal|prioriti[sz]e|trade-?offs?|recommendation|recommend|honest opinion|do we need|we need to|i think we|i don'?t think|i am not sure|i'?m not sure|are we ready|are we all|are you sure|save this plan|should we|should i|what should|what can we|what are the key|best way|figure out the best|take a step back)\b/u.test(normalized);
  return directPlan || decisionTerms;
}

function isDataAnalysisPrompt(normalized: string): boolean {
  const dataTerms =
    /\b(data|dataset|spreadsheet|csv|table|chart|graph|metrics?|analytics?|report|dashboard|scorecard|calculate|count|breakdown|visuali[sz]e|pie chart|bar chart)\b/u.test(normalized);
  return dataTerms;
}

function isContentCreationPrompt(normalized: string): boolean {
  const contentTerms =
    /\b(generate|draft|compose|rewrite|copy|headline|tagline|article|blog post|post|email|letter|logo|image|illustration|poster|deck|slides?|presentation|caption|bio|announcement)\b/u.test(normalized);
  return contentTerms;
}

function isFeatureDesignPrompt(normalized: string): boolean {
  const designTerms =
    /\b(design|ux|ui|usability|visibility|layout|interaction|experience|principal designer|senior designer|feature|ability to|option for|i want to|i want the|i also want|now i want|i would like|can we|can you also|can you make|should we|what can we|improve|make .* better|this needs to|this should be|center the|slow down|filter(?:ing)?|settings?)\b/u.test(normalized);
  return designTerms;
}

function isImplementationPrompt(normalized: string): boolean {
  const implementationDirective =
    /^(\/goal|implement|execute|build|add|create|make|change|update|show|enable|disable|support|wire|hook up|connect|integrate|replace|do all of|give me|notice that|also notice that|you are worker)\b/u.test(normalized);
  const implementationTerms =
    /\b(implement|implementation|execute this|build this|add this|make this|change this|update this|hook this up|wire this up|integrate this|support this)\b/u.test(normalized);
  return implementationDirective || implementationTerms;
}

function isResearchPrompt(normalized: string): boolean {
  const researchTerms =
    /\b(research|investigate|look into|take a look|look at|understand|analy[sz]e|compare|find out|figure out|why|what is|what does|what are these|how can|how do i|where do i|can you tell|can you estimate|get a sense|explore|inspect logs?|explain)\b/u.test(normalized);
  return researchTerms;
}

function isFeedbackContextPrompt(normalized: string): boolean {
  const contextTerms =
    /\b(i have updated|i updated|for context|context:|this is what|here is|here are|a lot of|note that|also notice|notice that|i'?m seeing|i am seeing|i see|i noticed|it looks like|it seems|there is|there are|the screenshot|screenshot)\b/u.test(normalized);
  return contextTerms;
}

function isBroadActionRequestPrompt(normalized: string): boolean {
  const broadAction =
    /^(can you|could you|please|let'?s|all right do|alright do|okay can you|can you do|do all of|make sure|ensure)\b/u.test(normalized);
  return broadAction;
}
