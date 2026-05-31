import { useCallback, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { Route } from "../map/routeModel.js";
import { createShareLink } from "../share/shareApi.js";
import { buildShareUrl } from "../share/parseSharePath.js";
import {
  MAX_SHARE_PAYLOAD_BYTES,
  MAX_USER_ROUTES,
  SHARE_TTL_DAYS,
  validateSharePayloadText,
} from "../../shared/shareLimits.js";

/**
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function ShareLinkDialog({ open, onClose }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [copied, setCopied] = useState(false);

  const resetState = useCallback(() => {
    setBusy(false);
    setShareUrl("");
    setExpiresAt("");
    setErrorCode("");
    setCopied(false);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleCreate = async () => {
    if (!Route.hasUserContent()) return;
    setBusy(true);
    setErrorCode("");
    setShareUrl("");
    setCopied(false);

    const json = Route.exportUserStateJSON();
    const validation = validateSharePayloadText(json);
    if (!validation.ok) {
      setErrorCode(validation.code);
      setBusy(false);
      return;
    }

    const byteLen = new TextEncoder().encode(json).length;
    if (byteLen > MAX_SHARE_PAYLOAD_BYTES) {
      setErrorCode("payload_too_large");
      setBusy(false);
      return;
    }

    const result = await createShareLink(json);
    setBusy(false);
    if (!result.ok) {
      setErrorCode(result.error);
      return;
    }
    setShareUrl(buildShareUrl(result.id));
    setExpiresAt(result.expiresAt);
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setErrorCode("copy_failed");
    }
  };

  const formatExpiresAt = (iso) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  const errorMessage = (code) => {
    if (code === "payload_too_large") return t("share.errorPayloadTooLarge");
    if (code === "too_many_routes") return t("share.errorTooManyRoutes", { limit: MAX_USER_ROUTES });
    if (code === "no_routes") return t("share.errorNoRoutes");
    if (code === "rate_limited") return t("share.errorRateLimited");
    if (code === "kv_not_configured") return t("share.errorNotConfigured");
    if (code === "network_error") return t("share.errorNetwork");
    if (code === "copy_failed") return t("share.errorCopy");
    return t("share.errorGeneric");
  };

  if (!open) return null;

  const hasRoutes = Route.hasUserContent();
  const maxKb = Math.round(MAX_SHARE_PAYLOAD_BYTES / 1024);

  return (
    <div className="app-import-dialog-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="app-import-dialog app-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="share-dialog-title" className="app-import-dialog-title">
          {t("share.dialogTitle")}
        </h2>
        <p className="app-import-dialog-message">{t("share.dialogIntro")}</p>
        <ul className="app-share-limits">
          <li>{t("share.limitTtl", { days: SHARE_TTL_DAYS })}</li>
          <li>{t("share.limitSize", { maxKb })}</li>
          <li>{t("share.limitRoutes", { limit: MAX_USER_ROUTES })}</li>
          <li>{t("share.limitOptIn")}</li>
        </ul>
        {!hasRoutes && <p className="app-share-warning">{t("share.noUserRoutes")}</p>}
        {errorCode ? <p className="app-share-error" role="alert">{errorMessage(errorCode)}</p> : null}
        {shareUrl ? (
          <div className="app-share-result">
            <label className="app-share-url-label" htmlFor="share-url-field">
              {t("share.urlLabel")}
            </label>
            <input id="share-url-field" className="app-share-url-input" type="text" readOnly value={shareUrl} />
            {expiresAt ? (
              <p className="app-share-expires">{t("share.expiresAt", { date: formatExpiresAt(expiresAt) })}</p>
            ) : null}
            <div className="app-share-result-actions">
              <button type="button" className="app-import-dialog-btn app-import-dialog-btn--primary" onClick={handleCopy}>
                {copied ? t("share.copied") : t("share.copyLink")}
              </button>
            </div>
          </div>
        ) : null}
        <div className="app-import-dialog-actions app-share-dialog-actions">
          {!shareUrl ? (
            <button
              type="button"
              className="app-import-dialog-btn app-import-dialog-btn--primary"
              disabled={!hasRoutes || busy}
              onClick={handleCreate}
            >
              {busy ? t("share.creating") : t("share.createLink")}
            </button>
          ) : null}
          <button type="button" className="app-import-dialog-btn app-import-dialog-btn--cancel" onClick={handleClose}>
            {t("app.importCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
