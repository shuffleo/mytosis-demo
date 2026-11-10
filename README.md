# Mytosis

> ## [Open the live demo →](https://mytosis.shuffleo.workers.dev)

Mytosis is a local-first daily journal that turns notes into a living microscope of weighted Voronoi cells.

## Highlights

- Write in a synchronized bullet editor or directly inside the microscope.
- Move between local date pages with shared undo/redo and on-device persistence.
- Add, resize, merge, split, group, and locally autogroup thoughts.
- Tune accessible microscope palettes, cell motion, grain, lens, and growth behavior.
- Honor keyboard navigation and reduced-motion preferences.

## Local development

```bash
npm ci
npm run dev
```

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Journal pages stay in browser `localStorage`; **Start anew** in the microscope
sidebar clears only Mytosis-owned journal keys.

## Deployment

The SPA deploys through Wrangler to the existing Cloudflare Workers Static
Assets project `mytosis`. GitHub Actions expects `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`; secret values must never be committed or printed.
Preview branches must not target the production Worker. See the
[Cloudflare deployment guide](docs/cloudflare-deployment.md) for setup,
preview isolation, validation, and rollback.

## Credits

Core runtime:

- [React](https://react.dev/) and [React DOM](https://react.dev/reference/react-dom) — MIT
- [Paper.js](https://paperjs.org/) — MIT; paths, layers, hit testing, and the
  official [Voronoi example](https://paperjs.org/examples/voronoi/) informed
  the canvas interaction model
- [Pretext](https://pretextjs.dev/) / [`@chenglou/pretext`](https://www.npmjs.com/package/@chenglou/pretext)
  — MIT; measured line breaking inside irregular cells
- [Tweakpane](https://tweakpane.github.io/docs/) and
  [`@tweakpane/core`](https://www.npmjs.com/package/@tweakpane/core) — MIT;
  live microscope controls

Build, quality, and delivery:

- [Vite](https://vite.dev/) — MIT; [TypeScript](https://www.typescriptlang.org/) — Apache-2.0
- [`@vitejs/plugin-react`](https://github.com/vitejs/vite-plugin-react) and
  [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) type packages — MIT
- [Vitest](https://vitest.dev/) — MIT; [Playwright](https://playwright.dev/) — Apache-2.0
- [axe-core for Playwright](https://github.com/dequelabs/axe-core-npm) — MPL-2.0
- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) — MIT
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) and
  [Wrangler](https://developers.cloudflare.com/workers/wrangler/) — Wrangler is MIT or Apache-2.0

Interaction and visual references:

- [Bakemono](https://www.bakemono.space/) informed the restrained perimeter
  particle treatment; no source code was copied.
- [CSSScript’s popup date-picker showcase](https://www.cssscript.com/popup-date-picker/)
  informed calendar interaction concepts only; incompatible code was not used.
- Kharioki’s [horizontal calendar article](https://dev.to/kharioki/horizontal-calendar-a-simple-date-picker-for-react-native-4h2)
  informed date-window behavior, not styling or implementation.
- The supplied microscopy studies informed the four alternate palettes; the
  source images are reference material and are not redistributed here.
- See [10 toolbar and motion references](docs/toolbar-motion-references.md)
  for the brutal/technical and gooey/organic directions under consideration.

No third-party reference transfers ownership of Mytosis code; each linked
project remains subject to its own license and terms.

## More documentation

- [Product requirements](docs/product-requirements.md)
- [Data model and clustering plan](docs/voronoi-data-model-and-clustering.md)
- [Cloudflare deployment](docs/cloudflare-deployment.md)
