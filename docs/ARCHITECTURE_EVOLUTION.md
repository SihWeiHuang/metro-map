# Metro Multiverse — Architecture Evolution

Living document for the Phase 0–6 evolution program. External behavior, data formats, and UI must remain unchanged.

## Step Delivery Template (mandatory from Phase 2)

Each Step completion must record:

### Modified files
- List every changed/added file with one-line purpose.

### Reason
- Why this change; which Priority (P1–P4) item it addresses.

### Risk analysis
- What could break; severity (high/medium/low).

### Rollback plan
- `git revert <commit>` or restore specific files; feature-flag off if applicable.

### Expected benefit
- Measurable where possible (ms, call count, line count).

### Downstream impact
- Which later Phases depend on this; API surface changes (should be internal only).

---

## Rollback Policy

1. **One Step = one commit** when possible; message prefix `evolution(phaseN-stepM):`.
2. **Strangler rule:** new path must pass full manual regression before deleting old path in the same Step.
3. **Facade rule:** `Route.*` public API unchanged until explicitly deprecated in a later Phase.
4. **Data rule:** never change `metro-map-data-v2`, import format, or share API payload in evolution Phases.
5. **Emergency rollback:** revert the Step commit; run `npm run test:names && npm run test:share-limits && npm run test:geo-catalog && npm run test:perf-baseline`.

---

## Phase 1 — Domain Boundary Contracts

### Route Domain (`src/data/`, `src/metro/metroCommands.js`)

| Owns | Does not own |
|------|----------------|
| `metroStore` GeoJSON + metadata | Mapbox sources/layers |
| CRUD, merge/split, import/export | React UI state |
| Share view session overlay | Popup DOM |

**Public surface:** existing `Route.*` facade (re-export).

### Map Domain (`src/map-runtime/`, `src/map/modeController.js`)

| Owns | Does not own |
|------|----------------|
| Display geometry (smooth/snap) | Persist payload |
| `mapRenderer` setData/setFilter | Route business rules |
| Mode interaction orchestration | Route list React tree |

### Storage Domain (`src/metro/persistenceAdapter.js`)

| Owns | Does not own |
|------|----------------|
| localStorage read/write | GeoJSON mutations |
| Debounced persist scheduling | Share KV API |

### Share Domain (unchanged `shareApi.js`, `api/share/`)

Read-only share fetch + existing POST limits.

### UI Domain (`App.jsx`, components, `src/metro/*` hooks)

| Owns | Does not own |
|------|----------------|
| React state for mode/hints/share bootstrap | Direct `store` mutation |
| Subscribes via `useMetroStoreRevision` | Map event handlers |

### Event bus (`src/metro/metroEvents.js`)

Replaces module-level `register*` callbacks:

```js
emitMetroEvent("store:changed", { revision })
emitMetroEvent("mode:changed", { mode })
emitMetroEvent("shareView:changed", { active })
```

---

## Phase 1 — Dirty Tracking Design

### Revision counters

- `storeRevision` — any store mutation affecting route list
- `geometryRevision` — subroute coordinate changes (invalidates transfer snap + smooth cache)
- `displayRevision` — per-subroute dirty set for incremental display rebuild

### Render modes (`mapRenderer`)

| Mode | When | Work |
|------|------|------|
| `fullSync` | init, import, share open/exit, reset | Full smooth + snap + 5× setData |
| `applyDirty` | single-route edit, station move, hide toggle | Rebuild dirty subroutes + affected stations only |
| `previewSync` | color drag | Cached smooth; partial property patch |
| `tempSync` | route vertex drag | temp-edit sources only |
| `visibilitySync` | hidden routes change | filters only |

### Persist decoupling

- `schedulePersistToStorage()` called from **command completion**, not from `mapRenderer`.
- Preview/temp paths never persist.

---

## Phase 1 — Regression Test Matrix

| Scenario | Verify |
|----------|--------|
| Fresh load | Default routes visible; map camera restored |
| Add/edit/delete route | List + map sync; localStorage updated |
| Edit station + transfer | Snap points; save/cancel |
| Import merge/replace | Undo available; route limit enforced |
| Share open/view/exit/adopt | No persist during view; restore on exit |
| Reset to default | All `metro-*` keys cleared |
| Locale zh ↔ en | Labels/mode hints; map language |
| Hidden routes | Filter correct on routes + stations |
| Color preview drag | Smooth preview; commit on mouseup |

Automated: `npm run test:names`, `test:share-limits`, `test:geo-catalog`, `test:route-list-nav`, `test:perf-baseline`.

---

## Module Map (target end state)

```
src/data/metroStore.js          — authoritative store
src/data/routeQueries.js        — read-only queries
src/data/routeConstants.js      — shared constants
src/map-runtime/displayModel.js — derived geometry + dirty tracking
src/map-runtime/mapRenderer.js  — sole Mapbox writer
src/map-runtime/mapAdapter.js   — map abstraction interface
src/map-runtime/mapboxAdapter.js
src/map-runtime/mapLibreAdapter.stub.js
src/metro/metroEvents.js
src/metro/domainNotifier.js
src/metro/persistenceAdapter.js
src/metro/*Boundary.js + useMetro*.js
src/map/modeController.js       — facade over modeBundle
src/map/routeModel.js           — thin Route facade
```

See [PERFORMANCE_BASELINE.md](./PERFORMANCE_BASELINE.md) for metrics.

---

## Phase 6 — Map Engine Adapter Prep

### Goal

Reduce direct `mapbox-gl` coupling in map interaction and layer code; centralize engine-specific bootstrap so a future MapLibre swap touches few files.

### Module layout

| Module | Role |
|--------|------|
| `mapTypes.js` | Engine-neutral `MapLike` JSDoc types |
| `mapAdapter.js` | Shared map API (sources, layers, filters, query, events) |
| `mapboxAdapter.js` | Re-export adapter (active engine) |
| `mapboxRuntime.js` | **Only** Map / NavigationControl / Popup construction + CSS |
| `mapLibreAdapter.stub.js` | Mirror adapter surface; throws until wired |
| `mapEngine.js` | `VITE_MAP_ENGINE` selector (default `mapbox`) |

### Migration status (Phase 6 Step 1)

- `layers.js`, `visibilityFilters.js`, `mapHoverFilters.js`, `stationLabelCollision.js`, `labelMoveFrameImage.js`, `modeBundle/layers.js` → `mapAdapter`
- `MapView.jsx`, `mapPopups.js` → `mapboxRuntime` for construction only
- Remaining direct `mapbox-gl` types: event handlers in `modeBundle/*`, `popupPlacement.js`, `mapViewState.js` (JSDoc only; no runtime import)

### MapLibre checklist (future)

1. Implement `mapLibreAdapter.js` with same exports as `mapAdapter.js`
2. Add `maplibreRuntime.js` (style URL, token env)
3. Switch `mapEngine.js` on `VITE_MAP_ENGINE=maplibre`
4. Verify Standard-style slots / `setLanguage` equivalents
5. Full manual regression matrix
