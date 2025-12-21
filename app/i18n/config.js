import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resources from "./resources";

let initialized = false;

export const SUPPORTED_LOCALES = Object.keys(resources);
export const FALLBACK_LOCALE = "en";

export function getI18nInstance() {
  if (!initialized) {
    // Init only on the client; LanguageDetector checks for window when running in browsers.
    i18next
      .use(LanguageDetector)
      .init({
        resources,
        fallbackLng: FALLBACK_LOCALE,
        supportedLngs: SUPPORTED_LOCALES,
        detection: {
          // Prefer the browser language by default; allow querystring override; avoid sticky caches
          order: ["querystring", "navigator"],
          caches: [],
        },
        interpolation: {escapeValue: false},
      })
      .catch((err) => {
        console.error("Failed to init i18next:", err);
      });
    initialized = true;
  }
  return i18next;
}
