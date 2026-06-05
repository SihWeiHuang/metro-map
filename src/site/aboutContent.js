import {
  EXPORT_FILE_FORMAT,
  MAX_SHARE_PAYLOAD_BYTES,
  MAX_USER_ROUTES,
  SHARE_TTL_DAYS,
} from "../../shared/shareLimits.js";
import { SITE_LAST_UPDATED } from "./siteConfig.js";

/** @typedef {'zh-Hant' | 'en'} SiteLocale */

/**
 * @param {SiteLocale} locale
 * @param {{ zh: string, en: string }} block
 */
function L(locale, block) {
  return locale === "en" ? block.en : block.zh;
}

/** @param {number} bytes */
function formatBytes(locale, bytes) {
  if (bytes >= 1000) {
    const kb = Math.round(bytes / 1000);
    return L(locale, { zh: `${kb} KB`, en: `${kb} KB` });
  }
  return L(locale, { zh: `${bytes} 位元組`, en: `${bytes} bytes` });
}

/**
 * @param {SiteLocale} locale
 */
export function getAboutContent(locale) {
  return {
    title: L(locale, { zh: "服務說明", en: "Service Overview" }),
    subtitle: L(locale, {
      zh: "Metro Multiverse — 面向全球的互動式捷運示意地圖平台",
      en: "Metro Multiverse — Interactive Schematic Metro Map Platform for a Global Audience",
    }),
    summary: L(locale, {
      zh: "本服務為非官方之互動式捷運示意地圖平台，所載路線純屬創作與示意，供全球使用者參考、討論及創作之用。使用者可自創路線與車站，並透過資料交換及連結分享與他人交流。以下為主要功能及相關技術規格之正式說明。",
      en: "The Service is a non-official interactive schematic metro map platform. All routes shown are for creative and reference purposes, open to users worldwide for discussion and creation. Users may create their own routes and stations, and exchange work via data import/export and share links. The following is the formal description of core functions and related technical specifications.",
    }),
    capabilitiesHeading: L(locale, { zh: "主要功能模組", en: "Core capability modules" }),
    capabilities: [
      {
        id: "view",
        code: "01",
        title: L(locale, { zh: "路網整合檢視", en: "Integrated network view" }),
        description: L(locale, {
          zh: "於單一地圖介面呈現各階段捷運路段之空間分布，供路網概況檢視及規劃討論使用。內建預設路線可能依更新納入不同城市或地區；所載資訊為示意性質，非官方或即時營運資料。",
          en: "Displays metro sections at all stages on a single map for network overview and planning discussion. Built-in default routes may expand to different cities or regions over time; information is schematic only—not official or real-time operations data.",
        }),
      },
      {
        id: "edit",
        code: "02",
        title: L(locale, { zh: "路線與車站編輯", en: "Route and station editing" }),
        description: L(locale, {
          zh: "使用者可於地圖上繪製路線、標記車站，建立假想路網、教學示意或規劃草案，供簡報、研究及創作等用途。",
          en: "Users may draw routes and mark stations on the map to build hypothetical networks, teaching schematics, or planning drafts for presentations, research, and creative work.",
        }),
      },
      {
        id: "exchange",
        code: "03",
        title: L(locale, { zh: "資料匯入與匯出", en: "Data import and export" }),
        description: L(locale, {
          zh: `支援 ${EXPORT_FILE_FORMAT} 格式之 JSON 路線檔案。使用者可匯入他人所建檔案，或將本地編輯成果匯出保存、交換及後續編輯。`,
          en: `Supports route files in JSON (${EXPORT_FILE_FORMAT} format). Users may import files created by others or export local work for storage, exchange, and further editing.`,
        }),
      },
      {
        id: "share",
        code: "04",
        title: L(locale, { zh: "連結分享", en: "Link sharing" }),
        description: L(locale, {
          zh: "「路線檔案」選單可產生短期有效之公開分享連結。訪客以僅檢視模式開啟連結，並可自行決定是否加入本地地圖。",
          en: "The Line files menu can generate short-lived public share links. Visitors open links in view-only mode and may choose whether to add the content to their local map.",
        }),
      },
    ],
    specsHeading: L(locale, { zh: "技術規格與限制", en: "Technical specifications and limits" }),
    specs: [
      {
        term: L(locale, { zh: "資料格式", en: "Data format" }),
        detail: EXPORT_FILE_FORMAT,
      },
      {
        term: L(locale, { zh: "使用者繪製路線上限", en: "User-drawn route limit" }),
        detail: L(locale, {
          zh: `${MAX_USER_ROUTES} 條（全站，路線層級）`,
          en: `${MAX_USER_ROUTES} lines (site-wide, line level)`,
        }),
      },
      {
        term: L(locale, { zh: "分享連結有效期限", en: "Share link validity" }),
        detail: L(locale, {
          zh: `${SHARE_TTL_DAYS} 日（到期後自動刪除）`,
          en: `${SHARE_TTL_DAYS} days (auto-deleted after expiry)`,
        }),
      },
      {
        term: L(locale, { zh: "單次分享檔案上限", en: "Max share payload size" }),
        detail: formatBytes(locale, MAX_SHARE_PAYLOAD_BYTES),
      },
      {
        term: L(locale, { zh: "本機資料儲存", en: "Local data storage" }),
        detail: L(locale, {
          zh: "瀏覽器 localStorage（無需註冊帳號）",
          en: "Browser localStorage (no account required)",
        }),
      },
    ],
    maintenance: {
      label: L(locale, { zh: "維護與更新", en: "Maintenance and updates" }),
      text: L(locale, {
        zh: "營運者將持續精進平台功能與使用體驗，並不定期更新、擴充網站內建之預設路線（可能涵蓋不同城市或地區），以反映路網變化。實際進度受可用資源限制，前述說明不構成服務承諾或固定更新時程。功能建議及問題回報請透過「聯絡我們」頁面來信。本服務之持續營運涉及地圖、託管及儲存等費用；若認為有所助益，可參閱「贊助支持」頁面。",
        en: "The operator intends to continue refining platform features and user experience, and will update and expand built-in default routes on an ongoing, non-fixed schedule (potentially covering different cities or regions) to reflect network changes. Progress depends on available resources; the above does not constitute a service commitment or fixed update timeline. Feature suggestions and issue reports may be sent via the Contact page. Ongoing operation involves map, hosting, and storage costs; see Support if you would like to contribute.",
      }),
    },
    platformSummary: {
      label: L(locale, { zh: "平台概要", en: "Platform summary" }),
      text: L(locale, {
        zh: "本服務由獨立開發者營運，與捷運營運機構及政府主管機關無隸屬或合作關係，所載內容均屬示意創作。原始碼託管於 GitHub，由 Vercel 部署上線；使用者無需註冊即可使用，面向全球開放。",
        en: "The Service is operated by an independent developer, with no affiliation to any metro operator or government agency; all content is schematic and creative in nature. Source is hosted on GitHub and deployed on Vercel. No account registration is required, and the platform is open to users worldwide.",
      }),
    },
    footerNote: L(locale, {
      zh: `文件版本：${SITE_LAST_UPDATED}`,
      en: `Document version: ${SITE_LAST_UPDATED}`,
    }),
  };
}
