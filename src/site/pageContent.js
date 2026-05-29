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

  if (pageId === "about") {
    return {
      title: L(locale, { zh: "關於本站", en: "About" }),
      intro: L(locale, {
        zh: "Metro Multiverse 為整合雙北捷運路網、支援自訂繪製與路線交換之網頁應用。以下為本站三大功能定位。",
        en: "Metro Multiverse is a web application that integrates the Taipei–New Taipei metro network, supports custom route drawing, and enables route exchange. The three core capabilities are outlined below.",
      }),
      sections: [
        {
          id: "integrated-map",
          title: L(locale, { zh: "整合路網檢視", en: "Integrated network view" }),
          paragraphs: [
            L(locale, {
              zh: "本站提供預設路線，於地圖上呈現雙北地區營運中、規劃中及興建中之捷運路線。營運、規劃與施工階段之路網整合於同一張地圖，使用者無須分別查閱多個來源，即可檢視未來捷運路網於地理空間上的分布概況。",
              en: "The site provides default routes showing operating, planned, and under-construction metro lines in the Taipei–New Taipei area on one map. By combining networks at all three stages on a single view, users can see how future lines are distributed spatially without consulting multiple separate sources.",
            }),
            L(locale, {
              zh: "此種整合呈現方式，在一般市面公開資源中較為少見。",
              en: "This kind of integrated presentation is uncommon among typical public resources.",
            }),
          ],
        },
        {
          id: "draw-share",
          title: L(locale, { zh: "繪製與分享", en: "Draw and share" }),
          paragraphs: [
            L(locale, {
              zh: "使用者可於地圖上自行繪製路線與車站，建立個人構想或假想路網，並將成果分享予他人，供教學、簡報、討論或創作使用。",
              en: "Users may draw their own routes and stations on the map to build personal or hypothetical networks and share the results with others for teaching, presentations, discussion, or creative work.",
            }),
            L(locale, {
              zh: "全站使用者路線（路線層級）上限為 50 條，以維持瀏覽器效能與穩定度。",
              en: "There is a site-wide limit of 50 user-drawn lines (line level) to keep the app responsive.",
            }),
          ],
        },
        {
          id: "share-link",
          title: L(locale, { zh: "短網址分享", en: "Short share links" }),
          paragraphs: [
            L(locale, {
              zh: "於「路線檔案」選單可產生分享連結（格式如 /r/xxxxxxxx）。僅在您按下產生時才上傳路線；連結預設 30 天有效，單次分享檔案上限 200 KB。他人開啟連結後可先以「僅檢視」模式瀏覽，再選擇是否加入自己的地圖。",
              en: 'Use the Line files menu to create a share link (e.g. /r/xxxxxxxx). Upload happens only when you create the link; links expire after 30 days by default, with a 200 KB cap per share. Visitors can browse in view-only mode, then optionally add lines to their map.',
            }),
          ],
        },
        {
          id: "import-export",
          title: L(locale, { zh: "匯入與匯出", en: "Import and export" }),
          paragraphs: [
            L(locale, {
              zh: "本站支援以 JSON 匯入他人所繪製之路線，亦可匯出自己繪製之路線，便於保存、交換與後續編輯。",
              en: "The site supports importing routes drawn by others and exporting your own routes as JSON for storage, exchange, and further editing.",
            }),
          ],
        },
        {
          id: "direction",
          title: L(locale, { zh: "更新與方向", en: "Updates & direction" }),
          paragraphs: [
            L(locale, {
              zh: "營運者將持續嘗試更新、精進本站功能與使用體驗。此為目前之發展方向，並不構成服務承諾或時程保證。",
              en: "The operator intends to continue updating and refining site features and the user experience. This reflects current development direction only and does not constitute a service commitment or fixed timeline.",
            }),
            L(locale, {
              zh: "實際進度受可用時間與資源限制；功能優先順序可能調整，部分項目可能暫緩或變更方向。如有功能建議，歡迎透過「聯絡我們」頁面來信。",
              en: "Progress depends on available time and resources. Priorities may change, and some items may be deferred or revised. Feature suggestions are welcome via the Contact page.",
            }),
          ],
        },
        {
          id: "who",
          title: L(locale, { zh: "維運說明", en: "Operations" }),
          paragraphs: [
            L(locale, {
              zh: "本站由獨立開發者於業餘時間維護，透過 GitHub 與 Vercel 部署。若於使用過程中發現問題或有建議，歡迎透過「聯絡我們」頁面來信。",
              en: "The site is maintained by an independent developer in spare time and deployed via GitHub and Vercel. For issues or suggestions encountered during use, please contact us via the Contact page.",
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
        zh: "如果你覺得 Metro Multiverse 對你有幫助，一小筆自願贊助可以支持我持續維護網站、負擔伺服器與地圖等營運開支。非常感謝你的支持！",
        en: "If Metro Multiverse has been helpful, a voluntary tip helps keep the site running — hosting, maps, and ongoing maintenance. Thank you so much for your support!",
      }),
      sections: [
        {
          id: "nature",
          title: L(locale, { zh: "贊助性質", en: "What sponsorship means" }),
          paragraphs: [
            L(locale, {
              zh: "贊助是自願的支持，用來幫助這個小專案持續運作；它不是捐給台北捷運或任何政府單位的款項。",
              en: "Tips are voluntary support to keep this little project going — not a donation to Taipei Metro or any government body.",
            }),
            L(locale, {
              zh: "目前贊助不會解鎖額外功能，也不是購買服務的合約；若日後有變化，會在網站上清楚公告。",
              en: "Tips don’t unlock extra features and aren’t a purchase contract. If that ever changes, we’ll say so clearly on the site.",
            }),
            L(locale, {
              zh: "金流由 Ko-fi 處理，退款與帳務依 Ko-fi 規定辦理。",
              en: "Payments are processed by Ko-fi; refunds and billing follow Ko-fi’s policies.",
            }),
            L(locale, {
              zh: "若你所在地的法規要求申報，請依自身狀況處理即可。",
              en: "If your local rules require reporting tips for tax purposes, that’s up to you to handle.",
            }),
          ],
        },
        {
          id: "link",
          title: L(locale, { zh: "前往贊助", en: "Sponsor link" }),
          paragraphs: sponsorConfigured
            ? [
                L(locale, {
                  zh: "點下方按鈕即可前往贊助頁面（會在新分頁開啟）。",
                  en: "Hit the button below to open the sponsorship page in a new tab.",
                }),
              ]
            : [
                L(locale, {
                  zh: "贊助連結尚未設定。維運者可在 Vercel 環境變數加入 VITE_SPONSOR_URL（Ko-fi 網址）。",
                  en: "The sponsor link is not configured yet. Set VITE_SPONSOR_URL in Vercel (your Ko-fi page URL).",
                }),
              ],
          sponsorUrl: sponsorConfigured ? SPONSOR_URL : null,
        },
      ],
      footerNote: L(locale, {
        zh: `最後更新：${SITE_LAST_UPDATED}`,
        en: `Last updated: ${SITE_LAST_UPDATED}`,
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
                  zh: "點一下方的信箱，就會開啟你的郵件程式：",
                  en: "Tap the address below to open your mail app:",
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
