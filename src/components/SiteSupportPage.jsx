import { useI18n } from "../i18n/I18nProvider.jsx";
import { getSupportContent } from "../site/supportContent.js";

/** @typedef {'zh-Hant' | 'en'} SiteLocale */

/**
 * @param {{ locale: SiteLocale }} props
 */
export default function SiteSupportPage({ locale }) {
  const { t } = useI18n();
  const content = getSupportContent(locale);

  return (
    <div className="site-support">
      <header className="site-support-hero">
        <p className="site-support-kicker">{content.intro.kicker}</p>
        <p className="site-support-lead">{content.intro.text}</p>
      </header>

      <section className="site-support-block" aria-labelledby="site-support-why">
        <h3 id="site-support-why" className="site-support-heading">
          {content.whySupport.heading}
        </h3>
        <p className="site-support-text">{content.whySupport.intro}</p>
        <ul className="site-support-list">
          {content.whySupport.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="site-support-block" aria-labelledby="site-support-roadmap">
        <h3 id="site-support-roadmap" className="site-support-heading">
          {content.roadmap.heading}
        </h3>
        <p className="site-support-text site-support-text--muted">{content.roadmap.note}</p>
        <ul className="site-support-list site-support-list--roadmap">
          {content.roadmap.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="site-support-cta" aria-labelledby="site-support-cta">
        <h3 id="site-support-cta" className="site-support-heading">
          {content.cta.heading}
        </h3>
        <p className="site-support-text">{content.cta.text}</p>
        {content.sponsorUrl ? (
          <p className="site-support-action">
            <a
              href={content.sponsorUrl}
              className="site-info-sponsor-btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("site.openSponsor")}
            </a>
          </p>
        ) : (
          <p className="site-support-text site-support-text--muted">{content.cta.notConfigured}</p>
        )}
      </section>

      <section className="site-support-legal" aria-labelledby="site-support-legal">
        <h3 id="site-support-legal" className="site-support-heading site-support-heading--legal">
          {content.legal.heading}
        </h3>
        {content.legal.paragraphs.map((para, i) => (
          <p key={i} className="site-support-legal-text">
            {para}
          </p>
        ))}
      </section>

      {content.footerNote && <p className="site-info-footer-note">{content.footerNote}</p>}
    </div>
  );
}
