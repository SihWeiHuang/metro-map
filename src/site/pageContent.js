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
 * @param {import('./siteRoutes.js').SitePageId} pageId
 * @param {SiteLocale} locale
 */
export function getPageContent(pageId, locale) {
  const contact =
    SITE_CONTACT_EMAIL ||
    L(locale, { zh: "（尚未設定，請於環境變數 VITE_SITE_CONTACT_EMAIL 填寫）", en: "(Not configured — set VITE_SITE_CONTACT_EMAIL)" });

  if (pageId === "legal") {
    return {
      title: L(locale, { zh: "條款與隱私", en: "Legal & privacy" }),
      intro: L(locale, {
        zh: "本頁載列 Metro Multiverse（「本服務」）之使用條款、免責、隱私及資料來源。本服務為非官方平台，所載各國／各地區路線僅供參考。以下僅供參考，不構成法律意見；爭議以適用法令及主管、司法機關認定為準。",
        en: "Terms, disclaimer, privacy, and data sources for Metro Multiverse (“the Service”). The Service is non-official; routes for any country or region are for reference only. For general reference only, not legal advice; disputes are governed by applicable law and competent authorities or courts.",
      }),
      sections: [
        {
          id: "disclaimer",
          title: L(locale, { zh: "非官方聲明與免責", en: "Non-official disclaimer" }),
          paragraphs: [
            L(locale, {
              zh: "本服務由獨立開發者營運，與全球任何捷運、地鐵、輕軌、通勤鐵路等軌道營運機構，以及任何政府或主管機關，均無隸屬、授權或合作關係。本服務不提供任何官方路線、時刻、票價或即時營運資訊。",
              en: "The Service is operated independently and has no affiliation, authorization, or partnership with any rail or metro operator worldwide, or with any government or regulatory body. The Service does not provide official routes, schedules, fares, or real-time operations information.",
            }),
            L(locale, {
              zh: "本站所有路線、車站及營運狀態（含內建預設路線與使用者創作）均為示意或創作性質，僅供參考、教學或規劃討論，不得作為搭車、安全、投資或法律行為之依據。資料可能有誤、延遲或不完整，使用者應自行向各該官方來源查證並承擔使用風險。",
              en: "All routes, stations, and status labels on the site—including built-in defaults and user-created content—are schematic or creative in nature, for reference, education, or planning discussion only—not for travel, safety, investment, or legal decisions. Data may be wrong, delayed, or incomplete; users should verify with official sources in each region and use at their own risk.",
            }),
            L(locale, {
              zh: "於法律允許範圍內，營運者對因使用或無法使用本服務所致之直接、間接或衍生損害不負賠償責任。",
              en: "To the extent permitted by law, the operator is not liable for direct, indirect, or consequential damages from use or inability to use the Service.",
            }),
          ],
        },
        {
          id: "privacy",
          title: L(locale, { zh: "隱私權", en: "Privacy" }),
          paragraphs: [
            L(locale, {
              zh: "本服務不要求註冊，亦不主動蒐集可單獨識別身分之資料（如姓名、電話、身分證字號）。",
              en: "No registration is required; the Service does not actively collect data that identifies you alone (e.g. name, phone, national ID).",
            }),
            L(locale, {
              zh: "瀏覽器可能以 localStorage 於本機儲存編輯資料、介面偏好及語言設定；除使用者自行清除、匯出、或主動產生「分享連結」外，本服務不主動取得本機路線。",
              en: "Your browser may store edits, UI preferences, and language in localStorage; the Service does not obtain local line data unless you clear it, export it, or create a share link.",
            }),
            L(locale, {
              zh: "當您使用「分享連結」時，所選路線 JSON 會上傳至 Vercel 所連結之 Redis（KV）儲存，並產生短期有效的公開網址；到期後資料會自動刪除。任何持有連結者皆可讀取該次上傳內容，請勿分享敏感或未授權資料。",
              en: "When you create a share link, your line JSON is uploaded to Redis (KV) connected via Vercel, with a short-lived public URL; data is deleted after expiry. Anyone with the link can read that upload—do not share sensitive or unauthorized content.",
            }),
          ],
          list: [
            L(locale, {
              zh: "Mapbox：載入地圖時，IP 及瀏覽器資訊可能依 Mapbox 隱私政策處理。",
              en: "Mapbox: loading the map may send IP and browser data under Mapbox’s privacy policy.",
            }),
            L(locale, {
              zh: "Vercel：託管期間可能記錄 IP、存取時間等紀錄以供託管與安全維運。",
              en: "Vercel: hosting may log IP, access time, etc. for operations and security.",
            }),
            L(locale, {
              zh: "Ko-fi 等贊助連結：僅在您主動點擊前往贊助頁時，才會離開本站至第三方網站。",
              en: "Ko-fi and similar sponsor links: you only leave the Service when you choose to open a third-party sponsor page.",
            }),
            L(locale, {
              zh: "Google Analytics（GA4）：本站使用 Google Analytics 分析匿名流量（如頁面瀏覽、裝置類型、大致地區），以了解使用情形並改善服務；營運者不販售您的個人資料。詳見 Google 隱私權政策。",
              en: "Google Analytics (GA4): the site uses Google Analytics for anonymous traffic metrics (e.g. page views, device type, approximate region) to understand usage and improve the Service; the operator does not sell your personal data. See Google’s Privacy Policy.",
            }),
          ],
        },
        {
          id: "terms",
          title: L(locale, { zh: "使用條款", en: "Terms of use" }),
          paragraphs: [
            L(locale, {
              zh: "使用本服務即視為同意本頁條款及中華民國相關法令。不得濫用服務，包括自動化大量請求地圖、侵入或干擾系統、散布違法或不當內容等。",
              en: "Use of the Service means you agree to these terms and applicable laws of the Republic of China. Misuse includes automated bulk map requests, intrusion or disruption, and unlawful or inappropriate content.",
            }),
            L(locale, {
              zh: "介面、程式碼及品牌等智慧財產權歸營運者所有；使用者匯出路線之權利與使用責任自行負擔，並應不侵害第三人權益。",
              en: "Interface, code, and branding belong to the operator. You are responsible for exported route data and must not infringe third-party rights.",
            }),
            L(locale, {
              zh: "營運者得調整、暫停或終止內容、功能或免費提供方式，恕不另行個別通知。",
              en: "The operator may change, suspend, or end content, features, or free access without individual notice.",
            }),
          ],
        },
        {
          id: "sources",
          title: L(locale, { zh: "資料來源標示", en: "Data sources" }),
          paragraphs: [
            L(locale, {
              zh: "底圖由 Mapbox 提供，受 Mapbox 服務條款及授權規範拘束。",
              en: "Base maps are provided by Mapbox under its terms and licenses.",
            }),
            L(locale, {
              zh: "內建預設路線可能涵蓋各國／各地區之軌道系統，資料來源可能包括政府開放資料、社群貢獻或營運者整理（例如部分臺灣地區資料可能參考國土測繪中心等公開圖資），僅作示意起點；名稱、路線與狀態可能經整理，不代表任何官方背書，亦非即時或權威資訊。",
              en: "Built-in default routes may cover transit systems in various countries and regions. Sources may include government open data, community contributions, or curation by the operator (e.g. some Taiwan data may reference public datasets such as NLSC). They serve as schematic starting points only; names, routes, and status may be curated—they do not represent official endorsement and are not authoritative or real-time.",
            }),
            L(locale, {
              zh: "使用者自行繪製或匯入之路線，其內容、授權及使用責任由使用者自行負擔。",
              en: "User-drawn or imported routes are the user’s responsibility for content, licensing, and use.",
            }),
          ],
        },
      ],
      footerNote: L(locale, {
        zh: `最後更新：${SITE_LAST_UPDATED}。聯絡：${contact}`,
        en: `Last updated: ${SITE_LAST_UPDATED}. Contact: ${contact}`,
      }),
    };
  }

  return null;
}
