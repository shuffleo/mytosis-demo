# Paper.js Journal Constellation

A full-viewport journal canvas rendered and interacted with through Paper.js. Weighted Voronoi cells live inside a circular field with pure-black surroundings. The only persistent chrome is a bottom tool dock and a collapsible Tweakpane control panel. A minimal alternate bullet-list view edits the same model.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`. The verified local session for this prototype uses `http://127.0.0.1:4173`.

## Interaction model

- **Add Cell** is the default tool. Pointer movement computes a temporary candidate cell without changing the stored sites; click commits that site and morphs the tessellation. The candidate reserves a readable power cell even in tight three-cell gaps and near corners, temporarily relaxing neighboring text floors so it cannot collapse into an invisible sliver. Pressing the already-active toolbar button places the empty journal near the field centroid with a deterministic minor offset. The model permits at most one empty journal at a time (seeds are excluded), so subsequent Add actions reposition that draft rather than creating blank clutter.
- The contextual sprout toggle enables restrained auto-growth. Empty-circumcircle Delaunay triples among **ungrouped** journals identify valid three-neighbor gaps. A seed begins as an independently rendered 20 × 20 px Paper.js blob; closed cubic “sticky neck” paths connect it organically to its three sources without connector strokes. Click promotes it to full average weight and reveals a deterministic extractive synthesis. **Add seed** creates one immediately for auditing.
- Untouched auto-seeds expire after three minutes by default, ease down to zero, and release their gap. Their persisted expiry uses a wall-clock timestamp, so save/load and Undo/Redo cannot restart the countdown; legacy seeds receive one timestamp during migration. Promotion cancels expiry; **Die seed** starts the oldest unexpanded seed’s death animation immediately for auditing.
- A resting empty cell incubates after three seconds while growth is enabled. Its deterministic local synthesis emerges blurred, preserves its source IDs, and sharpens only when the cell is selected. Editing an empty cell resets this lifecycle.
- **Select** lets cell geometry breathe on hover while text remains optically still, moves sites by dragging, and resizes with four handles. A member click selects that member even inside a group; clicking the group wall selects the container and exposes four container-weight handles, so resizing the wall causes the top-level power diagram to squeeze neighboring cells while members retessellate inside.
- Delete or Backspace removes a selected, unedited cell and cleans up its relationships and group membership.
- **Group** creates a hierarchical container cell. Members spring toward its centroid and tessellate only inside the container; ungrouped cells remain in the top-level diagram and cannot cross the wall’s exclusion band. Dragging an ungrouped cell close to a wall and dwelling arms a sticky, geometrically welcomed attachment; deep multi-member contact remains a faster fallback. Pulling a member beyond the configured threshold detaches it. Group walls rotate through an editable eight-color palette, and the model caps the field at eight groups.
- Group’s contextual **Autogroup** action runs cancellable TF-IDF clustering in a Web Worker. During the job all geometry waves while text stays still, and every action except Cancel is blocked. Successful runs create the same hierarchical walls as manual grouping and store provider, algorithm, score, seed, and settings provenance. One Undo restores the exact pre-cluster document.
- **New Select** is a visible feature flag and defaults on. It hides the separate **Merge / Split** tool and moves those capabilities into Select: releasing an unmoved long press splits, while dragging a compatible cell deeply into a tighter merge target and dwelling there for the same hold interval activates its sticky bridge. The welcomed target receives a deterministic power-site corridor instead of being squeezed away. Grouped members can merge only within their group, and split members inherit the group. Turning New Select off restores the dedicated experimental tool.
- Undo and Redo live at the left of the microscope toolbar, with disabled states and <kbd>⌘/Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Shift</kbd>+<kbd>⌘/Ctrl</kbd>+<kbd>Z</kbd> shortcuts. A bounded command history restores serialized checkpoints for meaningful edits and clustering. Continuous drags create one checkpoint.
- The bullet-list button suspends Paper/WebGL and opens a centered, accessible one-level block editor. Every level uses the same optically centered dot and full-strength text color. Enter splits at the caret (or appends/reuses the sole empty bullet at line end), Option/Alt+Arrow moves by word, Up/Down moves between bullets while preserving the caret column, Tab groups one level, and Shift-Tab ungroups. New bullets are deterministically last. Focus is indicated only by the native caret. Switching views fades through black while blur rises/falls and the surface follows an adjustable circular track whose centroid sits below the viewport; Tweakpane exposes duration, blur, arc depth, easing, and an off switch.
- Double-click a selected cell to enter focused editing. The microscope uses a real camera transform to enlarge that cell to about 80% of the fixed field, spikes and releases blur, and places a transparent borderless 5–12-line native textarea over the enlarged cell. Enter or a click outside the focused specimen commits; Escape cancels. Camera duration, blur, coverage, and easing are adjustable.
- The gear opens Tweakpane controls for geometry, motion, growth, groups, and the full palette. Numeric bindings combine a slider with precise keyboard-editable values, and every label/folder/button exposes a native hover explanation.
- **Microscope effects** are three independent GPU stages over the circular field: a restrained specimen-rim vignette, a centered sphere lens, and a CRT/phosphor pass. The Paper.js scene and a transparent wall/nutrient texture are composed inside WebGL before those stages, so fills, text, textured walls, and nutrients share one optical transform while the toolbar and Tweakpane remain sharp above the output.
- The canvas tracks viewport size and honors `prefers-reduced-motion`.

