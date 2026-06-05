import { SITE_CONTACT_EMAIL, SITE_LAST_UPDATED } from "./siteConfig.js";

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
export function getContactContent(locale) {
  const emailConfigured = Boolean(SITE_CONTACT_EMAIL);

  return {
    title: L(locale, { zh: "聯絡我們", en: "Contact us" }),
    intro: {
      kicker: L(locale, {
        zh: "你的回饋，讓這個專案變得更好",
        en: "Your feedback helps this project grow",
      }),
      text: L(locale, {
        zh: "Metro Multiverse 目前由個人開發與維護。無論是建議、問題回報或任何想法，都歡迎來信分享——每一則回饋都有機會讓網站變得更好。",
        en: "Metro Multiverse is independently developed and maintained. Whether you have suggestions, bug reports, or ideas to share—you're welcome to reach out. Every message can help make the site better.",
      }),
    },
    email: {
      heading: L(locale, { zh: "電子郵件", en: "Email" }),
      hint: emailConfigured
        ? L(locale, {
            zh: "點選信箱開啟郵件程式，或使用「複製信箱」按鈕：",
            en: "Tap the address to open your mail app, or use Copy email:",
          })
        : L(locale, {
            zh: "聯絡信箱尚未設定。維運者可在 Vercel 或本機 `.env` 加入 VITE_SITE_CONTACT_EMAIL。",
            en: "Contact email is not configured yet. Set VITE_SITE_CONTACT_EMAIL in Vercel or local `.env`.",
          }),
      address: emailConfigured ? SITE_CONTACT_EMAIL : null,
    },
    topics: {
      heading: L(locale, { zh: "適合來信的主題", en: "What to write about" }),
      items: [
        L(locale, {
          zh: "網站錯誤、地圖載入、匯入匯出或分享連結問題",
          en: "Site errors, map loading, import/export, or share link issues",
        }),
        L(locale, { zh: "功能建議與使用體驗回饋", en: "Feature suggestions and user experience feedback" }),
        L(locale, {
          zh: "城市、車站或路線資料修正與補充",
          en: "City, station, or route data corrections and additions",
        }),
        L(locale, { zh: "媒體、教學或合作洽詢", en: "Press, education, or collaboration" }),
      ],
    },
    contribution: {
      heading: L(locale, { zh: "路線資料貢獻", en: "Route data contributions" }),
      paragraphs: [
        L(locale, {
          zh: "Metro Multiverse 歡迎使用者提供自行繪製的路線檔案。若您依各地區實際的捷運、地鐵、輕軌、通勤鐵路等系統，繪製完整且正確的路線資料，歡迎來信分享。",
          en: "Metro Multiverse welcomes route files you've drawn yourself. If you've mapped a region's metro, subway, light rail, commuter rail, or similar systems with complete and accurate data, we'd love to hear from you.",
        }),
        L(locale, {
          zh: "經確認後，您的作品未來有機會成為網站內建的預設路線。我們不保證一定採用，資料也可能需要進一步調整或驗證——但非常歡迎您與社群一起完善這個全球軌道交通資料庫。",
          en: "After review, your work may become a built-in default route on the site. Adoption isn't guaranteed, and data may need further adjustment or verification—but we warmly welcome you to help build this global transit database together.",
        }),
      ],
    },
    bugReport: {
      heading: L(locale, { zh: "回報問題時建議提供", en: "When reporting a bug, please include" }),
      items: [
        L(locale, { zh: "問題截圖", en: "A screenshot of the issue" }),
        L(locale, { zh: "操作步驟（如何重現問題）", en: "Steps to reproduce the issue" }),
        L(locale, { zh: "使用裝置（手機或電腦）", en: "Device type (phone or computer)" }),
        L(locale, { zh: "瀏覽器名稱與版本", en: "Browser name and version" }),
        L(locale, { zh: "問題發生時間", en: "When the issue occurred" }),
      ],
    },
    response: {
      heading: L(locale, { zh: "回覆說明", en: "About replies" }),
      text: L(locale, {
        zh: "這是一個業餘專案，我會盡力閱讀與回覆每一封來信。處理可能需要數天時間，感謝您的耐心與支持。若久未收到回信，不妨先查看垃圾郵件匣。",
        en: "This is a side project, and I'll do my best to read and reply to every message. It may take a few days to respond—thank you for your patience and support. If you don't hear back, please check your spam folder.",
      }),
    },
    outOfScope: {
      heading: L(locale, { zh: "不適合聯絡的事項", en: "Out of scope" }),
      intro: L(locale, {
        zh: "Metro Multiverse 並非官方單位，無法代為處理以下事項，請直接向相關單位洽詢：",
        en: "Metro Multiverse is not an official body and cannot help with the following—please contact the relevant authorities directly:",
      }),
      items: [
        L(locale, { zh: "捷運營運與班次", en: "Metro operations and schedules" }),
        L(locale, { zh: "票價與購票", en: "Fares and ticketing" }),
        L(locale, { zh: "官方路線規劃", en: "Official route planning" }),
        L(locale, { zh: "政策爭議", en: "Policy disputes" }),
        L(locale, { zh: "客服申訴", en: "Customer service complaints" }),
      ],
    },
    closing: L(locale, {
      zh: "感謝每一位願意提供建議、回報問題、分享資料或參與建設的人。Metro Multiverse 希望成為一個由社群共同完善的全球軌道交通探索平台。",
      en: "Thank you to everyone who shares suggestions, reports issues, contributes data, or helps build this project. Metro Multiverse aims to become a global transit exploration platform shaped by its community.",
    }),
    footerNote: L(locale, {
      zh: `最後更新：${SITE_LAST_UPDATED}`,
      en: `Last updated: ${SITE_LAST_UPDATED}`,
    }),
  };
}
