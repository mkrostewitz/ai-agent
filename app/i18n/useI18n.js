"use client";

import {useCallback, useEffect, useState} from "react";
import {getI18nInstance, SUPPORTED_LOCALES, FALLBACK_LOCALE} from "./config";

export function useI18n() {
  const i18n = getI18nInstance();
  const initialLang = i18n.resolvedLanguage || i18n.language || FALLBACK_LOCALE;
  const [lang, setLang] = useState(initialLang);

  useEffect(() => {
    // Force a detect on mount to honor browser language (e.g., de-DE -> de)
    const detected = i18n.services?.languageDetector?.detect?.();
    const preferred = Array.isArray(detected) ? detected[0] : detected;
    if (preferred) {
      const base = preferred.split("-")[0];
      const target = SUPPORTED_LOCALES.includes(preferred)
        ? preferred
        : SUPPORTED_LOCALES.includes(base)
          ? base
          : null;
      if (target && target !== i18n.language) {
        i18n.changeLanguage(target);
        setLang(target);
      }
    }

    // Sync once i18n finishes init/detection
    if (i18n.resolvedLanguage && i18n.resolvedLanguage !== lang) {
      setLang(i18n.resolvedLanguage);
    }

    const handler = (lng) => setLang(lng);
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, [i18n]);

  const t = useCallback((key, options) => i18n.t(key, options), [i18n, lang]);

  return {t, i18n, lang, supportedLocales: SUPPORTED_LOCALES, fallbackLocale: FALLBACK_LOCALE};
}
