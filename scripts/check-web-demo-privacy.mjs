import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const files = [
  "apps/web-demo/src/data/demo-data.generated.json",
  "apps/web-demo/src/App.tsx",
  "apps/web-demo/src/styles.css",
  "apps/web-demo/src/types.ts",
  "apps/web-demo/vite.config.ts",
  "scripts/generate-web-demo-data.mjs",
  "docs/web-demo.md",
  "README.md"
];

const rules = [
  {
    name: "OpenAI/GitHub token-like value",
    pattern: /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g
  },
  {
    name: "Slack/AWS token-like value",
    pattern: /\b(?:xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/g
  },
  {
    name: "private key material",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
  },
  {
    name: "unredacted secret assignment",
    pattern: /\b(?:password|passwd|api[_-]?key|secret|auth[_-]?token|access[_-]?token|refresh[_-]?token|bearer[_-]?token|token)\b\s*[:=]\s*(?!\[redacted\])("[^"]+"|'[^']+'|[^\s`",}]+)/gi
  },
  {
    name: "email address",
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  },
  {
    name: "phone-like number",
    pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g
  },
  {
    name: "non-example macOS home path",
    pattern: /\/Users\/(?!example\/)[A-Za-z0-9._-]+\//g
  },
  {
    name: "placeholder private source project name",
    pattern: /\b(?:sample-shop|docs-studio)\b/gi
  }
];

const findings = [];

for (const file of files) {
  const body = await readFile(resolve(file), "utf8");
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    const count = [...body.matchAll(rule.pattern)].length;
    if (count > 0) {
      findings.push(`${file}: ${rule.name} (${count})`);
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`Web demo privacy check failed:\n${findings.map((finding) => `- ${finding}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Web demo privacy check passed for ${files.length} files.\n`);
