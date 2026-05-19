# App Versioning

Codex Log Viewer uses app versions in this shape:

```text
major.minor (Build N)
```

The source of truth is `app-version.json`.

- `major` and `minor` are release decisions and should be changed intentionally before a planned release.
- `build` is incremented automatically by the supported macOS build commands.
- `apps/macos/Sources/CodexLogViewerMac/AppVersion.swift` is generated from `app-version.json` and is committed so the native app can show the same version in development and packaged builds.

These commands increment the build number:

```sh
npm run build:mac
npm run app:mac
npm run package:mac
```

Packaged apps write `major.minor` to `CFBundleShortVersionString` and the build number to `CFBundleVersion`.
