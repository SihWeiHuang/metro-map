import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { TUTORIAL_PAGES, tutorialVideoUrl } from "../site/tutorialConfig.js";

/**
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function TutorialOverlay({ open, onClose }) {
  const { t, locale } = useI18n();
  const [pageIndex, setPageIndex] = useState(0);
  const videosRef = useRef(null);

  useEffect(() => {
    if (open) setPageIndex(0);
  }, [open]);

  useEffect(() => {
    videosRef.current?.scrollTo({ top: 0 });
  }, [pageIndex]);

  if (!open) return null;

  const page = TUTORIAL_PAGES[pageIndex];
  const isLastPage = pageIndex === TUTORIAL_PAGES.length - 1;

  const finish = () => {
    onClose();
  };

  const goNext = () => {
    if (isLastPage) {
      finish();
      return;
    }
    setPageIndex((index) => Math.min(index + 1, TUTORIAL_PAGES.length - 1));
  };

  const goPrev = () => {
    setPageIndex((index) => Math.max(index - 1, 0));
  };

  const goToChapter = (index) => {
    setPageIndex(index);
  };

  return (
    <div className="tutorial-overlay-backdrop" role="presentation">
      <div
        className="tutorial-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        lang={locale === "en" ? "en" : "zh-Hant"}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tutorial-overlay-header">
          <p className="tutorial-overlay-kicker">{t("tutorial.kicker")}</p>
          <button type="button" className="tutorial-overlay-skip" onClick={finish}>
            {t("tutorial.skip")}
          </button>
        </header>

        <nav className="tutorial-chapter-steps" aria-label={t("tutorial.chapterNavAria")}>
          {TUTORIAL_PAGES.map((chapter, index) => (
            <button
              key={chapter.id}
              type="button"
              className={`tutorial-chapter-step${index === pageIndex ? " is-current" : ""}${index < pageIndex ? " is-complete" : ""}`}
              aria-current={index === pageIndex ? "step" : undefined}
              aria-label={t("tutorial.goToChapter", { title: t(chapter.titleKey) })}
              onClick={() => goToChapter(index)}
            >
              <span className="tutorial-chapter-step-index">{index + 1}</span>
              <span className="tutorial-chapter-step-label">{t(chapter.titleKey)}</span>
            </button>
          ))}
        </nav>

        <section className="tutorial-chapter-panel" aria-labelledby="tutorial-title">
          <h2 id="tutorial-title" className="tutorial-overlay-title">
            {t(page.titleKey)}
          </h2>
          <p className="tutorial-overlay-intro">{t(page.introKey)}</p>
          {pageIndex === 0 ? (
            <div className="tutorial-overlay-hints">
              <p className="tutorial-overlay-hint">{t("tutorial.noRefreshHint")}</p>
              {locale === "en" ? (
                <p className="tutorial-overlay-hint tutorial-overlay-hint--note">{t("tutorial.videoLocaleNote")}</p>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="tutorial-overlay-videos" ref={videosRef}>
          {page.videos.map((video, index) => (
            <figure key={video.file} className="tutorial-video-card">
              {index > 0 ? <div className="tutorial-video-divider" role="separator" aria-hidden="true" /> : null}
              <figcaption className="tutorial-video-title">{t(video.labelKey)}</figcaption>
              <video
                className="tutorial-video-player"
                controls
                playsInline
                preload="metadata"
                src={tutorialVideoUrl(video.file)}
              >
                {t("tutorial.videoUnsupported")}
              </video>
            </figure>
          ))}
        </div>

        <footer className="tutorial-overlay-footer">
          <div className="tutorial-overlay-progress" aria-live="polite">
            {t("tutorial.pageProgress", { current: pageIndex + 1, total: TUTORIAL_PAGES.length })}
          </div>
          <div className="tutorial-overlay-actions">
            {pageIndex > 0 ? (
              <button type="button" className="tutorial-overlay-btn tutorial-overlay-btn--secondary" onClick={goPrev}>
                {t("tutorial.prev")}
              </button>
            ) : (
              <span className="tutorial-overlay-btn-spacer" aria-hidden="true" />
            )}
            <button
              type="button"
              className="tutorial-overlay-btn tutorial-overlay-btn--primary"
              onClick={goNext}
            >
              {isLastPage ? t("tutorial.start") : t("tutorial.next")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
