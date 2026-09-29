# Robotics Atlas

A full-window research workspace that connects citation communities, institutional geography, collaboration networks, and publication histories for robotics and humanoid robotics.

## Run

Node 24 is used for the build and the native TypeScript unit tests. Install the Git dependency's Yarn build tool in the command environment on a fresh checkout:

```bash
cd robotics_atlas
npm exec --yes --package=yarn -- npm ci
npm run dev -- --host 0.0.0.0
```

The UI is served at the Vite URL. Navigation, dataset, search, and actions share a single compact header. The plot starts below a slim row of counts and active selections; the institution inspector opens directly on the data. Helios Web **0.10.9** and Helios Network **0.10.4** are pinned. The published Helios renderer contains absolute worker asset paths; `vite.config.ts` bundles its shipped source entry so workers resolve correctly below `/robotics_atlas/` as well as at `/`.

```bash
npm run build          # standalone build in dist
npm run lint
npm run test:unit      # Node tests: temporal joins, filters, data invariants and timings
npm run test:e2e       # Chromium browser tests against /robotics_atlas/
npm test              # data tests, production build, browser tests
```

Install the browser once with `npx playwright install chromium`. The browser tests start a local Python static server and exercise the actual nested production path, including Helios/WebGL, both datasets, selection preservation, every edge, empty search results, timeline brushing and reset, and mobile layout.

## Publish

