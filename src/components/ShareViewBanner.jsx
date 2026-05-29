import { useI18n } from "../i18n/I18nProvider.jsx";

/**
 * @param {{
 *   expiresAt: string | null,
 *   busy: boolean,
 *   onAdopt: () => void,
 *   onExit: () => void,
 * }} props
 */
export default function ShareViewBanner({ expiresAt, busy, onAdopt, onExit }) {
  const { t } = useI18n();

  const formatExpiresAt = (iso) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  const expiresLabel = expiresAt ? formatExpiresAt(expiresAt) : null;

  return (
    <div className="app-share-view-banner" role="region" aria-label={t("share.viewBannerAria")}>
      <div className="app-share-view-banner-text">
        <strong>{t("share.viewBannerTitle")}</strong>
        <span>{t("share.viewBannerHint")}</span>
        {expiresLabel ? <span className="app-share-view-banner-expires">{t("share.viewExpires", { date: expiresLabel })}</span> : null}
      </div>
      <div className="app-share-view-banner-actions">
        <button type="button" className="app-share-view-btn app-share-view-btn--primary" disabled={busy} onClick={onAdopt}>
          {t("share.adoptToMyMap")}
        </button>
        <button type="button" className="app-share-view-btn" disabled={busy} onClick={onExit}>
          {t("share.exitView")}
        </button>
      </div>
    </div>
  );
}
