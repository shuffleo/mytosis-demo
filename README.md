# Mytosis

An interactive Voronoi journal that turns reflective notes into a living microscope of cells, groups, and emergent connections.

> [**Live demo →**](https://mytosis.shuffleo.workers.dev)

## Highlights

- Add, resize, merge, split, and group weighted Voronoi cells inside a circular microscope.
- Edit a focused cell through a reversible zoom-and-blur transition, or switch to the synchronized bullet-list editor.
- Explore shader-based lens, vignette, grain, wall texture, and seam-nutrient effects.
- Experiment with deterministic growth, synthesis, and local TF-IDF autogrouping.

## Run locally

```bash
npm ci
npm run dev
```

Validate a production build:

```bash
npm run build
npm run deploy:dry-run
```

## Deployment

The Vite SPA deploys to the Cloudflare Workers Static Assets project `mytosis`.
GitHub Actions requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`;
see the [Cloudflare deployment guide](docs/cloudflare-deployment.md) for
setup, previews, validation, and rollback.

## Documentation

- [Product requirements](docs/product-requirements.md)
- [Data model and clustering plan](docs/voronoi-data-model-and-clustering.md)