The repository is configured for [GitHub Pages](https://filipinascimento.github.io/robotics_atlas/). The deployment workflow checks the source, builds the production site, tests it at the `/robotics_atlas/` subpath, and deploys after successful checks on `main`. Pull requests run the same checks without publishing.

Enable **Settings → Pages → Source → GitHub Actions** once. Subsequent pushes to `main` publish automatically. No API keys or external data server are required.

## Explore

- **Communities** and **Geography** each give the primary visualization the full stage, with the other view floating at bottom right. Use the focus switch or expand the floating panel to swap them. The compact community graph keeps counts and reveals names on hover or keyboard focus. Filters, selections, and the map camera survive swapping. Legacy `view=connected` links open community focus.
- Select a **community** to filter institutional publication counts and coauthorships to that area. Node size follows the selected publication count; colors stay consistent across views. Institution color follows the strongest named community; gray nodes have no publications in the displayed ten groups, while composition bars always retain the full distribution. Gray represents communities outside the ten displayed areas.
- Select an **institution** from the map, network, or searchable ranking. Its inspector shows period-specific community shares; the timeline switches to its publication history. Enable **Only this institution’s connections** for a neighborhood view.
- **Drag the timeline** to choose a period, double-click the chart to restore all years, or play through years. Expand the timeline to give it more space. The selected institution’s timeline includes its whole community composition, with the chosen community emphasized.
- **Shared papers** sets the minimum edge count within the selected period/community. **Show** caps the strongest visible edges. Map links are straight projected segments. Both institution views use the same edges, with displayed and eligible totals reported. The default displays the strongest 5,000 qualifying edges with at least three shared papers. Reset restores these defaults. All institutions with matching publications remain available even when an edge cap is active. Selecting an institution retains all its qualifying links beyond the overview cap; the edge counter reports the resulting displayed total.
- **Subcommunities** retains the original lower-level citation connections, keywords, and annual shares. This analysis is explicitly all-time; institution filtering stays at the parent-community level because a subcommunity-to-institution join has not been derived.
- Search matches institution names and addresses; it does not change the corpus-wide publication total.

## Community layout and relatedness

Community nodes keep stable positions and publication counts inside the circles. Connections are straight lines. Both fixed-layout attraction and stroke width preserve the previous analysis: `log1p(citationCount) / (communitySizeA * communitySizeB)^0.35`, normalized against the strongest all-time relationship. The previous min/max rescaling and power-3.5 contrast emphasize stronger relationships. Selecting years changes the citation numerator against the same all-time reference, so the legend remains comparable; positions stay fixed. Line tooltips expose affinity and citation counts.

## Data and reproducibility

Precomputed datasets are included in `public/data/`, in JSON and compressed JSON form. They contain the community analysis, institutional aggregates, historical collaboration counts, and geographic positions used by the frontend.

The raw research inputs and original `visualization/build_atlas_data.py` pipeline remain in the separate research workspace; they are not required to run or deploy this repository.

Counts are stored as sparse `[publicationYear, communityIndex, distinctPaperCount]` triples. Community `-1` denotes papers outside the displayed ten groups, including unmatched citation metadata. Duplicate institution source rows are merged by paper ID before counting (25 duplicate IDs in the robotics input). One paper may contribute to several institutions and pairs, so summing institution or edge counts does not yield the number of unique corpus papers.

| Dataset | Citation papers | Matched to metadata | Geocoded papers | Institutions | Collaboration pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Robotics | 243,097 | 243,097 | 233,655 | 34,633 | 122,721 |
| Humanoid | 7,432 | 7,311 | 6,818 | 2,432 | 5,611 |

Citation connections use the citing paper's publication year and aggregate each pair without direction. The original community assignments remain fixed over time. Collaboration pairs are limited to pairs present in the original map network. Institution identities and coordinates use the original normalization and geocoding; existing address/campus ambiguity is retained. These constraints also appear in the app's data notes.

The geographic basemap is the Natural Earth 1:110m country dataset, distributed by `world-atlas` 2.0.2. It is local (`public/data/world.json`), so map geometry requires no external tiles or API keys. Fonts use Google Fonts with system-font fallbacks.

## Performance design

- A worker fetches, decompresses, parses and filters the evidence. Historical collaboration records remain in the worker; only matching edges are sent to the interface.
- The robotics evidence is 14.06 MB raw / 2.64 MB compressed (81% less transfer); humanoid is 0.85 MB / 0.16 MB. Uncompressed files provide a fallback for browsers without `DecompressionStream`.
- Stable, seeded DrL force layouts are computed offline. Changing filters does not run a browser force simulation or move remaining institutions to new locations.
- Helios is loaded only when opening Collaborations. WebGPU is preferred with a WebGL2 fallback. Thin-edge rendering, single-resolution rendering, and alpha blending avoid expensive supersampling and weighted transparency passes.
- Selecting an institution updates the existing Helios renderer; it does not reconstruct the graph. Dataset/edge/year changes replace only the filtered graph store, retaining the renderer, compiled shaders, and camera. Instances and workers are disposed on unmount.
- Machines with software graphics automatically use a canvas collaboration renderer, sharing the fixed positions, picking, filters, and selection. Edges are batched into paths to reduce draw overhead. `?renderer=helios` or `?renderer=canvas` can override detection for diagnostics.
- Map marks use canvas and a quadtree for picking; community and timeline SVGs stay small. Rapid filter requests are debounced, and stale worker replies are discarded.

The unit benchmark reports actual local timings rather than asserting a hardware-dependent speed target. A preliminary run measured robotics filters around 96 ms median and humanoid around 3 ms. Hardware WebGPU performance must be measured on a GPU-capable client; this workspace's Chromium browser uses software graphics, and therefore defaults to canvas. Helios is also tested with forced WebGL software rendering. These are filter-computation timings, not end-to-end frame-rate claims.

A full-network interaction test (selection, all 122,721 edges, empty search, restore) completed in approximately six seconds with the regional canvas renderer on this workspace. Forced software WebGL is substantially slower. This is a browser workflow duration, not a frame-rate measurement.

## Regional exploration

Selecting nodes preserves the main viewport dimensions. Timeline headings and the selection strip occupy fixed space, and the default timeline is shorter. Institution and community labels use larger type.

The canvas map/network support up to 512× zoom. Nodes outside the viewport are culled; connections between off-screen endpoints are omitted, and outgoing regional links fade. Node size is normalized against visible institutions, with opaque fills and larger marks for locally prominent institutions. Collision-aware labels prioritize the selected institution, its collaborators, and the most published institutions visible in the region. The Helios path uses opaque node colors, endpoint-colored edges, ranked screen-space labels, a higher camera zoom limit, and strong connected-edge selection emphasis.

In Geography, a selected institution opens a second floating map at 2× zoom or closer, with that institution and up to five collaborators ranked by shared publications within the active years/community and minimum shared-paper threshold. It fits their geographic extent together with the main viewport, outlined with a dashed rectangle. Only institutions outside the main viewport receive inset labels. The inset is independent of the overview edge display cap, but respects search and evidence filters. Zooming out below 2× hides it.

Drag the four-arrow handle on any mini panel to dock it in one of the four corners. Panels swap occupied corners; arrow keys on the handle also reposition them. Zoom controls start in the top-left corner and move to the first free corner when a visible mini panel occupies it. The view switch stays above the docking positions. Clicking empty map or network space deselects the institution; dragging remains camera navigation. Visualization interactions suppress browser text selection.

## Historical timelines

All displayed timelines and the default/reset year filter start in 1988; the generated evidence retains older records. The original citation networks and atlas totals agree exactly on 6,292 robotics papers and 171 humanoid papers from 1988 through 1999. The previous community charts showed annual percentages, whereas a short absolute-count chart compresses those early years against later peaks (19,064 robotics papers in 2015).

The main timeline defaults to an explicitly labeled square-root count scale. Users can select a linear count scale or annual community shares; hover always reports exact paper counts. Shares use all papers for that year, including other communities. At the default 1988–2022 interval, 5,000 of 12,281 qualifying robotics edges are shown (all 290 humanoid edges fit within the cap).

Co-located geographic institutions stay at their true positions through 12× zoom, then spread with a power curve that accelerates toward the 512× maximum zoom. The maximum offset spacing is 12 pixels (reduced from 14), with less than 2 pixels of spacing at 128× zoom. The most-published institution stays at the shared anchor; faint leaders connect displaced marks back to that coordinate. Original geography is unchanged. Offsets use all-time publication ranks for stable positions, while overlapping hover/click targets prioritize current-filter paper counts, then distance and institution ID. Hover and click use the same visible marker geometry. The default and reset shared-paper threshold is ≥3, with a top-5,000 display cap.

## Appearance

The small monitor/sun/moon control at the right of the header offers Automatic, Light, and Dark. Automatic follows `prefers-color-scheme`, including browser preference changes while the app is open. An explicit choice is saved under `robotics-atlas-theme` in local storage; choosing Automatic restores browser tracking. Storage restrictions do not prevent switching for the current session.

Light mode uses darker, saturated community hues consistently in the legend, compositions, community network, timelines, map, and Helios graph. Map land, borders, labels, selection outlines, and timeline controls have matching light colors. CSS surface and text tokens preserve the original dark appearance as fallbacks. Theme changes repaint existing visualization instances, retaining camera and selection; the Helios renderer updates its palette and label colors without recreating its canvas.

The header keeps navigation, search, data help, and appearance controls. Loading/filtering state is exposed with `aria-busy` without a visible status caption. Institution counts and the Papers column share a compact heading; the community legend retains only its data key. Narrative footer captions, manual year-entry controls, global reset, and selection export are omitted. Empty-result recovery still offers Reset filters.

## Evolution view

The **Evolution** tab gives the original annual-share timelines a full-width workspace. With all communities selected, ten aligned charts compare shares of the citation corpus. Select a community to see its five largest original subclusters, a fixed citation-affinity network with paper counts inside each node, a compact parent-community timeline, and five subcluster timelines stacked below it on the same horizontal year axis. The network stays beside the timeline column on desktop; on smaller screens it moves above. Subcluster percentages use all papers in the parent community as their denominator; the top five need not sum to 100%. Subcluster counts and edge affinities retain their original all-time scope.

Hovering any timeline synchronizes the year cursor across the charts. Dragging updates the shared atlas year filter; double-click restores 1988–2022. The community selector and sidebar update the same selection used by Geography and Collaborations. Subcluster selection links its graph node and timeline without inventing an institution-level join. Institution and search filters are preserved when switching views, but Evolution always shows the corpus-level citation analysis.
