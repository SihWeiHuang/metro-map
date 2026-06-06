import { useEffect } from "react";
import { ADSENSE_CLIENT } from "../site/adsenseConfig.js";

/** Loads AdSense script once (site verification + ad fill). */
export default function AdSenseLoader() {
  useEffect(() => {
    if (!ADSENSE_CLIENT) return;
    if (document.querySelector(`script[data-adsense-client="${ADSENSE_CLIENT}"]`)) return;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
    script.crossOrigin = "anonymous";
    script.dataset.adsenseClient = ADSENSE_CLIENT;
    document.head.appendChild(script);
  }, []);

  return null;
}
