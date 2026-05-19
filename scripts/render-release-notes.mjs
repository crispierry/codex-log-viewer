import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const parsed = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8"));
const version = packageJson.version ?? "0.1.0";
const tag = parsed.tag ?? process.env.GITHUB_REF_NAME ?? `v${version}`;
const output = resolve(repoRoot, parsed.output ?? "dist/release-notes.md");

if (tag !== `v${version}`) {
  throw new Error(`Release tag ${tag} does not match package.json version ${version}.`);
}

const template = await readFile(resolve(repoRoot, "docs/release-notes-template.md"), "utf8");
const body = template
  .replace(/^# Release Notes Template\n\n.*?\n\n/s, "")
  .replaceAll("vX.Y.Z", tag);

if (body.includes("vX.Y.Z") || body.includes("X.Y.Z")) {
  throw new Error("Rendered release notes still contain version placeholders.");
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, body);

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--tag") {
      result.tag = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--output") {
      result.output = args[index + 1];
      index += 1;
    }
  }
  return result;
}
