# App Versioning

Codex Log Viewer uses app versions in this shape:

```text
major.minor.patch
```

The source of truth is `app-version.json`.

- `minor` is bumped once for each PR branch before pushing or opening the PR. During the `0.x` line, this means `0.x+1.0`.
- `patch` is bumped once for each commit that changes code, docs, fixtures, scripts, or app behavior. During the `0.x` line, this means `0.0.x+1`.
- `apps/macos/Sources/CodexLogViewerMac/AppVersion.swift`, the root `package.json`, and the root `package-lock.json` version fields are generated from `app-version.json` and are committed so the native app, release artifacts, and project metadata agree.

Use these commands:

```sh
npm run version:pr
npm run version:commit
npm run version:sync
```

`npm run version:pr` bumps `minor` and resets `patch` to `0`. Run it once per PR after updating from the current target branch.

`npm run version:commit` bumps `patch`. Run it once before each commit that changes the repository.

`npm run version:sync` rewrites generated app metadata without changing the version. Local build, package, and run commands use this sync path so verification does not silently change the app version.

Packaged apps write `major.minor.patch` to both `CFBundleShortVersionString` and `CFBundleVersion`. The release archive is named `Codex-Log-Viewer-vmajor.minor.patch-macOS.zip`.

Pull request CI compares `app-version.json` to the PR target branch and fails when the PR minor bump is missing. Tag-based release CI verifies that the Git tag matches `app-version.json` as `vmajor.minor.patch`.
