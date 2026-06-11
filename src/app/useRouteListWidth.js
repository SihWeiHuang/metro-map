import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROUTE_LIST_MIN_PX,
  ROUTE_LIST_WIDTH_STORAGE_KEY,
  readStoredRouteListWidth,
  routeListMaxPx,
} from "./routeListWidthPrefs.js";

export function useRouteListWidth() {
  const [routeListWidthPx, setRouteListWidthPx] = useState(readStoredRouteListWidth);
  const routeListWidthRef = useRef(routeListWidthPx);
  routeListWidthRef.current = routeListWidthPx;

  const startRouteListResize = useCallback((clientX) => {
    const startX = clientX;
    const startW = routeListWidthRef.current;
    let last = startW;
    const move = (ev) => {
      if ("touches" in ev && ev.touches.length > 0) {
        ev.preventDefault();
      }
      const x = "touches" in ev && ev.touches.length > 0 ? ev.touches[0].clientX : ev.clientX;
      const maxW = routeListMaxPx();
      const next = Math.min(maxW, Math.max(ROUTE_LIST_MIN_PX, startW + (x - startX)));
      last = next;
      setRouteListWidthPx(next);
    };
    const end = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(ROUTE_LIST_WIDTH_STORAGE_KEY, String(last));
      } catch (_) {}
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
  }, []);

  useEffect(() => {
    const onWinResize = () => {
      setRouteListWidthPx((w) => {
        const maxW = routeListMaxPx();
        return Math.min(maxW, Math.max(ROUTE_LIST_MIN_PX, w));
      });
    };
    window.addEventListener("resize", onWinResize);
    return () => window.removeEventListener("resize", onWinResize);
  }, []);

  return { routeListWidthPx, startRouteListResize };
}
