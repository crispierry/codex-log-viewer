# Static Web Demo

The static web demo is a public-safe project showcase for Codex Log Viewer. It is not the real hosted app; the native macOS app remains the product that reads local Codex logs.

## Shape

- Public project profiles live in `scripts/generate-web-demo-data.mjs`.
- The generator writes temporary synthetic JSONL, parses it with the existing parser and analytics packages, then removes the temporary files.
- Generated browser data is written to `apps/web-demo/src/data/demo-data.generated.json`.
- `apps/web-demo` is a Vite React app that ships as static files with relative asset URLs.
- The standalone page is chrome-free and iframe-ready. The real `crispierry.com/projects/codex-log-viewer` route supplies the personal website navigation above the demo experience.

## Commands

```sh
npm run demo:data
npm run check:web-demo-data
npm run check:web-demo-privacy
npm run dev:web-demo
npm run build:web-demo
npm run preview:web-demo
```

## Deployment

The default deployment target is any static host. GitHub Pages works because the Vite build uses relative asset paths:

```sh
npm run build:web-demo
```

Publish the contents of `apps/web-demo/dist/`.

For the personal website, publish from the website repo with:

```sh
npm run build:codex-log-viewer
```

That command builds this source demo and refreshes `public/project-apps/codex-log-viewer/` in the website repo.

## Privacy

The demo uses synthetic prompts and responses, with public-safe project names. Codex Log Viewer can use real aggregate proportions, but raw local messages, private source project names, local exports, and private screenshots must not be added to generated browser data.
