# Performance Baseline

**Recorded:** 2026-06-11  
**Environment:** Node 22, Apple Silicon (local dev machine)  
**Data:** `default-data/metro-multiverse-2026-06-09.json` — 19 subroutes, 211 stations

Run baseline: `npm run test:perf-baseline`

## CPU Hot Paths (Node simulation)

| Metric | Median (ms) | Notes |
|--------|-------------|-------|
| `refreshSources.smoothRoutes` | 0.17 | Catmull–Rom for all routes |
| `refreshSources.stationSnap` | **364.74** | Dominant cost: Turf `nearestPointOnLine` × stations |
| `refreshSources.fullPipeline` | 356.60 | smooth + snap (snap dominates) |
| `editStation.transferSnapBuild` | **974.73** | O(R²) pair scan, 171 pairs |
| `persist.JSON.stringify` | 0.36 | User-only payload ~95 KB |

## Bundle

| Asset | Size |
|-------|------|
| `dist/assets` total | 2.26 MB |
| Main JS chunk | ~2202 KB (includes eager default-data JSON) |

## Browser-only (manual checklist)

| Operation | Baseline observation | Phase 2 target |
|-----------|---------------------|----------------|
| Edit single station (mouseup) | Full `refreshSources` ~350ms+ CPU | < 50ms perceived |
| Drag station (mousemove) | No rAF; Turf per event | 60fps with rAF throttle |
| Enter edit-station mode | transfer snap ~1s idle | < 200ms with spatial index |
| Locale switch | Full map destroy + double pipeline | `setLanguage` only |
| Color preview drag | 5× setData @ ~60/s | Partial setData / skip smooth |

## Phase 2 Success Criteria

- `refreshSources` full-path calls reduced ≥50% for single-route edits
- Station drag uses rAF coalescing
- Transfer snap build median < 200ms at current data scale
- Persist not triggered from render-only refresh paths
