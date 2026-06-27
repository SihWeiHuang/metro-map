import { useEffect } from "react";
import { GA4_MEASUREMENT_ID, isGa4Configured } from "../site/ga4Config.js";

function ga4PagePath() {
  const hash = window.location.hash.replace(/^#/, "").trim();
  if (!hash) return "/";
  return hash.startsWith("/") ? hash : `/${hash}`;
}

function sendPageView() {
  if (!isGa4Configured() || typeof window.gtag !== "function") return;
  window.gtag("config", GA4_MEASUREMENT_ID, { page_path: ga4PagePath() });
}

/** Sends virtual page views when hash routes change (gtag snippet lives in index.html head). */
export default function Ga4Loader() {
  useEffect(() => {
    if (!isGa4Configured()) return;

    const onHashChange = () => sendPageView();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return null;
}
