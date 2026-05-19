import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const scannedFiles = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  encoding: "buffer"
})
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const pathRules = [
  {
    pattern: /(^|\/)\.codex\/(sessions|archived_sessions)(\/|$)/,
    reason: "tracked real Codex session path"
  },
  {
    pattern: /(^|\/)(node_modules|dist|coverage|\.cache|DerivedData)(\/|$)/,
    reason: "tracked generated or local cache path"
  },
  {
    pattern: /\.(mov|mp4|m4v|webm|gif|png|jpg|jpeg|heic|tiff)$/i,
    reason: "tracked screenshot, recording, or binary image artifact"
  },
  {
    pattern: /\.(p12|cer|der|pem|key|mobileprovision|env|log|zip|dmg)$/i,
    reason: "tracked secret, local log, signing, or release artifact"
  }
];

const textRules = [
  {
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    reason: "private key material"
  },
  {
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}/,
    reason: "GitHub token-like value"
  },
  {
    pattern: /\bsk-[A-Za-z0-9_-]{20,}/,
    reason: "API key-like value"
  }
];

const findings = [];

for (const file of scannedFiles) {
  for (const rule of pathRules) {
    if (rule.pattern.test(file)) {
      findings.push(`${file}: ${rule.reason}`);
    }
  }

  let contents = "";
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const rule of textRules) {
    if (rule.pattern.test(contents)) {
      findings.push(`${file}: ${rule.reason}`);
    }
  }

  for (const match of contents.matchAll(/\/Users\/([A-Za-z0-9._-]+)(?=\/)/g)) {
    if (match[1] !== "example") {
      findings.push(`${file}: non-example macOS home path (${match[0]})`);
    }
  }
}

if (findings.length > 0) {
  console.error("Privacy scan failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(`Privacy scan passed for ${scannedFiles.length} tracked and untracked files.`);
