import { useI18n } from "../i18n/I18nProvider.jsx";

/**
 * Compact share-view controls (map overlay). Keeps actions without a tall header bar.
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
    <div className="app-share-view-chip" role="region" aria-label={t("share.viewBannerAria")}>
      <p className="app-share-view-chip-hint">{t("share.viewBannerHintShort")}</p>
      {expiresLabel ? (
        <span className="app-share-view-chip-expires" title={t("share.viewExpires", { date: expiresLabel })}>
          {t("share.viewExpiresShort", { date: expiresLabel })}
        </span>
      ) : null}
      <div className="app-share-view-chip-actions">
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
