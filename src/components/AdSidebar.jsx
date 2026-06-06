import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import {
  AD_SIDEBAR_SLOT_MIN_HEIGHT_PX,
  AD_SIDEBAR_WIDTH_PX,
} from "../site/adSidebarConfig.js";
import { ADSENSE_CLIENT, ADSENSE_SLOT, isAdsenseConfigured } from "../site/adsenseConfig.js";

function pushAdSenseUnit() {
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    /* script not ready */
  }
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

    const existing = document.querySelector(`script[data-adsense-client="${ADSENSE_CLIENT}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") run();
      else existing.addEventListener("load", run, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
    script.crossOrigin = "anonymous";
    script.dataset.adsenseClient = ADSENSE_CLIENT;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "1";
        run();
      },
      { once: true }
    );
    document.head.appendChild(script);
  }, [configured]);

  const slotStyle = ADSENSE_SLOT
    ? {
        display: "inline-block",
        width: `${AD_SIDEBAR_WIDTH_PX}px`,
        height: `${AD_SIDEBAR_SLOT_MIN_HEIGHT_PX}px`,
      }
    : {
        display: "block",
        width: `${AD_SIDEBAR_WIDTH_PX}px`,
        minHeight: `${AD_SIDEBAR_SLOT_MIN_HEIGHT_PX}px`,
      };

  return (
    <aside className="ad-sidebar" role="complementary" aria-label={t("adSidebar.ariaLabel")}>
      <div className="ad-sidebar-inner">
        <p className="ad-sidebar-label">{t("adSidebar.label")}</p>
        <div className="ad-sidebar-slot">
          {configured ? (
            <ins
              ref={slotRef}
              className="adsbygoogle"
              style={slotStyle}
              data-ad-client={ADSENSE_CLIENT}
              {...(ADSENSE_SLOT ? { "data-ad-slot": ADSENSE_SLOT } : { "data-ad-format": "auto" })}
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
