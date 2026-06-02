import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { getPageContent } from "../site/pageContent.js";

/**
 * @param {{ pageId: import('../site/siteRoutes.js').SitePageId, onClose: () => void }} props
 */
export default function SiteInfoPage({ pageId, onClose }) {
  const { t, locale } = useI18n();
  const content = getPageContent(pageId, locale);
  const [emailCopyState, setEmailCopyState] = useState("idle");
  const emailCopyResetTimer = useRef(null);

  useEffect(() => {
    setEmailCopyState("idle");
    if (emailCopyResetTimer.current) {
      clearTimeout(emailCopyResetTimer.current);
      emailCopyResetTimer.current = null;
    }
  }, [pageId]);

  useEffect(() => {
    return () => {
      if (emailCopyResetTimer.current) clearTimeout(emailCopyResetTimer.current);
    };
  }, []);

  const handleCopyContactEmail = async (email) => {
    try {
      await navigator.clipboard.writeText(email);
      setEmailCopyState("copied");
      if (emailCopyResetTimer.current) clearTimeout(emailCopyResetTimer.current);
      emailCopyResetTimer.current = setTimeout(() => {
        setEmailCopyState("idle");
        emailCopyResetTimer.current = null;
      }, 2000);
    } catch {
      setEmailCopyState("error");
    }
  };

  if (!content) return null;

  return (
    <div className="site-info-overlay" role="dialog" aria-modal="true" aria-labelledby="site-info-title">
      <div className="site-info-panel">
        <header className="site-info-header">
          <h2 id="site-info-title" className="site-info-title">
            {content.title}
          </h2>
          <button type="button" className="site-info-close" onClick={onClose}>
            {t("site.backToMap")}
          </button>
        </header>
        <div className="site-info-body">
          {content.intro && <p className="site-info-intro">{content.intro}</p>}
          {content.sections.map((section) => (
            <section key={section.id} className="site-info-section" aria-labelledby={`site-section-${section.id}`}>
              <h3 id={`site-section-${section.id}`} className="site-info-section-title">
                {section.title}
              </h3>
              {section.paragraphs?.map((para, i) => (
                <p key={i} className="site-info-paragraph">
                  {para}
                </p>
              ))}
              {section.contactEmail && (
                <div className="site-info-contact">
                  <p className="site-info-paragraph site-info-contact-email">
                    <a href={`mailto:${section.contactEmail}`} className="site-info-mail-link">
                      {section.contactEmail}
                    </a>
                  </p>
                  <button
                    type="button"
                    className="site-info-copy-email-btn"
                    onClick={() => handleCopyContactEmail(section.contactEmail)}
                  >
                    {emailCopyState === "copied" ? t("site.emailCopied") : t("site.copyEmail")}
                  </button>
                  {emailCopyState === "error" ? (
                    <p className="site-info-copy-email-error" role="alert">
                      {t("site.emailCopyFailed")}
                    </p>
                  ) : null}
                </div>
              )}
              {section.list?.length > 0 && (
                <ul className="site-info-list">
                  {section.list.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
              {section.sponsorUrl && (
                <p className="site-info-sponsor-action">
                  <a
                    href={section.sponsorUrl}
                    className="site-info-sponsor-btn"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("site.openSponsor")}
                  </a>
                </p>
              )}
            </section>
          ))}
          {content.footerNote && <p className="site-info-footer-note">{content.footerNote}</p>}
        </div>
      </div>
    </div>
  );
}
