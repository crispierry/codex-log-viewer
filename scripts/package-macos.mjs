import { execFileSync } from "node:child_process";
import { copyFile, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { chmodSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const appName = "Codex Log Viewer";
const executableName = "CodexLogViewerMac";
const bundleIdentifier = "com.crispierry.codex-log-viewer";
const appVersion = bumpAppBuildVersion();
const version = appVersion.marketingVersion;
const buildVersion = appVersion.bundleVersion;
const configuration = process.env.CONFIGURATION ?? "release";
const codeSignIdentity = process.env.CODEX_LOG_VIEWER_CODESIGN_IDENTITY?.trim() || "-";
const notaryProfile = process.env.CODEX_LOG_VIEWER_NOTARY_PROFILE?.trim();
const notaryKeychain = process.env.CODEX_LOG_VIEWER_NOTARY_KEYCHAIN?.trim();
const requireNotarization = process.env.CODEX_LOG_VIEWER_REQUIRE_NOTARIZATION === "1";
const buildDir = resolve(repoRoot, "dist/macos");
const appDir = join(buildDir, `${appName}.app`);
const contentsDir = join(appDir, "Contents");
const macosDir = join(contentsDir, "MacOS");
const resourcesDir = join(contentsDir, "Resources");
const engineDir = join(resourcesDir, "engine");
const nodeDir = join(resourcesDir, "node/bin");
const nodeLibDir = join(resourcesDir, "node/lib");
let didSignBundle = false;

verifyReleaseSigningConfiguration();
run("npm", ["run", "build:native-engine"]);
run("swift", ["build", "--package-path", "apps/macos", "-c", configuration]);

await rm(appDir, { recursive: true, force: true });
await mkdir(macosDir, { recursive: true });
await mkdir(resourcesDir, { recursive: true });

await copySwiftExecutable();
await writeInfoPlist();
await writeFile(join(contentsDir, "PkgInfo"), "APPL????");
await copyEngine();
await copyNodeRuntime();
await createIcon();
await signBundle();
await notarizeBundle();
await createReleaseArchive();

console.log(`Packaged ${appDir}`);

function verifyReleaseSigningConfiguration() {
  if (!requireNotarization) {
    return;
  }
  if (process.platform !== "darwin") {
    throw new Error("CODEX_LOG_VIEWER_REQUIRE_NOTARIZATION=1 requires macOS.");
  }
  if (process.env.CODEX_LOG_VIEWER_SKIP_CODESIGN === "1") {
    throw new Error("CODEX_LOG_VIEWER_REQUIRE_NOTARIZATION=1 cannot be used with CODEX_LOG_VIEWER_SKIP_CODESIGN=1.");
  }
  if (codeSignIdentity === "-") {
    throw new Error("CODEX_LOG_VIEWER_REQUIRE_NOTARIZATION=1 requires CODEX_LOG_VIEWER_CODESIGN_IDENTITY.");
  }
  if (!notaryProfile) {
    throw new Error("CODEX_LOG_VIEWER_REQUIRE_NOTARIZATION=1 requires CODEX_LOG_VIEWER_NOTARY_PROFILE.");
  }
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: options.quiet ? "pipe" : "inherit"
  });
}

async function copySwiftExecutable() {
  const executablePath = resolve(repoRoot, `apps/macos/.build/${configuration}/${executableName}`);
  if (!existsSync(executablePath)) {
    throw new Error(`Missing Swift executable at ${executablePath}`);
  }

  const destination = join(macosDir, executableName);
  await copyFile(executablePath, destination);
  chmodSync(destination, 0o755);
}

async function copyEngine() {
  await cp(resolve(repoRoot, "apps/server/dist"), join(engineDir, "apps/server/dist"), { recursive: true });
  await copyFile(resolve(repoRoot, "apps/server/package.json"), join(engineDir, "apps/server/package.json"));

  await cp(resolve(repoRoot, "packages/analytics/dist"), join(engineDir, "node_modules/@codex-log-viewer/analytics/dist"), {
    recursive: true
  });
  await copyFile(
    resolve(repoRoot, "packages/analytics/package.json"),
    join(engineDir, "node_modules/@codex-log-viewer/analytics/package.json")
  );

  await cp(resolve(repoRoot, "packages/parser/dist"), join(engineDir, "node_modules/@codex-log-viewer/parser/dist"), {
    recursive: true
  });
  await copyFile(
    resolve(repoRoot, "packages/parser/package.json"),
    join(engineDir, "node_modules/@codex-log-viewer/parser/package.json")
  );
}

