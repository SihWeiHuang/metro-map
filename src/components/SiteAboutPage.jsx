import { getAboutContent } from "../site/aboutContent.js";

/** @typedef {'zh-Hant' | 'en'} SiteLocale */

/**
 * @param {{ locale: SiteLocale }} props
 */
export default function SiteAboutPage({ locale }) {
  const content = getAboutContent(locale);

  return (
    <div className="site-about">
      <header className="site-info-hero site-info-hero--about">
        <h3 className="site-info-hero__title">{content.subtitle}</h3>
        <p className="site-info-hero__text">{content.summary}</p>
      </header>

      <section
        className="site-about-block site-about-block--primary"
        aria-labelledby="site-about-capabilities"
      >
        <h3 id="site-about-capabilities" className="site-about-block-title site-about-block-title--primary">
          {content.capabilitiesHeading}
        </h3>
        <div className="site-about-cap-grid site-about-cap-grid--featured">
          {content.capabilities.map(({ id, code, title, description }) => (
            <article key={id} className="site-about-cap-card" aria-labelledby={`site-about-cap-${id}`}>
              <span className="site-about-cap-code" aria-hidden="true">
                {code}
              </span>
              <h4 id={`site-about-cap-${id}`} className="site-about-cap-title">
                {title}
              </h4>
              <p className="site-about-cap-desc">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-about-block" aria-labelledby="site-about-specs">
        <h3 id="site-about-specs" className="site-about-block-title">
          {content.specsHeading}
        </h3>
        <dl className="site-about-spec-table site-about-spec-table--compact">
          {content.specs.map(({ term, detail }) => (
            <div key={term} className="site-about-spec-row">
              <dt>{term}</dt>
              <dd>{detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="site-about-block" aria-labelledby="site-about-maintenance">
        <h3 id="site-about-maintenance" className="site-about-block-title">
          {content.maintenance.label}
        </h3>
        <p className="site-about-block-text">{content.maintenance.text}</p>
      </section>

      <section className="site-about-block site-about-block--tail" aria-labelledby="site-about-platform">
        <h3 id="site-about-platform" className="site-about-block-title">
          {content.platformSummary.label}
        </h3>
        <p className="site-about-block-text">{content.platformSummary.text}</p>
      </section>

      {content.footerNote && <p className="site-info-footer-note">{content.footerNote}</p>}
    </div>
  );
}
