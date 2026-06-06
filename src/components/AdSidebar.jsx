import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { ADSENSE_CLIENT, ADSENSE_SLOT, isAdsenseConfigured } from "../site/adsenseConfig.js";

function pushAdSenseUnit() {
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    /* script not ready */
  }
}

function waitForAdSenseScript(clientId, onReady) {
  const existing = document.querySelector(`script[data-adsense-client="${clientId}"]`);
  if (existing?.dataset.loaded === "1") {
    onReady();
    return undefined;
  }

  if (existing) {
    existing.addEventListener("load", onReady, { once: true });
    return undefined;
  }

  const interval = window.setInterval(() => {
    if (document.querySelector(`script[data-adsense-client="${clientId}"][data-loaded="1"]`)) {
      window.clearInterval(interval);
      onReady();
    }
  }, 200);

  return interval;
}

export default function AdSidebar() {
  const { t } = useI18n();
  const slotRef = useRef(null);
  const pushedRef = useRef(false);
  const configured = isAdsenseConfigured();

  useEffect(() => {
    if (!configured || !slotRef.current || pushedRef.current) return;

    const run = () => {
      if (!slotRef.current || pushedRef.current) return;
      pushAdSenseUnit();
      pushedRef.current = true;
    };

    const interval = waitForAdSenseScript(ADSENSE_CLIENT, run);
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [configured]);

  return (
    <aside className="ad-sidebar" role="complementary" aria-label={t("adSidebar.ariaLabel")}>
      <div className="ad-sidebar-inner">
        <p className="ad-sidebar-label">{t("adSidebar.label")}</p>
        <div className="ad-sidebar-slot">
          {configured ? (
            <ins
              ref={slotRef}
              className="adsbygoogle"
              data-ad-client={ADSENSE_CLIENT}
              {...(ADSENSE_SLOT ? { "data-ad-slot": ADSENSE_SLOT } : { "data-ad-format": "vertical" })}
            />
          ) : (
            <div className="ad-sidebar-review-placeholder">
              <span className="ad-sidebar-review-badge">AdSense</span>
              <span className="ad-sidebar-review-text">{t("adSidebar.reviewPlaceholder")}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
