/**
 * Route domain facade — re-exports service modules (Phase 3).
 */
import { store } from "../data/metroStore.js";
export { store };
import {
  EXPORT_FILE_FORMAT,
  ROUTE_KIND_DEFAULT,
  ROUTE_KIND_USER,
  ROUTE_STATUS_CONSTRUCTION,
  ROUTE_STATUS_CUSTOM,
  ROUTE_STATUS_OPERATING,
  ROUTE_STATUS_PLANNING,
} from "../data/routeConstants.js";
import { subscribeGeometryRevisionBump } from "../metro/geometryRevisionBoundary.js";
import { subscribeImportUndoAvailability } from "../metro/importUndoBoundary.js";
import { flushPersistToStorage, schedulePersistToStorage } from "../metro/persistenceAdapter.js";
import { STATION_NAME_MAX_LEN } from "../metro/routeStoreMutations.js";
import * as routeCrud from "../metro/routeCrudService.js";
import * as routeImport from "../metro/routeImportService.js";
import * as routeShare from "../metro/routeShareService.js";
import * as routeHover from "../metro/routeHoverCommands.js";
import * as routeRender from "../metro/routeRenderCommands.js";
import {
  TRANSFER_SNAP_CLICK_METERS,
  TRANSFER_SNAP_HOVER_METERS,
  cancelScheduledTransferSnapRefresh,
  ensureTransferSnapSourceReady,
  findNearestTransferSnap,
  isTransferSnapCacheFresh,
  isTransferSnapOccupied,
  refreshTransferSnapSource,
  scheduleRefreshTransferSnapSource,
} from "./routeTransferSnap.js";
import { MAX_USER_ROUTES } from "../../shared/shareLimits.js";
import {
  formatGeoPatch,
  getCatalogMapView,
  getCountryLabelKey,
  collectGeoPairsFromRoutes,
} from "./geoCatalog.js";
import {
  resolveRouteDisplayName,
  resolveRouteDisplayNameFromProps,
  resolveStationDisplayName,
} from "./defaultNames.js";

export {
  EXPORT_FILE_FORMAT,
  ROUTE_KIND_DEFAULT,
  ROUTE_KIND_USER,
  ROUTE_STATUS_CONSTRUCTION,
  ROUTE_STATUS_CUSTOM,
  ROUTE_STATUS_OPERATING,
  ROUTE_STATUS_PLANNING,
  flushPersistToStorage,
  schedulePersistToStorage,
  STATION_NAME_MAX_LEN,
  subscribeGeometryRevisionBump,
  TRANSFER_SNAP_HOVER_METERS,
  TRANSFER_SNAP_CLICK_METERS,
  findNearestTransferSnap,
  isTransferSnapOccupied,
  cancelScheduledTransferSnapRefresh,
  scheduleRefreshTransferSnapSource,
  ensureTransferSnapSourceReady,
  isTransferSnapCacheFresh,
};

export const Route = {
  ROUTE_KIND_DEFAULT,
  ROUTE_KIND_USER,
  ROUTE_STATUS_OPERATING,
  ROUTE_STATUS_PLANNING,
  ROUTE_STATUS_CONSTRUCTION,
  ROUTE_STATUS_CUSTOM,
  ...routeCrud,
  ...routeHover,
  highlightRoute: routeHover.highlightRoute,
  highlightPassingSubroutes: routeHover.highlightPassingSubroutes,
  clearHover: routeHover.clearHover,
  refreshSources: routeRender.refreshSources,
  refreshTempEditSources: routeRender.refreshTempEditSources,
  refreshTransferSnapSource,
  scheduleRefreshTransferSnapSource,
  ensureTransferSnapSourceReady,
  cancelScheduledTransferSnapRefresh,
  isTransferSnapCacheFresh,
  subscribeGeometryRevisionBump,
  resolveRouteDisplayName,
  resolveRouteDisplayNameFromProps,
  resolveStationDisplayName,
  formatGeoPatch,
  getCatalogMapView,
  getCountryLabelKey,
  collectGeoPairsFromRoutes,
  ...routeImport,
  ...routeShare,
  subscribeImportUndoAvailability,
  getMaxUserRoutes: () => MAX_USER_ROUTES,
  _store: store,
};
