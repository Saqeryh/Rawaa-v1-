import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-700.css";
import "@fontsource/ibm-plex-sans-arabic/latin-400.css";
import "@fontsource/ibm-plex-sans-arabic/latin-600.css";
import "@fontsource/ibm-plex-sans-arabic/latin-700.css";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/dark.css";
import App from "./App";
import { I18nProvider } from "./i18n";
import { SessionProvider } from "./auth/session";
import { ConfigProvider } from "./hooks/useConfig";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <I18nProvider>
        <SessionProvider>
          <ConfigProvider>
            <App />
          </ConfigProvider>
        </SessionProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
