import { useEffect, useState } from "react";
import { Route } from "../map/routeModel.js";
import { parseShareIdFromPathname } from "../share/parseSharePath.js";
import { fetchShareById } from "../share/shareApi.js";

function initialShareBootstrap() {
  if (typeof window === "undefined") return { phase: "idle", id: null, error: "" };
  const id = parseShareIdFromPathname(window.location.pathname);
  return id ? { phase: "loading", id, error: "" } : { phase: "idle", id: null, error: "" };
}

export function useShareBootstrap({ onReady }) {
  const [shareBootstrap, setShareBootstrap] = useState(initialShareBootstrap);

  useEffect(() => {
    if (shareBootstrap.phase !== "loading" || !shareBootstrap.id) return;
    let cancelled = false;
    (async () => {
      const fetched = await fetchShareById(shareBootstrap.id);
      if (cancelled) return;
      if (!fetched.ok) {
        setShareBootstrap({ phase: "error", id: shareBootstrap.id, error: fetched.error });
        return;
      }
      const opened = Route.openShareView(fetched.payload, { expiresAt: fetched.expiresAt });
      if (!opened.ok) {
        setShareBootstrap({ phase: "error", id: shareBootstrap.id, error: opened.error || "import_failed" });
        return;
      }
      setShareBootstrap({ phase: "ready", id: shareBootstrap.id, error: "" });
      onReady?.(opened.mapView);
    })();
    return () => {
      cancelled = true;
    };
  }, [shareBootstrap.phase, shareBootstrap.id, onReady]);

  const dismissShareLoadError = () => {
    window.history.replaceState(null, "", window.location.pathname);
    setShareBootstrap({ phase: "idle", id: null, error: "" });
  };

  const resetShareBootstrap = () => {
    setShareBootstrap({ phase: "idle", id: null, error: "" });
  };

  return { shareBootstrap, setShareBootstrap, dismissShareLoadError, resetShareBootstrap };
}

export function dismissSharePathIfPresent(setShareBootstrap) {
  if (typeof window === "undefined") return;
  if (!parseShareIdFromPathname(window.location.pathname)) return;
  window.history.replaceState(null, "", "/");
  setShareBootstrap({ phase: "idle", id: null, error: "" });
}
