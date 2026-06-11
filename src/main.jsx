import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/claude-design-system.css";
import "./index.css";
import App from "./App.jsx";
import { I18nProvider } from "./i18n/I18nProvider.jsx";
import { ensureMetroBootstrapped } from "./metro/metroBootstrap.js";
import { syncViewportLayout } from "./site/viewportSync.js";

async function startApp() {
  await ensureMetroBootstrapped();
  syncViewportLayout();

  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
}

startApp();
