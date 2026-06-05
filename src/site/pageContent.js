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
        zh: "本頁載列 Metro Multiverse（「本服務」）之使用條款、免責、隱私及資料來源。以下僅供參考，不構成法律意見；爭議以適用法令及主管、司法機關認定為準。",
        en: "Terms, disclaimer, privacy, and data sources for Metro Multiverse (“the Service”). For general reference only, not legal advice; disputes are governed by applicable law and competent authorities or courts.",
      }),
      sections: [
        {
          id: "disclaimer",
          title: L(locale, { zh: "非官方聲明與免責", en: "Non-official disclaimer" }),
          paragraphs: [
            L(locale, {
              zh: "本服務由獨立開發者營運，與臺北大眾捷運公司、臺北市政府及交通主管機關無隸屬或合作關係，亦不提供官方路線、時刻或即時營運資訊。",
              en: "The Service is operated independently and is not affiliated with Taipei Rapid Transit Corporation, the Taipei City Government, or any transit authority, and does not provide official routes, schedules, or real-time operations.",
            }),
            L(locale, {
              zh: "本站路線、車站及營運狀態僅供示意、創作、教學或規劃討論，不得作為搭車、安全、投資或法律行為之依據。資料可能有誤、延遲或不完整，使用者應自行查證並承擔使用風險。",
              en: "Routes, stations, and status labels are for schematic, creative, educational, or planning use only—not for travel, safety, investment, or legal decisions. Data may be wrong, delayed, or incomplete; users verify at their own risk.",
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
              zh: "若日後新增分析、贊助或付費功能，將修訂本政策並公告。",
              en: "If analytics, sponsorship, or paid features are added, this policy will be revised and announced.",
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
              zh: "內建臺北捷運示意資料取自政府開放資料（如國土測繪中心捷運圖資），僅作預設起點；名稱與狀態可能經整理，非官方或即時資訊。",
              en: "Built-in Taipei Metro schematic data comes from government open data (e.g. NLSC MRT datasets) as a default only; names and status may be curated and are not official or real-time.",
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

  if (pageId === "contact") {
    const emailConfigured = Boolean(SITE_CONTACT_EMAIL);
    return {
      title: L(locale, { zh: "聯絡我們", en: "Contact us" }),
      intro: L(locale, {
        zh: "有使用上的疑問、發現 bug、或想聊聊合作，都歡迎來信！不過關於捷運實際營運、票務或官方路線爭議，還請直接向相關單位洽詢，這邊無法代為處理。",
        en: "Questions, bug reports, or collaboration ideas — we’re happy to hear from you! For real-world metro operations, fares, or official line disputes, please contact the relevant authorities; we can’t help with those here.",
      }),
      sections: [
        {
          id: "email",
          title: L(locale, { zh: "電子郵件", en: "Email" }),
          paragraphs: emailConfigured
            ? [
                L(locale, {
                  zh: "下方為聯絡信箱。可點選開啟郵件程式，或使用「複製信箱」按鈕：",
                  en: "Contact address below. Tap to open your mail app, or use Copy email:",
                }),
              ]
            : [
                L(locale, {
                  zh: "聯絡信箱尚未設定。維運者可在 Vercel 或本機 `.env` 加入 VITE_SITE_CONTACT_EMAIL。",
                  en: "Contact email is not configured yet. Set VITE_SITE_CONTACT_EMAIL in Vercel or local `.env`.",
                }),
              ],
          contactEmail: emailConfigured ? SITE_CONTACT_EMAIL : null,
        },
        {
          id: "topics",
          title: L(locale, { zh: "適合來信的主題", en: "What to write about" }),
          list: [
            L(locale, {
              zh: "網站錯誤、地圖無法載入、匯入匯出或分享連結問題",
              en: "Site errors, map load failures, import/export, or share link issues",
            }),
            L(locale, { zh: "功能建議或介面回饋", en: "Feature ideas or UI feedback" }),
            L(locale, { zh: "媒體、教學或合作洽詢", en: "Press, education, or collaboration" }),
          ],
        },
        {
          id: "notice",
          title: L(locale, { zh: "回覆說明", en: "Response expectations" }),
          paragraphs: [
            L(locale, {
              zh: "這是一個業餘小專案，我會盡力回覆，但無法保證即時。若久未收到回信，不妨先看看垃圾郵件匣——也可能是該類問題目前無法處理。仍感謝你的來信！",
              en: "This is a side project — I’ll do my best to reply, but can’t promise instant responses. If you don’t hear back, check spam; some requests may be out of scope. Thanks for reaching out anyway!",
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

  return null;
}
