import { useI18n } from "../i18n/I18nProvider.jsx";

/** @typedef {import('../site/siteRoutes.js').SitePageId} SitePageId */

/**
 * @param {{ activePage: SitePageId | null, onNavigate: (id: SitePageId) => void, onHome: () => void }} props
 */
export default function SiteHeaderNav({ activePage, onNavigate, onHome }) {
  const { t } = useI18n();

  const items = /** @type {{ id: SitePageId, labelKey: string }[]} */ ([
    { id: "legal", labelKey: "site.nav.legal" },
    { id: "about", labelKey: "site.nav.about" },
    { id: "support", labelKey: "site.nav.support" },
  ]);

  return (
    <nav className="app-site-header-nav" aria-label={t("site.navAria")}>
      {items.map(({ id, labelKey }) => (
        <button
          key={id}
          type="button"
          className={`app-header-nav-btn${activePage === id ? " is-active" : ""}`}
          aria-current={activePage === id ? "page" : undefined}
          onClick={() => {
            if (activePage === id) onHome();
            else onNavigate(id);
          }}
        >
          {t(labelKey)}
        </button>
      ))}
    </nav>
  );
}
