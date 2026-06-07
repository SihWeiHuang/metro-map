import { useI18n } from "../i18n/I18nProvider.jsx";
import { getAboutContent } from "../site/aboutContent.js";
import { getContactContent } from "../site/contactContent.js";
import { getPageContent } from "../site/pageContent.js";
import { getSupportContent } from "../site/supportContent.js";
import SiteAboutPage from "./SiteAboutPage.jsx";
import SiteContactPage from "./SiteContactPage.jsx";
import SiteSupportPage from "./SiteSupportPage.jsx";

/**
 * @param {{ pageId: import('../site/siteRoutes.js').SitePageId, onClose: () => void, adGutter?: boolean }} props
 */
export default function SiteInfoPage({ pageId, onClose, adGutter = false }) {
  const { t, locale } = useI18n();
  const aboutContent = pageId === "about" ? getAboutContent(locale) : null;
  const supportContent = pageId === "support" ? getSupportContent(locale) : null;
  const contactContent = pageId === "contact" ? getContactContent(locale) : null;
  const content =
    pageId === "about"
      ? aboutContent
      : pageId === "support"
        ? supportContent
        : pageId === "contact"
          ? contactContent
          : getPageContent(pageId, locale);

  if (!content) return null;

  return (
    <div
      className={`site-info-overlay${adGutter ? " site-info-overlay--ad-gutter" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-info-title"
    >
      <div
        className={`site-info-panel${
          pageId === "about"
            ? " site-info-panel--about"
            : pageId === "support"
              ? " site-info-panel--support"
              : pageId === "contact"
                ? " site-info-panel--contact"
                : ""
        }`}
      >
        <header className="site-info-header">
          <h2 id="site-info-title" className="site-info-title">
            {content.title}
          </h2>
          <button type="button" className="site-info-close" onClick={onClose}>
            {t("site.backToMap")}
          </button>
        </header>
        <div className="site-info-body">
          {pageId === "about" ? (
            <SiteAboutPage locale={locale} />
          ) : pageId === "support" ? (
            <SiteSupportPage locale={locale} />
          ) : pageId === "contact" ? (
            <SiteContactPage locale={locale} />
          ) : (
            <>
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
              {section.list?.length > 0 && (
                <ul className="site-info-list">
                  {section.list.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
              {section.links?.length > 0 && (
                <ul className="site-info-list site-info-link-list">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} target="_blank" rel="noopener noreferrer">
                        {link.label}
                      </a>
                    </li>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
