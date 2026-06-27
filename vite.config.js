import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function isGa4MeasurementId(value) {
  return /^G-[A-Z0-9]+$/i.test(value?.trim() || "");
}

function ga4HeadSnippet(measurementId) {
  const id = measurementId.trim();
  return `
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${id}');
    </script>`;
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const ga4MeasurementId = env.VITE_GA4_MEASUREMENT_ID?.trim() || "";

  return {
    plugins: [
      react(),
      {
        name: "inject-ga4-head-snippet",
        transformIndexHtml(html) {
          if (!isGa4MeasurementId(ga4MeasurementId)) return html;
          return html.replace("</head>", `${ga4HeadSnippet(ga4MeasurementId)}\n  </head>`);
        },
      },
    ],
    server: {
      /**
       * `npm run dev` has no Vercel serverless /api. Proxy to production so
       * http://localhost:5173/r/{id} can load real share data while editing UI.
       */
      proxy: {
        "/api": {
          target: "https://metro-multiverse.vercel.app",
          changeOrigin: true,
        },
      },
    },
  };
});
