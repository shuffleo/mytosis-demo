# Voronoi data model and clustering plan

## Portable canvas data

The canvas saves one versioned JSON document. Positions are normalized against the circular field, so the same data reloads deterministically at any viewport size.

- `cells`: `{ id, text, site: { x, y }, weight, groupId?, style, creation }`
  - `site` is circle-relative, with the center at `(0, 0)` and the usable radius near `1`.
  - `weight` is the power-diagram size control, not a display-only scale.
  - `creation` records seeded, manual, or auto-growth origin and source cell IDs where relevant.
- `relationships`: `{ id, sourceId, targetId, type, weight, provenance }`
  - Connections are first-class entities. They are not duplicated as arrays inside cells.
- `groups`: `{ id, memberIds, wall, style, order }`
  - Membership is explicit and mirrored by each member’s optional `groupId`; validation rejects mismatches.
- `layout`: `{ schemaVersion, seed, circle, zOrder, next…Number }`
  - The random seed and monotonic counters make reloads and future generated IDs reproducible.

Import validates unique IDs, relationship endpoints, group membership, weight/position ranges, and complete z-order references before any data reaches the canvas.

## Browser-only clustering pipeline

The current implementation runs deterministic TF-IDF and seeded cosine k-means in a Web Worker. The remaining layout steps below describe the intended evolution of that local pipeline.

1. **Tokenize and normalize**: lowercase journal text, normalize Unicode, remove punctuation and a small transparent stop-word list, then optionally stem common endings.
2. **Build TF-IDF vectors**: one sparse vector per cell. Unusual words in a journal entry receive more influence than words repeated throughout the canvas.
3. **Reduce to two dimensions**: use PCA for a deterministic, inspectable projection. PCA is simple enough to implement locally and supports seeded, stable re-runs; a small seeded random projection is an acceptable fallback for very sparse data.
4. **Cluster with seeded k-means**: choose `k` from a small range using silhouette score, with conservative minimum cluster sizes. Preserve prior cluster IDs by matching new centroids to old ones.
5. **Create a constrained dense layout**: initialize sites from the 2D projection, keep clusters near their centroids, then iteratively relax overlaps inside the circle.
6. **Solve the power diagram**: adjust sites and weights while penalizing circle overflow, unwanted overlap, and excessive distance between related cells. Pin manually positioned cells and honor explicit groups as constraints.

All computation can run in a Web Worker with plain typed arrays and no network calls. Store generated relationships with algorithm/version provenance so users can distinguish them from manual links.

## Limits and safeguards

TF-IDF is bag-of-words: it misses sentence order, negation, metaphor, and semantic similarity between different words. Short journal entries also produce noisy vectors. The system should therefore present clusters as revisable suggestions, never hidden truth. Keep manual groups authoritative, expose why entries were grouped through shared terms, retain the original text unchanged, and make every generated layout reversible.