## Microscope post-processing

`src/microscope-postprocess.ts` composites a WebGL2 fragment pass over the Paper.js canvas and clips it to the live circular field. The sphere lens samples refracted RGB channels separately, adds frost/fresnel plus adjustable highlight bloom, and is always derived from the field center and radius. The expanded vignette controls expose radial dimming, blur, restrained distortion, and rim-specific grain/noise. A separate **whole-circle noise** uniform adds stable grain across the complete specimen without coupling it to the rim. CRT color shift and bulge remain active under the main CRT toggle; a separate **phosphor + scanlines** checkbox gates only those two sub-effects and defaults off.

`src/wall-texture-renderer.ts` redraws only cell walls, group walls, and the outer field edge into a transparent source texture. WebGL applies the same fixed-seed turbulence/displacement pencil treatment as the SVG `feTurbulence` + `feDisplacementMap` reference, then composites the texture with Paper before lens, vignette, and CRT processing. This avoids the scale and alignment risk of a visible HTML overlay while keeping frequency, octave detail, displacement, opacity, and enable state independent. The SVG filter definition remains the no-WebGL fallback.

The same transparent source hosts 64 deterministic dark seam “nutrients” per cell by default, inspired by Bakemono’s perimeter-normal particles. Each dot keeps a stable boundary anchor and follows a tiny orbit at roughly one tenth of the reference speed. A cached static wall layer is redrawn only when geometry changes; particle-only frames restore and repaint their padded dirty region. Because this source is composed before post-processing, every nutrient remains below all microscope shaders.

The overlays never receive pointer events. `src/microscope-mapping.ts` mirrors the shader's radial transform in reverse so Add, Select, Group, drag, resize, attach, and detach continue to hit visible geometry rather than undisplaced Paper coordinates. The native focused editor deliberately remains sharp above post-processing while text is edited; committing returns it to the processed Paper scene.

Texture storage is reused and updated with `texSubImage2D`. Rendering wakes for scene changes, settings, input, animation, and resize, then stops uploading once the scene settles. If WebGL2 is unavailable or context creation fails, the overlay is hidden, effect controls are disabled, and the Paper.js canvas remains fully usable. Reduced-motion mode suppresses time-varying grain and animation without disabling the static optical treatment.

## Geometry

