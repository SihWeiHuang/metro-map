import { SITE_CONTACT_EMAIL, SITE_LAST_UPDATED, SPONSOR_URL } from "./siteConfig.js";

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
        zh: "以下說明 Metro Multiverse 的使用條件、免責事項、隱私權與資料來源。本文為一般資訊說明，不構成法律意見。",
        en: "Terms, disclaimers, privacy, and data sources for Metro Multiverse. This is general information, not legal advice.",
      }),
      sections: [
        {
          id: "disclaimer",
          title: L(locale, { zh: "非官方聲明與免責", en: "Non-official disclaimer" }),
          paragraphs: [
            L(locale, {
              zh: "Metro Multiverse 由獨立開發者維運，與台北捷運公司、臺北市政府或任何交通機關無關，亦不代表官方路線圖或即時營運資訊。",
              en: "Metro Multiverse is operated by an independent developer. It is not affiliated with Taipei Metro, the Taipei City Government, or any transit authority, and does not represent official maps or real-time operations.",
            }),
            L(locale, {
              zh: "本站路線、車站位置、營運狀態標籤等皆供示意、創作、教學或規劃討論使用，不得作為實際乘車、安全、投資或法律決策之依據。資料可能有誤、過期或不完整，使用者應自行判斷並承擔使用風險。",
              en: "Lines, station positions, and status labels are for illustration, creative work, education, or planning discussion only. Do not rely on them for travel, safety, investment, or legal decisions. Data may be wrong, outdated, or incomplete; you use the service at your own risk.",
            }),
            L(locale, {
              zh: "開發者對因使用或無法使用本服務所生之直接或間接損害，於法律允許之範圍內不負賠償責任。",
              en: "To the extent permitted by law, the developer is not liable for direct or indirect damages arising from use or inability to use this service.",
            }),
          ],
        },
        {
          id: "privacy",
          title: L(locale, { zh: "隱私權", en: "Privacy" }),
          paragraphs: [
            L(locale, {
              zh: "目前本站不要求註冊帳號，亦不主動收集姓名、電話、身分證字號等可直接識別身分之資料。",
              en: "The site does not require accounts and does not actively collect directly identifiable personal data such as your legal name, phone number, or national ID.",
            }),
            L(locale, {
              zh: "瀏覽器可能在本機儲存路線編輯資料、介面偏好與語言設定（localStorage），資料留在你的裝置上，除非你清除瀏覽器資料或匯出檔案自行分享。",
              en: "Your browser may store route edits, UI preferences, and language settings in localStorage on your device unless you clear site data or share exported files yourself.",
            }),
          ],
          list: [
            L(locale, {
              zh: "Mapbox：載入地圖時，你的 IP 與瀏覽器資訊可能由 Mapbox 依其隱私政策處理。",
              en: "Mapbox: loading the map may send your IP and browser information to Mapbox under their privacy policy.",
            }),
            L(locale, {
              zh: "Vercel：代管網站時可能記錄存取紀錄（如 IP、時間）以供託管與安全維運。",
              en: "Vercel: hosting may log access metadata (e.g. IP, time) for operations and security.",
            }),
            L(locale, {
              zh: "未來若新增分析、贊助或付費金流，將更新本頁並於網站上公告。",
              en: "If analytics, sponsorship, or paid checkout is added later, this page will be updated and announced on the site.",
            }),
          ],
        },
        {
          id: "terms",
          title: L(locale, { zh: "使用條款", en: "Terms of use" }),
          paragraphs: [
            L(locale, {
              zh: "使用本站即表示你同意遵守適用法律，並不得濫用服務（包含以程式大量請求地圖、嘗試破解或干擾系統、上傳違法內容等）。",
              en: "By using this site you agree to comply with applicable laws and not misuse the service (including automated map requests, attempts to disrupt the system, or unlawful content).",
            }),
            L(locale, {
              zh: "網站介面、程式與品牌名稱由開發者保留權利；你透過本站創作並匯出的路線資料，其權利與使用責任由你自行確保不侵害他人權益。",
              en: "The UI, code, and branding remain the developer’s property. You are responsible for rights and compliance of route data you create and export.",
            }),
            L(locale, {
              zh: "服務內容、功能與免費提供方式可能隨時調整、暫停或終止，恕不另行對每位使用者個別通知。",
              en: "Features, content, and free access may change, pause, or end at any time without individual notice.",
            }),
          ],
        },
        {
          id: "sources",
          title: L(locale, { zh: "資料來源標示", en: "Data sources" }),
          paragraphs: [
            L(locale, {
              zh: "底圖與地理顯示由 Mapbox 提供，並受 Mapbox 服務條款與授權規範。",
              en: "Base maps and geospatial display are provided by Mapbox under Mapbox terms and licenses.",
            }),
            L(locale, {
              zh: "內建台北捷運示意路線／車站資料來自政府開放資料（內政部國土測繪中心等公開之捷運圖資），僅作為預設展示與編輯起點；顯示名稱與營運狀態可能經人工整理，不等同官方公告。",
              en: "Built-in Taipei Metro schematic routes/stations are derived from government open data (e.g. NLSC-published MRT datasets) as a default starting point only; labels and status may be curated and are not official announcements.",
            }),
            L(locale, {
              zh: "使用者自行繪製或匯入的路線由使用者負責，與開源圖資或第三方內容之授權無涉。",
              en: "User-drawn or imported routes are the user’s responsibility and are separate from open-government or third-party licenses.",
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

  if (pageId === "about") {
    return {
      title: L(locale, { zh: "關於本站", en: "About" }),
      intro: L(locale, {
        zh: "Metro Multiverse（捷運多重宇宙）是在地圖上編輯示意路線與車站的網頁工具，靈感來自「多重宇宙」——每一條線都是一種可能的路網。",
        en: "Metro Multiverse is a web tool for editing schematic transit lines and stations on a map — each line can be its own “universe” of possibilities.",
      }),
      sections: [
        {
          id: "what",
          title: L(locale, { zh: "可以做什麼", en: "What you can do" }),
          paragraphs: [
            L(locale, {
              zh: "檢視內建示意路線、新增與編輯路線／車站、合併路線、匯入匯出 JSON，適合創作、教學、簡報或假想路網討論。",
              en: "View built-in schematic lines, add and edit routes and stations, merge lines, and import/export JSON — useful for creative work, teaching, slides, or hypothetical networks.",
            }),
          ],
        },
        {
          id: "who",
          title: L(locale, { zh: "維運方式", en: "How it is run" }),
          paragraphs: [
            L(locale, {
              zh: "由獨立開發者以業餘／專案形式維護，透過 GitHub 與 Vercel 部署。歡迎回饋問題與建議（見下方聯絡方式）。",
              en: "Maintained as an independent side project, deployed via GitHub and Vercel. Feedback is welcome (see contact below).",
            }),
          ],
        },
        {
          id: "contact",
          title: L(locale, { zh: "聯絡方式", en: "Contact" }),
          paragraphs: [
            L(locale, {
              zh: `電子郵件：${contact}`,
              en: `Email: ${contact}`,
            }),
          ],
        },
      ],
      footerNote: L(locale, {
        zh: `最後更新：${SITE_LAST_UPDATED}`,
        en: `Last updated: ${SITE_LAST_UPDATED}`,
      }),
    };
  }

  if (pageId === "support") {
    const sponsorConfigured = Boolean(SPONSOR_URL);
    return {
      title: L(locale, { zh: "贊助支持", en: "Support" }),
      intro: L(locale, {
        zh: "若你覺得 Metro Multiverse 有用，歡迎自願贊助支持開發與伺服器、地圖等營運成本。",
        en: "If Metro Multiverse is useful to you, voluntary support helps cover development and operating costs (hosting, maps, etc.).",
      }),
      sections: [
        {
          id: "nature",
          title: L(locale, { zh: "贊助性質", en: "What sponsorship means" }),
          paragraphs: [
            L(locale, {
              zh: "贊助為自願性捐款，用於支持專案持續維護，並非向台北捷運或任何政府機關捐款。",
              en: "Support is a voluntary tip to maintain the project, not a donation to Taipei Metro or any government agency.",
            }),
            L(locale, {
              zh: "除非日後另行公告，贊助不會自動解鎖特定功能，也不構成購買服務契約。",
              en: "Unless announced otherwise, tips do not automatically unlock features and are not a purchase contract.",
            }),
            L(locale, {
              zh: "金流由第三方平台處理（如 Buy Me a Coffee、Ko-fi 等），退款與帳務依該平台規定。",
              en: "Payments are processed by third-party platforms (e.g. Buy Me a Coffee, Ko-fi); refunds and billing follow their policies.",
            }),
            L(locale, {
              zh: "贊助收入可能須依你所在地稅法申報，請自行留意。",
              en: "Tips may be taxable depending on your jurisdiction; please consult local tax rules.",
            }),
          ],
        },
        {
          id: "link",
          title: L(locale, { zh: "前往贊助", en: "Sponsor link" }),
          paragraphs: sponsorConfigured
            ? [
                L(locale, {
                  zh: "請使用下方按鈕前往贊助頁面（將開啟新分頁）。",
                  en: "Use the button below to open the sponsorship page in a new tab.",
                }),
              ]
            : [
                L(locale, {
                  zh: "贊助連結尚未設定。維運者可在 Vercel 環境變數加入 VITE_SPONSOR_URL（例如 Buy Me a Coffee 或 Ko-fi 網址）。",
                  en: "The sponsor link is not configured yet. Set VITE_SPONSOR_URL in Vercel (e.g. your Buy Me a Coffee or Ko-fi URL).",
                }),
              ],
          sponsorUrl: sponsorConfigured ? SPONSOR_URL : null,
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
