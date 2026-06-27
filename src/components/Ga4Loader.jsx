import { useEffect } from "react";
import { GA4_MEASUREMENT_ID, isGa4Configured } from "../site/ga4Config.js";

function ga4PagePath() {
  const hash = window.location.hash.replace(/^#/, "").trim();
  if (!hash) return "/";
  return hash.startsWith("/") ? hash : `/${hash}`;
}

function ensureGtagStub() {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }
}

function sendPageView() {
  if (!isGa4Configured()) return;
  ensureGtagStub();
  window.gtag("config", GA4_MEASUREMENT_ID, { page_path: ga4PagePath() });
}

/** Loads GA4 gtag.js once and tracks hash-based site pages in this SPA. */
export default function Ga4Loader() {
  useEffect(() => {
    if (!isGa4Configured()) return;

    ensureGtagStub();
    window.gtag("js", new Date());

    const id = GA4_MEASUREMENT_ID;
    if (!document.querySelector(`script[data-ga4-id="${id}"]`)) {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      script.dataset.ga4Id = id;
      document.head.appendChild(script);
    }

    sendPageView();

    const onHashChange = () => sendPageView();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return null;
}