async function copyNodeRuntime() {
  const nodePath = process.env.CODEX_LOG_VIEWER_NODE ?? process.execPath;
  if (!existsSync(nodePath)) {
    throw new Error(`Missing Node runtime at ${nodePath}`);
  }

  await mkdir(nodeDir, { recursive: true });
  const destination = join(nodeDir, "node");
  await copyFile(nodePath, destination);
  chmodSync(destination, 0o755);
  await copyNodeDylibs(nodePath, destination);
}

async function createIcon() {
  if (process.platform !== "darwin") {
    return;
  }

  const sourceSvg = resolve(repoRoot, "apps/macos/Assets/AppIcon.svg");
  const iconsetDir = join(buildDir, "AppIcon.iconset");
  await rm(iconsetDir, { recursive: true, force: true });
  await mkdir(iconsetDir, { recursive: true });

  const basePng = join(iconsetDir, "base.png");
  run("sips", ["-s", "format", "png", sourceSvg, "--out", basePng], { quiet: true });

  const sizes = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"]
  ];

  for (const [size, fileName] of sizes) {
    run("sips", ["-z", String(size), String(size), basePng, "--out", join(iconsetDir, fileName)], { quiet: true });
  }

  run("iconutil", ["-c", "icns", iconsetDir, "-o", join(resourcesDir, "AppIcon.icns")], { quiet: true });
  await rm(iconsetDir, { recursive: true, force: true });
}

async function writeInfoPlist() {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>${executableName}</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleIdentifier}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundleDisplayName</key>
  <string>${appName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${buildVersion}</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
  await writeFile(join(contentsDir, "Info.plist"), plist);
}

async function signBundle() {
  if (process.platform !== "darwin" || process.env.CODEX_LOG_VIEWER_SKIP_CODESIGN === "1") {
    return;
  }

  try {
    for (const target of await codeSignTargets()) {
      run("codesign", codeSignArgs(target), { quiet: true });
    }
    run("codesign", codeSignArgs(appDir, ["--deep"]), { quiet: true });
    run("codesign", ["--verify", "--strict", "--deep", "--verbose=2", appDir], { quiet: true });
    didSignBundle = true;
  } catch (error) {
    if (codeSignIdentity !== "-") {
      throw error;
    }
    console.warn("Codesign failed; continuing with unsigned local bundle.");
  }
}

function codeSignArgs(target, extraArgs = []) {
  const args = ["--force", "--sign", codeSignIdentity];
  if (codeSignIdentity !== "-") {
    args.push("--timestamp", "--options", "runtime");
  }
  args.push(...extraArgs);
  args.push(target);
  return args;
}

async function notarizeBundle() {
  if (process.platform !== "darwin" || !notaryProfile || codeSignIdentity === "-" || !didSignBundle) {
    if (requireNotarization) {
      throw new Error("Notarization was required but the app was not signed and submitted.");
    }
    return;
  }

  const notaryArchivePath = join(buildDir, "Codex-Log-Viewer-notary-submit.zip");
  await rm(notaryArchivePath, { force: true });
  try {
    run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appDir, notaryArchivePath], { quiet: true });
    const submitArgs = ["notarytool", "submit", notaryArchivePath, "--keychain-profile", notaryProfile, "--wait"];
    if (notaryKeychain) {
      submitArgs.push("--keychain", notaryKeychain);
    }
    run("xcrun", submitArgs);
    run("xcrun", ["stapler", "staple", appDir]);
    run("xcrun", ["stapler", "validate", appDir]);
    run("spctl", ["--assess", "--type", "execute", "--verbose=2", appDir]);
  } finally {
    await rm(notaryArchivePath, { force: true });
  }
}