The implementation follows the behavior of Paper.js’s official [Voronoi example](https://paperjs.org/examples/voronoi/): sites generate clipped cells, then Paper.js owns the rendered paths, labels, layers, hit-testing, animation frames, and pointer tool.

The official example uses Raymond Hill’s Fortune-algorithm implementation to return half-edge cells inside a bounding box. This version keeps Paper.js as the rendering, hit-testing, tool, path, and animation foundation, while extending the geometry to a **power diagram** clipped to a 128-segment circular boundary. For a site `i`, its cell contains every point `x` for which:

```text
|x - pᵢ|² - wᵢ ≤ |x - pⱼ|² - wⱼ
```

for every neighboring site `j`. Each inequality is a linear half-plane, so `src/geometry.ts` clips the circular boundary against all competing sites. Dragging a site changes `pᵢ`; dragging a resize handle changes `wᵢ`. Both operations recompute shared boundaries, so adjacent seams respond geometrically. Selection and hover breathing use transient weights in the same computation; text tracks layout but deliberately does not pulse.

Top-level power sites are ungrouped cells plus one container site per group. Group members run a second power diagram clipped to the inset container. This hierarchical construction makes the group wall and exclusion band real topology: external cells are clipped by the container boundary instead of being covered by an overlay. A manually resized group persists a preferred container weight above its spatial/text minimum; this is the same geometric weight consumed by the top-level diagram, not a disconnected visual scale.

True gaps are convex polygon insets, and rounded corners are sampled quadratic corner arcs. The visible inner stroke uses the original closed boundary with a clipped `2 × width` Paper.js stroke, round joins/caps, and no dash array. This avoids the unbounded offset-line intersections that acute inset corners produced. The outer breathing gap is the ring between the interior field and the smaller power-diagram boundary.

Journal text uses [Pretext](https://pretextjs.dev/) for measured line breaking. Each candidate row receives the actual safe horizontal span through the irregular polygon, so line width changes with the cell rather than with a rectangular text box. Break decisions are cached and require several stable frames before replacing the current line set; Paper.js line positions interpolate with the geometry to avoid reflow chatter. A deterministic arithmetic fallback supports non-browser tests and environments without canvas text measurement. Measured font metrics, inset, wrapped-line count, and a monotonic text-volume floor establish a required area; that floor feeds back into power weights immediately for merge/split output and continuously during layout. In a hierarchical group, unresolved member pressure also expands the top-level container; changing only the internal member weight cannot create space outside an already undersized wall. When Add Cell must reserve an otherwise impossible pocket, one deterministic crowding scale reduces both the font floor and effective safe inset. Only in the most constrained cells does the rendered label truncate with an ellipsis; the complete text remains unchanged in the model and is available in focused and list editing.

Pretext was also evaluated for the alternate editor. The maintained `@chenglou/pretext` package is a browser text-measurement/layout engine, not a block editor; the similarly named references do not provide a maintained browser editor. List mode therefore uses native labeled textareas and keyboard semantics behind a small replaceable component instead of pretending Pretext supplies editing behavior.

### Stable morphing

The earlier flicker came from treating raw polygon vertex order as stable. Voronoi topology changes can change vertex count, reverse winding, or choose a different first vertex; interpolating those arrays makes a path rotate or flip. Every target path now:

1. normalizes winding,
2. anchors at the positive-x ray from its centroid,
3. resamples to a fixed perimeter count, and
4. chooses the cyclic offset with the smallest distance to the previous frame.

Paper.js paths therefore retain stable point correspondence across vertex-count changes. Reduced-motion mode updates the same geometry directly.

Autogroup member slots are sampled once from the actual inset group container and cached until membership/order changes. Recomputing those slots from the wall on every frame created a geometry feedback loop: member motion changed the wall, which moved the target again. Fixed slots plus sub-pixel settling thresholds let walls converge instead of continually chasing themselves.

The post-process scene checksum includes cell and group boundaries plus text position, size, and visibility. Every source-change notification uploads one frame even after the WebGL pass has gone idle. Without those two guarantees, a slow group-wall settle could outlive the shader wake window and leave a stale wall/text texture on screen despite the underlying Paper scene being correct.

## Versioned local model

`src/model.ts` owns a versioned JSON-serializable schema with separate `cells`, `relationships`, `groups`, `settings`, and `layout` metadata. Sites and group-container sites are circle-relative normalized positions. Incubation/expiry state, content source IDs, list order, clustering provenance, and merge/split provenance are explicit; relationships are first-class records rather than duplicated cell arrays. Imports migrate v1–v4 documents, validate active references, and reload deterministically.

`src/reflective-content.ts` defines a replaceable `ReflectiveContentProvider` for fixtures, empty-cell ghost prompts, merge, split, synthesis, group-title fallback, and clustering demos. Its local provider emits concrete 5–20 word reflections and retains operation/source provenance.

`src/clustering.ts` defines the provider-neutral async `EmbeddingProvider.embed(texts, signal)` contract. The local implementation normalizes NFKC text, removes a transparent stopword set, adds bigrams, builds TF-IDF vectors, and applies cosine-distance seeded k-means. Automatic `k` selection evaluates bounded candidates with silhouette score and deterministic lower-`k` tie-breaking. `src/clustering-worker.ts` isolates this work from animation and UI; a later embedding provider can replace TF-IDF without coupling to layout. TF-IDF remains bag-of-words evidence, so it recognizes shared vocabulary better than paraphrase or nuanced semantics. No API or network service is used.

## Validate

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The unit and Playwright suites cover model migrations/round-trips, reflective-content fallbacks, TF-IDF/k-means/cancellation, bounded history, list ordering/indent semantics, seed expiry, circular clipping, stable correspondence, inner-stroke continuity, exact defaults/reset, tool switching, geometry-only breathing, Pretext layout stability, weighted resizing, incubation/reveal, sticky seed growth/promotion, hierarchical grouping, autogroup blocking/cancel/provenance/undo, list-to-microscope restoration, merge/split, text-derived minimum size, reduced motion, viewport resizing, shader controls, refracted hit-testing, idle upload suspension, sharp UI layering, accessibility, and the no-WebGL fallback.
