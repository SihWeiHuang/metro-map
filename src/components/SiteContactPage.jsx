import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { getContactContent } from "../site/contactContent.js";

/** @typedef {'zh-Hant' | 'en'} SiteLocale */

/**
 * @param {{ locale: SiteLocale }} props
 */
export default function SiteContactPage({ locale }) {
  const { t } = useI18n();
  const content = getContactContent(locale);
  const [emailCopyState, setEmailCopyState] = useState("idle");
  const emailCopyResetTimer = useRef(null);

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

  return (
    <div className="site-contact">
      <header className="site-contact-hero">
        <p className="site-contact-kicker">{content.intro.kicker}</p>
        <p className="site-contact-lead">{content.intro.text}</p>
      </header>

      <section className="site-contact-block site-contact-email" aria-labelledby="site-contact-email">
        <h3 id="site-contact-email" className="site-contact-heading">
          {content.email.heading}
        </h3>
        <p className="site-contact-text">{content.email.hint}</p>
        {content.email.address ? (
          <div className="site-info-contact">
            <p className="site-info-paragraph site-info-contact-email">
              <a href={`mailto:${content.email.address}`} className="site-info-mail-link">
                {content.email.address}
              </a>
            </p>
            <button
              type="button"
              className="site-info-copy-email-btn"
              onClick={() => handleCopyContactEmail(content.email.address)}
            >
              {emailCopyState === "copied" ? t("site.emailCopied") : t("site.copyEmail")}
            </button>
            {emailCopyState === "error" ? (
              <p className="site-info-copy-email-error" role="alert">
                {t("site.emailCopyFailed")}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="site-contact-block" aria-labelledby="site-contact-topics">
        <h3 id="site-contact-topics" className="site-contact-heading">
          {content.topics.heading}
        </h3>
        <ul className="site-contact-list">
          {content.topics.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="site-contact-block" aria-labelledby="site-contact-contribution">
        <h3 id="site-contact-contribution" className="site-contact-heading">
          {content.contribution.heading}
        </h3>
        {content.contribution.paragraphs.map((para, i) => (
          <p key={i} className="site-contact-text">
            {para}
          </p>
        ))}
      </section>

      <section className="site-contact-block" aria-labelledby="site-contact-bug">
        <h3 id="site-contact-bug" className="site-contact-heading">
          {content.bugReport.heading}
        </h3>
        <ul className="site-contact-list">
          {content.bugReport.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="site-contact-block" aria-labelledby="site-contact-response">
        <h3 id="site-contact-response" className="site-contact-heading">
          {content.response.heading}
        </h3>
        <p className="site-contact-text">{content.response.text}</p>
      </section>

      <section className="site-contact-block" aria-labelledby="site-contact-scope">
        <h3 id="site-contact-scope" className="site-contact-heading">
          {content.outOfScope.heading}
        </h3>
        <p className="site-contact-text">{content.outOfScope.intro}</p>
        <ul className="site-contact-list">
          {content.outOfScope.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <p className="site-contact-closing">{content.closing}</p>

      {content.footerNote && <p className="site-info-footer-note">{content.footerNote}</p>}
    </div>
  );
}