async function createReleaseArchive() {
  if (process.platform !== "darwin") {
    return;
  }

  const archiveName = `Codex-Log-Viewer-v${version}-build${buildVersion}-macOS.zip`;
  const archivePath = join(buildDir, archiveName);
  const checksumPath = `${archivePath}.sha256`;
  await rm(archivePath, { force: true });
  await rm(checksumPath, { force: true });

  run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appDir, archivePath], { quiet: true });
  const checksum = execFileSync("shasum", ["-a", "256", basename(archivePath)], {
    cwd: buildDir,
    encoding: "utf8"
  });
  await writeFile(checksumPath, checksum);
}

async function codeSignTargets() {
  const targets = [
    join(macosDir, executableName),
    join(nodeDir, "node")
  ];

  if (existsSync(nodeLibDir)) {
    const files = await readdir(nodeLibDir);
    targets.push(...files.filter((file) => file.endsWith(".dylib")).map((file) => join(nodeLibDir, file)));
  }

  return targets.filter((target) => existsSync(target));
}

async function copyNodeDylibs(sourceNodePath, bundledNodePath) {
  if (process.platform !== "darwin") {
    return;
  }

  const copied = new Set();
  await mkdir(nodeLibDir, { recursive: true });

  const copyDylib = async (sourcePath) => {
    const realSourcePath = resolve(sourcePath);
    if (copied.has(realSourcePath) || !existsSync(realSourcePath)) {
      return;
    }
    copied.add(realSourcePath);

    const destination = join(nodeLibDir, basename(realSourcePath));
    await copyFile(realSourcePath, destination);
    chmodSync(destination, 0o644);

    for (const dependency of parseDylibDependencies(realSourcePath)) {
      if (!shouldBundleDylib(dependency)) {
        continue;
      }
      const resolvedDependency = resolveDylibPath(dependency, realSourcePath, sourceNodePath);
      if (!resolvedDependency) {
        continue;
      }
      await copyDylib(resolvedDependency);
      run("install_name_tool", ["-change", dependency, `@loader_path/${basename(resolvedDependency)}`, destination], {
        quiet: true
      });
    }
  };

  for (const dependency of parseDylibDependencies(sourceNodePath)) {
    if (!shouldBundleDylib(dependency)) {
      continue;
    }
    const resolvedDependency = resolveDylibPath(dependency, sourceNodePath, sourceNodePath);
    if (!resolvedDependency) {
      continue;
    }
    await copyDylib(resolvedDependency);
    run(
      "install_name_tool",
      ["-change", dependency, `@executable_path/../lib/${basename(resolvedDependency)}`, bundledNodePath],
      { quiet: true }
    );
  }
}

function parseDylibDependencies(binaryPath) {
  const output = execFileSync("otool", ["-L", binaryPath], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" ")[0])
    .filter(Boolean);
}

function shouldBundleDylib(dependency) {
  return !dependency.startsWith("/usr/lib/") && !dependency.startsWith("/System/Library/");
}

function resolveDylibPath(dependency, referencingBinaryPath, sourceNodePath) {
  if (dependency.startsWith("@rpath/")) {
    const name = basename(dependency);
    const candidates = [
      join(dirname(sourceNodePath), "../lib", name),
      join(dirname(referencingBinaryPath), name),
      join(dirname(referencingBinaryPath), "../lib", name)
    ];
    return candidates.find((candidate) => existsSync(candidate));
  }

  if (dependency.startsWith("@loader_path/")) {
    const candidate = resolve(dirname(referencingBinaryPath), dependency.slice("@loader_path/".length));
    return existsSync(candidate) ? candidate : undefined;
  }

  if (dependency.startsWith("@executable_path/")) {
    const candidate = resolve(dirname(sourceNodePath), dependency.slice("@executable_path/".length));
    return existsSync(candidate) ? candidate : undefined;
  }

  return existsSync(dependency) ? dependency : undefined;
}

function bumpAppBuildVersion() {
  return JSON.parse(execFileSync("node", ["scripts/update-app-version.mjs", "--bump-build", "--json"], {
    cwd: repoRoot,
    encoding: "utf8"
  }));
}
