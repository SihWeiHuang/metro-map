import { SITE_LAST_UPDATED, SPONSOR_URL } from "./siteConfig.js";

/** @typedef {'zh-Hant' | 'en'} SiteLocale */

/**
 * @param {SiteLocale} locale
 * @param {{ zh: string, en: string }} block
 */
function L(locale, block) {
  return locale === "en" ? block.en : block.zh;
}

/**
 * @param {SiteLocale} locale
 */
export function getSupportContent(locale) {
  const sponsorConfigured = Boolean(SPONSOR_URL);

  return {
    title: L(locale, { zh: "贊助支持", en: "Support" }),
    intro: {
      kicker: L(locale, {
        zh: "個人開發 · 開源專案 · 面向全球",
        en: "Indie project · Open source · Global audience",
      }),
      text: L(locale, {
        zh: "Metro Multiverse 由個人開發與維護，目標是建立全球捷運與都市軌道交通的互動式探索平台。使用者可在地圖上探索既有路網、自行設計路線，並與他人分享自己的地鐵構想。",
        en: "Metro Multiverse is independently developed and maintained. The goal is a global interactive platform for urban rail and metro—where users explore existing networks, design their own routes, and share their transit ideas with others.",
      }),
    },
    whySupport: {
      heading: L(locale, { zh: "為什麼需要支持", en: "Why support matters" }),
      intro: L(locale, {
        zh: "本專案免費開放使用，但持續營運需要實際支出。贊助將用於：",
        en: "The project is free to use, but keeping it running has real costs. Support goes toward:",
      }),
      items: [
        L(locale, { zh: "地圖服務（如 Mapbox）的使用費用", en: "Map service fees (e.g. Mapbox)" }),
        L(locale, { zh: "伺服器、網域及資料儲存的營運費用", en: "Server, domain, and storage costs" }),
        L(locale, { zh: "新功能的開發與維護", en: "Developing and maintaining new features" }),
        L(locale, { zh: "各城市路網資料的整理與更新", en: "Curating and updating city network data" }),
      ],
    },
    roadmap: {
      heading: L(locale, { zh: "未來規劃", en: "Roadmap" }),
      note: L(locale, {
        zh: "以下為目前的發展方向；實際進度依可用時間與資源而定，不構成固定時程承諾。",
        en: "Current development directions below. Progress depends on available time and resources—not a fixed timeline.",
      }),
      items: [
        L(locale, { zh: "納入更多城市與捷運系統的預設資料", en: "More cities and metro systems as built-in data" }),
        L(locale, { zh: "強化路線資料的匯入與匯出", en: "Improved route import and export" }),
        L(locale, { zh: "完善路線分享功能", en: "Enhanced route sharing" }),
        L(locale, { zh: "展示社群使用者作品", en: "Community showcase of user work" }),
        L(locale, { zh: "其他尚未確定的功能探索", en: "Further features under exploration" }),
      ],
    },
    cta: {
      heading: L(locale, { zh: "支持這個專案", en: "Support this project" }),
      text: L(locale, {
        zh: "贊助完全出於自願，沒有任何義務。即使是小額支持，也有助於分擔上述營運成本，讓專案得以持續運作。若您認為 Metro Multiverse 對您有所助益，歡迎透過下方連結贊助。",
        en: "Support is entirely voluntary—there is no obligation. Even a small contribution helps cover the costs above and keep the project running. If Metro Multiverse has been useful to you, you're welcome to sponsor via the link below.",
      }),
      notConfigured: L(locale, {
        zh: "贊助連結尚未設定。維運者可在 Vercel 環境變數加入 VITE_SPONSOR_URL（Ko-fi 網址）。",
        en: "The sponsor link is not configured yet. Set VITE_SPONSOR_URL in Vercel (your Ko-fi page URL).",
      }),
    },
    sponsorUrl: sponsorConfigured ? SPONSOR_URL : null,
    legal: {
      heading: L(locale, { zh: "贊助相關說明", en: "Sponsorship terms" }),
      paragraphs: [
        L(locale, {
          zh: "贊助是自願的支持，用於協助本專案持續運作；並非捐贈予任何捷運公司或政府機關。",
          en: "Tips are voluntary support to keep this project running—not a donation to any metro operator or government body.",
        }),
        L(locale, {
          zh: "目前贊助不會解鎖額外功能，亦不構成購買服務之契約；若日後有所變更，將於網站公告。",
          en: "Tips do not unlock extra features and are not a purchase contract. Any change will be announced on the site.",
        }),
        L(locale, {
          zh: "金流由 Ko-fi 處理，退款與帳務依 Ko-fi 規定辦理。",
          en: "Payments are processed by Ko-fi; refunds and billing follow Ko-fi’s policies.",
        }),
        L(locale, {
          zh: "若您所在地的法規要求申報，請依自身狀況處理。",
          en: "If your local rules require reporting tips for tax purposes, please handle that according to your situation.",
        }),
      ],
    },
    footerNote: L(locale, {
      zh: `最後更新：${SITE_LAST_UPDATED}`,
      en: `Last updated: ${SITE_LAST_UPDATED}`,
    }),
  };
}
