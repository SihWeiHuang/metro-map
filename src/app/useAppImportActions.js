import { useCallback, useRef, useState } from "react";
import { Route } from "../map/routeModel.js";
import { requestImportedMapView } from "../map/mapViewState.js";

export function useAppImportActions(t) {
  const importInputRef = useRef(null);
  const [pendingImport, setPendingImport] = useState(null);

  const importErrorMessage = useCallback(
    (code, result) => {
      if (code === "route_limit_reached" && result?.limit != null) {
        return t("routeModel.routeLimitReached", { limit: result.limit, current: result.current });
      }
      if (code === "unsupported_format") return t("app.importErrorUnsupported");
      if (code === "missing_features") return t("app.importErrorMissing");
      if (code === "invalid_json") return t("app.importErrorInvalid");
      return t("app.importErrorGeneric");
    },
    [t],
  );

  const applyImport = useCallback(
    (text, mode) => {
      const result = Route.importUserStateJSON(text, { mode });
      if (!result.ok) {
        alert(importErrorMessage(result.error, result));
        return;
      }
      const successKey =
        result.mode === "replaceMatching" ? "app.importSuccessReplaceMatching" : "app.importSuccess";
      const successVars =
        result.mode === "replaceMatching"
          ? {
              replacedRoutes: result.replacedRouteCount,
              addedRoutes: result.addedRouteCount,
              stations: result.stationCount,
            }
          : {
              routes: result.routeCount,
              stations: result.stationCount,
            };
      alert(t(successKey, successVars));
      requestImportedMapView(result.mapView);
    },
    [importErrorMessage, t],
  );

  const handleImportFile = useCallback(
    async (file) => {
      if (!file) return;
      let text;
      try {
        text = await file.text();
      } catch {
        alert(t("app.importErrorInvalid"));
        return;
      }
      if (Route.hasUserContent()) {
        const analysis = Route.analyzeImportJSON(text);
        if (!analysis.ok) {
          alert(importErrorMessage(analysis.error));
          return;
        }
        if (analysis.duplicateRouteIds.length === 0) {
          applyImport(text, "merge");
          return;
        }
        setPendingImport({
          text,
          duplicateRouteLabels: analysis.duplicateRouteLabels,
        });
        return;
      }
      applyImport(text, "merge");
    },
    [applyImport, importErrorMessage, t],
  );

  const handleExportMap = useCallback(() => {
    const json = Route.exportUserStateJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = Route.getExportFileName();
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleUndoLastImport = useCallback(() => {
    const result = Route.undoLastImport();
    if (!result.ok) return;
    alert(t("app.undoLastImportSuccess"));
    requestImportedMapView(result.mapView);
  }, [t]);

  const closeImportDialog = useCallback(() => setPendingImport(null), []);

  const confirmImportWithMode = useCallback(
    (mode) => {
      if (pendingImport == null) return;
      const { text } = pendingImport;
      setPendingImport(null);
      applyImport(text, mode);
    },
    [applyImport, pendingImport],
  );

  const handleImportMapClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  return {
    importInputRef,
    pendingImport,
    importErrorMessage,
    handleImportFile,
    handleExportMap,
    handleUndoLastImport,
    closeImportDialog,
    confirmImportWithMode,
    handleImportMapClick,
  };
}
