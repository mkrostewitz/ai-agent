(function () {
  const script = document.currentScript;
  if (!script) return;

  const mode = (script.dataset.mode || "modal").toLowerCase();

  const mountSelector = script.dataset.mount;
  const mountEl = mountSelector ? document.querySelector(mountSelector) : null;
  const host = new URL(script.src, window.location.href).origin;
  const cssHref = new URL("/styles/chat-widget.css", script.src).href;
  const openOnLoad = script.dataset.openOnLoad === "true";

  function ensureStyle() {
    if (document.querySelector("link[data-chat-widget-style]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssHref;
    link.dataset.chatWidgetStyle = "true";
    document.head.appendChild(link);
  }

  ensureStyle();

  const ds = script.dataset || {};
  // console.log("DS Response -> ", ds);
  const dsLangRaw = (ds.lang || "").trim();
  const dsLangLower = dsLangRaw.toLowerCase();
  const useBrowserLang = !dsLangRaw || dsLangLower === "browser";
  const forcedLang = useBrowserLang ? null : dsLangLower.slice(0, 2);
  const rawLocale = useBrowserLang ? navigator.language || "en" : dsLangRaw;
  const resolvedLang = (forcedLang || rawLocale || "en")
    .slice(0, 2)
    .toLowerCase();
  const scriptTracking = {
    countryCode: String(
      ds.countryCode || ds.geoCountry || ds.geoCountryCode || "",
    )
      .trim()
      .toUpperCase(),
    latitude: ds.latitude || ds.lat || ds.geoLatitude || ds.geoLat || "",
    longitude:
      ds.longitude ||
      ds.lng ||
      ds.lon ||
      ds.geoLongitude ||
      ds.geoLng ||
      ds.geoLon ||
      "",
  };
  const hasScriptTracking =
    Boolean(scriptTracking.countryCode) ||
    Boolean(scriptTracking.latitude && scriptTracking.longitude);

  const REGISTRATION_FIELD_DEFINITIONS = [
    {
      key: "first_name",
      labelKey: "firstNameLabel",
      requiredKey: "firstNameRequired",
      type: "text",
      placeholder: "Jane",
      autocomplete: "given-name",
    },
    {
      key: "last_name",
      labelKey: "lastNameLabel",
      requiredKey: "lastNameRequired",
      type: "text",
      placeholder: "Doe",
      autocomplete: "family-name",
    },
    {
      key: "phone",
      labelKey: "phoneLabel",
      requiredKey: "phoneRequired",
      type: "tel",
      placeholder: "+41 123 456 789",
      autocomplete: "tel",
      fullSpan: true,
    },
    {
      key: "email",
      labelKey: "emailLabel",
      requiredKey: "emailRequired",
      type: "email",
      placeholder: "jane.doe@email.com",
      autocomplete: "email",
      fullSpan: true,
    },
    {
      key: "company",
      labelKey: "companyLabel",
      requiredKey: "companyRequired",
      type: "text",
      placeholder: "Acme GmbH",
      autocomplete: "organization",
      fullSpan: true,
    },
    {
      key: "address",
      labelKey: "addressLine1Label",
      requiredKey: "addressRequired",
      type: "search",
      placeholder: "Street and house number",
      autocomplete: "address-line1",
      fullSpan: true,
      addressSearch: true,
      requiredWhenParentRequired: true,
    },
    {
      key: "address_line2",
      parentKey: "address",
      labelKey: "addressLine2Label",
      requiredKey: "addressLine2Required",
      type: "text",
      placeholder: "Apartment, suite, floor",
      autocomplete: "address-line2",
      fullSpan: true,
    },
    {
      key: "city",
      parentKey: "address",
      labelKey: "cityLabel",
      requiredKey: "cityRequired",
      type: "text",
      placeholder: "City",
      autocomplete: "address-level2",
      requiredWhenParentRequired: true,
    },
    {
      key: "region",
      parentKey: "address",
      labelKey: "regionLabel",
      requiredKey: "regionRequired",
      type: "text",
      placeholder: "State / region",
      autocomplete: "address-level1",
    },
    {
      key: "postal_code",
      parentKey: "address",
      labelKey: "postalCodeLabel",
      requiredKey: "postalCodeRequired",
      type: "text",
      placeholder: "Postal code",
      autocomplete: "postal-code",
      requiredWhenParentRequired: true,
    },
    {
      key: "country",
      parentKey: "address",
      labelKey: "countryLabel",
      requiredKey: "countryRequired",
      type: "text",
      placeholder: "Country",
      autocomplete: "country-name",
      requiredWhenParentRequired: true,
    },
  ];

  const DEFAULT_REGISTRATION_SETTINGS = {
    enabled: true,
    fields: {
      first_name: {show: true, required: true},
      last_name: {show: true, required: true},
      phone: {show: true, required: false},
      email: {show: true, required: true},
      company: {show: false, required: false},
      address: {show: false, required: false},
    },
  };

  const REGISTRATION_TEMPLATE_FIELDS = [
    {key: "first_name", aliases: ["FName", "first_name", "firstName"]},
    {key: "last_name", aliases: ["LName", "last_name", "lastName"]},
    {key: "phone", aliases: ["Phone", "phone"]},
    {key: "email", aliases: ["Email", "email"]},
    {key: "company", aliases: ["Company", "company"]},
    {key: "address", aliases: ["Address", "address"]},
  ];

  function normalizeRegistrationConfig(config) {
    const source =
      config && typeof config === "object" && !Array.isArray(config)
        ? config
        : {};
    const sourceFields =
      source.fields &&
      typeof source.fields === "object" &&
      !Array.isArray(source.fields)
        ? source.fields
        : {};
    const fields = {};

    REGISTRATION_FIELD_DEFINITIONS.forEach(function (definition) {
      const defaultField =
        DEFAULT_REGISTRATION_SETTINGS.fields[definition.key] || {};
      const field =
        sourceFields[definition.key] &&
        typeof sourceFields[definition.key] === "object" &&
        !Array.isArray(sourceFields[definition.key])
          ? sourceFields[definition.key]
          : {};
      const show =
        typeof field.show === "boolean"
          ? field.show
          : Boolean(defaultField.show);
      fields[definition.key] = {
        show,
        required:
          show &&
          (typeof field.required === "boolean"
            ? field.required
            : Boolean(defaultField.required)),
      };
    });

    return {
      enabled:
        typeof source.enabled === "boolean"
          ? source.enabled
          : DEFAULT_REGISTRATION_SETTINGS.enabled,
      fields,
    };
  }

  const state = {
    agent: null,
    colors: {
      primary: "#6e26f5",
      secondary: "#0e273d",
      button: "#6e26f5",
    },
    lang: resolvedLang,
    name: ds.agentName || "Michaela",
    greeting: "Hi there, I am Michaela!",
    starting:
      "Hi {{FName}}, I am Michaela, the AI assistant for Jon. How can I help today?",
    avatar: host + "/avatars/Michelle_Intro.mp4",
    mapboxToken: "",
    tracking: {
      ...scriptTracking,
      source: hasScriptTracking ? "script" : "",
    },
    conversation: [],
    open: false,
    toastShown: false,
    toastTimer: null,
    sending: false,
    conversationId: null,
    typing: false,
    typewriting: false,
    typewriterRunId: 0,
    hasStarted: false,
    introInProgress: false,
    promptOptions: [],
    promptsOpen: false,
    registration: normalizeRegistrationConfig(),
    registrationCompleted: false,
    user: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      company: "",
      address: "",
      address_line1: "",
      address_line2: "",
      city: "",
      region: "",
      postal_code: "",
      country: "",
      address_latitude: "",
      address_longitude: "",
      address_country_code: "",
      full_address: "",
    },
  };

  const COOKIE_NAME = "chat_conversation";

  function saveConversationCookie() {
    try {
      const user = getRegistrationUserPayload();
      const payload = {
        id: state.conversationId || null,
        lang: state.lang,
        registrationCompleted:
          registrationEnabled() && Boolean(state.registrationCompleted),
        ...(user ? {user} : {}),
      };
      const encoded = encodeURIComponent(JSON.stringify(payload));
      document.cookie = `${COOKIE_NAME}=${encoded}; path=/; max-age=${
        60 * 60 * 24
      }`;
    } catch (e) {
      console.warn("[chat-widget] failed to save conversation cookie", e);
    }
  }

  function loadConversationCookie(allowLang = true) {
    try {
      const parts = document.cookie.split(";").map((c) => c.trim());
      const kv = parts.find((p) => p.startsWith(`${COOKIE_NAME}=`));
      if (!kv) return;
      const raw = kv.split("=")[1];
      if (!raw) return;
      const parsed = JSON.parse(decodeURIComponent(raw));
      if (parsed?.id) state.conversationId = parsed.id;
      if (allowLang && parsed?.lang) state.lang = parsed.lang;
      if (parsed?.user) {
        const userPayload = sanitizeUserPayload(parsed.user);
        if (userPayload) {
          state.user = {...state.user, ...userPayload};
          state.registrationCompleted = true;
        }
      }
      if (parsed?.registrationCompleted) state.registrationCompleted = true;
    } catch (e) {
      console.warn("[chat-widget] failed to load conversation cookie", e);
    }
  }

  async function loadConversationFromServer() {
    if (!state.conversationId) return;
    try {
      const res = await fetch(
        host +
          `/api/agents/conversations/details?conversation_id=${encodeURIComponent(
            state.conversationId,
          )}`,
      );

      console.log("Conversations Response -> ", res);
      if (!res.ok) throw new Error(`details ${res.status}`);
      const data = await res.json();
      const convo = data?.data?.conversation;
      const userPayload = sanitizeUserPayload(data?.data?.user);
      if (userPayload) {
        state.user = {...state.user, ...userPayload};
        state.registrationCompleted = true;
      }
      if (Array.isArray(convo)) {
        state.conversation = convo.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.message,
        }));
        if (state.conversation.length > 0) state.hasStarted = true;
        renderMessages();
        saveConversationCookie();
      }
    } catch (e) {
      console.warn("[chat-widget] failed to load conversation from server", e);
    }
  }

  function pickLocalized(value, lang) {
    if (!value) return null;
    if (Array.isArray(value)) {
      const hit =
        value.find(
          (item) =>
            item &&
            typeof item === "object" &&
            (item.language || item.lang) &&
            (item.language || item.lang).slice(0, 2).toLowerCase() === lang,
        ) ||
        value.find(
          (item) =>
            item &&
            typeof item === "object" &&
            (item.language || item.lang || "").slice(0, 2).toLowerCase() ===
              "en",
        );
      return hit?.text || null;
    }
    if (value && typeof value === "object") {
      const normalized = lang?.slice(0, 2).toLowerCase();
      const fromLang =
        value[normalized] ||
        value[lang] ||
        value.en ||
        value.EN ||
        value.default;
      if (typeof fromLang === "string") return fromLang;
      if (fromLang && typeof fromLang.text === "string") return fromLang.text;
    }
    if (typeof value === "string") return value;
    return null;
  }

  const shell = document.createElement("div");
  shell.className =
    "chat-widget-shell" + (mode === "embedded" ? " embedded" : "");
  const attachTarget = mountEl || document.body;

  console.log("State -> ", state);

  function setColors() {
    shell.style.setProperty("--chat-primary", state.colors.primary);
    shell.style.setProperty("--chat-secondary", state.colors.secondary);
    shell.style.setProperty("--chat-button", state.colors.button);
  }

  let externalTranslations = null;

  const i18n = {
    en: {
      send: "Send",
      placeholder: "Type your message...",
      showPrompts: "Show prompts",
      hidePrompts: "Hide prompts",
      notConfigured: "This agent is not fully configured yet.",
      error: "Sorry, something went wrong. Please try again.",
      fallback: "I am here to help.",
      userTitle: "How can we reach you if we lose contact?",
      userSubtitle:
        "Share your details so we can follow up even if the chat is interrupted.",
      firstNameLabel: "First name",
      lastNameLabel: "Last name",
      emailLabel: "Email",
      phoneLabel: "Phone",
      companyLabel: "Company",
      addressLabel: "Address",
      addressSearchLabel: "Address search",
      addressLine1Label: "Street address",
      addressLine2Label: "Apartment / suite",
      cityLabel: "City",
      regionLabel: "State / region",
      postalCodeLabel: "Postal code",
      countryLabel: "Country",
      optionalSuffix: "(optional)",
      addressSuggestionsUnavailable: "Address autocomplete is unavailable.",
      addressNoSuggestions: "No address matches found.",
      startChat: "Start chat",
      firstNameRequired: "First name is required.",
      lastNameRequired: "Last name is required.",
      phoneRequired: "Phone is required.",
      emailRequired: "Email is required.",
      emailInvalid: "Email must be valid.",
      companyRequired: "Company is required.",
      addressRequired: "Address is required.",
      addressLine1Required: "Street address is required.",
      addressLine2Required: "Apartment / suite is required.",
      cityRequired: "City is required.",
      regionRequired: "State / region is required.",
      postalCodeRequired: "Postal code is required.",
      countryRequired: "Country is required.",
      registrationRequired:
        "Please complete the required details to start chatting.",
      blockedPlaceholder: "Enter your details to start chatting",
      startNewConversation: "Start new conversation",
    },
    de: {
      send: "Senden",
      placeholder: "Nachricht eingeben...",
      showPrompts: "Prompts anzeigen",
      hidePrompts: "Prompts ausblenden",
      notConfigured: "Dieser Agent ist noch nicht vollständig konfiguriert.",
      error:
        "Entschuldigung, etwas ist schiefgelaufen. Bitte erneut versuchen.",
      fallback: "Ich helfe gerne weiter.",
      userTitle: "Wie können wir Sie erreichen, falls der Kontakt abbricht?",
      userSubtitle:
        "Teilen Sie Ihre Daten, damit wir nachfassen können, falls der Chat unterbrochen wird.",
      firstNameLabel: "Vorname",
      lastNameLabel: "Nachname",
      emailLabel: "E-Mail",
      phoneLabel: "Telefon",
      companyLabel: "Firma",
      addressLabel: "Adresse",
      addressSearchLabel: "Adresse suchen",
      addressLine1Label: "Straße und Hausnummer",
      addressLine2Label: "Adresszusatz",
      cityLabel: "Stadt",
      regionLabel: "Bundesland / Region",
      postalCodeLabel: "Postleitzahl",
      countryLabel: "Land",
      optionalSuffix: "(optional)",
      addressSuggestionsUnavailable:
        "Adress-Autovervollständigung ist nicht verfügbar.",
      addressNoSuggestions: "Keine passenden Adressen gefunden.",
      startChat: "Chat starten",
      firstNameRequired: "Vorname ist erforderlich.",
      lastNameRequired: "Nachname ist erforderlich.",
      phoneRequired: "Telefon ist erforderlich.",
      emailRequired: "E-Mail ist erforderlich.",
      emailInvalid: "E-Mail muss gültig sein.",
      companyRequired: "Firma ist erforderlich.",
      addressRequired: "Adresse ist erforderlich.",
      addressLine1Required: "Straße und Hausnummer sind erforderlich.",
      addressLine2Required: "Adresszusatz ist erforderlich.",
      cityRequired: "Stadt ist erforderlich.",
      regionRequired: "Bundesland / Region ist erforderlich.",
      postalCodeRequired: "Postleitzahl ist erforderlich.",
      countryRequired: "Land ist erforderlich.",
      registrationRequired:
        "Bitte füllen Sie die erforderlichen Angaben aus, um den Chat zu starten.",
      blockedPlaceholder: "Details eingeben, um zu starten",
      startNewConversation: "Neue Konversation starten",
    },
    it: {
      send: "Invia",
      placeholder: "Scrivi il tuo messaggio...",
      showPrompts: "Mostra prompt",
      hidePrompts: "Nascondi prompt",
      notConfigured: "Questo agente non è ancora completamente configurato.",
      error: "Spiacente, si è verificato un errore. Riprova.",
      fallback: "Sono qui per aiutarti.",
      userTitle: "Come possiamo contattarti se perdiamo il contatto?",
      userSubtitle:
        "Condividi i tuoi dati così possiamo richiamarti se la chat si interrompe.",
      firstNameLabel: "Nome",
      lastNameLabel: "Cognome",
      emailLabel: "Email",
      phoneLabel: "Telefono",
      companyLabel: "Azienda",
      addressLabel: "Indirizzo",
      addressSearchLabel: "Cerca indirizzo",
      addressLine1Label: "Indirizzo",
      addressLine2Label: "Appartamento / interno",
      cityLabel: "Città",
      regionLabel: "Provincia / regione",
      postalCodeLabel: "CAP",
      countryLabel: "Paese",
      optionalSuffix: "(opzionale)",
      addressSuggestionsUnavailable:
        "Il completamento automatico dell'indirizzo non è disponibile.",
      addressNoSuggestions: "Nessun indirizzo trovato.",
      startChat: "Inizia chat",
      firstNameRequired: "Il nome è obbligatorio.",
      lastNameRequired: "Il cognome è obbligatorio.",
      phoneRequired: "Il telefono è obbligatorio.",
      emailRequired: "L'email è obbligatoria.",
      emailInvalid: "L'email deve essere valida.",
      companyRequired: "L'azienda è obbligatoria.",
      addressRequired: "L'indirizzo è obbligatorio.",
      addressLine1Required: "L'indirizzo è obbligatorio.",
      addressLine2Required: "Appartamento / interno è obbligatorio.",
      cityRequired: "La città è obbligatoria.",
      regionRequired: "La provincia / regione è obbligatoria.",
      postalCodeRequired: "Il CAP è obbligatorio.",
      countryRequired: "Il paese è obbligatorio.",
      registrationRequired: "Completa i dati obbligatori per iniziare la chat.",
      blockedPlaceholder: "Inserisci i dati per iniziare",
      startNewConversation: "Avvia nuova conversazione",
    },
  };

  function t(key) {
    // Prefer external translations if available
    if (externalTranslations && externalTranslations[key]) {
      return externalTranslations[key];
    }
    const pack = i18n[state.lang] || i18n.en;
    return pack[key] || i18n.en[key] || "";
  }

  const countryDataCache = {promise: null, data: null};

  function parseLocaleParts(locale) {
    const normalized = (locale || "").replace("_", "-");
    const [languagePart, regionPart] = normalized.split("-");
    return {
      language: (languagePart || "").toLowerCase(),
      region: (regionPart || "").toUpperCase(),
    };
  }
  async function loadExternalTranslations(lang) {
    try {
      const res = await fetch(host + `/locales/${lang}/translation.json`);
      if (!res.ok) throw new Error("translations fetch failed");
      const json = await res.json();
      // Accept either top-level ChatWidget or nested under pages.ChatWidget
      externalTranslations =
        json?.ChatWidget || json?.pages?.ChatWidget || null;
    } catch (e) {
      externalTranslations = null;
    }
  }

  function applyTranslations() {
    sendBtn.textContent = t("send");
    input.placeholder = needsUserDetails()
      ? t("blockedPlaceholder")
      : t("placeholder");
    updatePromptToggleLabel();
    clearLink.textContent = t("startNewConversation");
    userTitle.textContent = t("userTitle");
    userSubtitle.textContent = t("userSubtitle");
    submitUser.textContent = t("startChat");
    renderRegistrationFields();
  }

  async function loadCountryData() {
    if (countryDataCache.promise) return countryDataCache.promise;
    countryDataCache.promise = fetch(host + "/data/CountryData.json")
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);
    countryDataCache.data = await countryDataCache.promise;
    return countryDataCache.data;
  }

  function formatDialPlaceholder(dialCode) {
    if (!dialCode) return "+41 123 456 789";
    return `+${dialCode} 123 456 789`;
  }

  async function deriveDialCode(locale) {
    const countryData = await loadCountryData();
    if (!Array.isArray(countryData)) return null;
    const {language, region} = parseLocaleParts(locale);
    let match = null;

    if (region) {
      match = countryData.find(
        (entry) =>
          (entry.code || "").toUpperCase() === region && entry.dialCode,
      );
    }

    if (!match && language) {
      match = countryData.find(
        (entry) =>
          (entry.code || "").toLowerCase() === language && entry.dialCode,
      );
    }

    return match?.dialCode || null;
  }

  function isVideoAvatar(src) {
    if (typeof src !== "string") return false;
    const trimmed = src.trim();
    if (!trimmed) return false;
    if (/^data:video\//i.test(trimmed)) return true;
    if (/^blob:/i.test(trimmed)) return true;
    return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(trimmed);
  }

  function resolveWidgetAssetUrl(src, fallback) {
    const trimmed = (src || "").trim();
    const fallbackUrl = fallback || host + "/avatars/Michelle_Intro.mp4";
    if (!trimmed) return fallbackUrl;
    if (/^(data|blob):/i.test(trimmed)) return trimmed;

    try {
      return new URL(trimmed, host + "/").href;
    } catch (e) {
      return fallbackUrl;
    }
  }

  const avatarPreloadUrls = new Set();

  function isWidgetHostUrl(src) {
    try {
      return new URL(src).origin === new URL(host).origin;
    } catch (e) {
      return false;
    }
  }

  function preloadAvatarAsset(src) {
    const resolvedSrc = resolveWidgetAssetUrl(src, state.avatar);
    if (
      !resolvedSrc ||
      /^(data|blob):/i.test(resolvedSrc) ||
      avatarPreloadUrls.has(resolvedSrc)
    ) {
      return resolvedSrc;
    }

    avatarPreloadUrls.add(resolvedSrc);
    const link = document.createElement("link");
    link.rel = "preload";
    link.href = resolvedSrc;
    link.as = isVideoAvatar(resolvedSrc) ? "video" : "image";
    link.fetchPriority = "high";
    if (isWidgetHostUrl(resolvedSrc)) {
      link.crossOrigin = "anonymous";
    }
    document.head.appendChild(link);
    return resolvedSrc;
  }

  function createAvatarMedia(src, alt, options) {
    const opts = Object.assign({autoplayVideo: true}, options);
    const resolvedSrc = resolveWidgetAssetUrl(src, state.avatar);
    const isVideo = isVideoAvatar(resolvedSrc);
    const media = document.createElement(isVideo ? "video" : "img");
    media.dataset.avatarSrc = resolvedSrc;
    media.dataset.avatarAutoplay = String(Boolean(opts.autoplayVideo));
    if (isWidgetHostUrl(resolvedSrc)) {
      media.crossOrigin = "anonymous";
    }
    if (isVideo) {
      media.muted = true;
      media.autoplay = Boolean(opts.autoplayVideo);
      media.loop = Boolean(opts.autoplayVideo);
      media.playsInline = true;
      media.controls = false;
      media.preload = "auto";
      media.setAttribute("aria-label", alt || "Michaela");
      media.setAttribute("playsinline", "true");
      media.setAttribute("muted", "true");
      if (opts.autoplayVideo) {
        media.setAttribute("autoplay", "true");
        media.addEventListener("loadeddata", function () {
          if (typeof media.play === "function") {
            media.play().catch(function () {});
          }
        });
      }
    } else {
      media.alt = alt || "Michaela";
      media.decoding = "async";
      media.loading = "eager";
      media.fetchPriority = "high";
    }
    media.src = resolvedSrc;
    return media;
  }

  function avatarMediaReady(media) {
    if (!media) return false;
    if (media.tagName === "IMG") {
      return Boolean(media.complete && media.naturalWidth);
    }
    return typeof media.readyState === "number" && media.readyState >= 2;
  }

  function onAvatarMediaReady(media, onReady) {
    if (avatarMediaReady(media)) {
      onReady();
      return;
    }

    let handled = false;
    const readyEvent = media.tagName === "IMG" ? "load" : "loadeddata";
    const done = function () {
      if (handled) return;
      handled = true;
      media.removeEventListener(readyEvent, done);
      media.removeEventListener("error", fail);
      onReady();
    };
    const fail = function () {
      handled = true;
      media.removeEventListener(readyEvent, done);
      media.removeEventListener("error", fail);
    };

    media.addEventListener(readyEvent, done);
    media.addEventListener("error", fail);
    if (media.tagName === "VIDEO" && typeof media.load === "function") {
      media.load();
    }
  }

  function mountAvatarMedia(container, existing, indicator, media) {
    if (existing && existing.parentNode === container) {
      container.replaceChild(media, existing);
    } else if (indicator && indicator.parentNode === container) {
      container.insertBefore(media, indicator);
    } else {
      container.appendChild(media);
    }
  }

  function setAvatarMedia(container, src, alt, indicatorSelector, options) {
    const indicator =
      indicatorSelector && container.querySelector(indicatorSelector);
    const existing = container.querySelector("img, video");
    const opts = Object.assign({autoplayVideo: true}, options);
    const resolvedSrc = preloadAvatarAsset(src);
    const nextAutoplay = String(Boolean(opts.autoplayVideo));
    container.dataset.avatarRequestedSrc = resolvedSrc;
    if (
      existing &&
      existing.dataset.avatarSrc === resolvedSrc &&
      existing.dataset.avatarAutoplay === nextAutoplay
    ) {
      if (existing.tagName === "IMG") existing.alt = alt || "Michaela";
      if (existing.tagName === "VIDEO") {
        existing.setAttribute("aria-label", alt || "Michaela");
      }
      return;
    }
    const media = createAvatarMedia(src, alt, options);
    if (!existing) {
      mountAvatarMedia(container, existing, indicator, media);
      return;
    }

    onAvatarMediaReady(media, function () {
      if (container.dataset.avatarRequestedSrc !== resolvedSrc) return;
      mountAvatarMedia(container, existing, indicator, media);
    });
  }

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "chat-widget-launcher";

  const avatar = document.createElement("div");
  avatar.className = "chat-widget-avatar launcher-avatar";
  const onlineDot = document.createElement("span");
  onlineDot.className = "chat-widget-online";
  avatar.appendChild(onlineDot);

  launcher.appendChild(avatar);

  const modal = document.createElement("div");
  modal.className =
    "chat-widget-modal" + (mode === "embedded" ? " embedded" : "");

  const header = document.createElement("div");
  header.className = "chat-widget-header";
  const headerAvatar = document.createElement("div");
  headerAvatar.className = "chat-widget-avatar";
  const headerOnline = document.createElement("span");
  headerOnline.className = "chat-widget-online";
  headerAvatar.appendChild(headerOnline);

  const headerInfo = document.createElement("div");
  headerInfo.className = "chat-widget-labels";
  const headerName = document.createElement("span");
  headerName.className = "name";
  headerName.textContent = state.name;
  const headerStatus = document.createElement("span");
  headerStatus.className = "status";
  headerStatus.textContent = "";
  headerInfo.appendChild(headerName);
  headerInfo.appendChild(headerStatus);

  const closeBtn = document.createElement("button");
  closeBtn.className = "chat-widget-close";
  closeBtn.type = "button";
  closeBtn.innerHTML = "&times;";

  header.appendChild(headerAvatar);
  header.appendChild(headerInfo);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "chat-widget-body";
  const messages = document.createElement("div");
  messages.className = "chat-widget-messages";
  body.appendChild(messages);

  const inputRow = document.createElement("form");
  inputRow.className = "chat-widget-input";
  const promptToggleBtn = document.createElement("button");
  promptToggleBtn.type = "button";
  promptToggleBtn.className = "chat-widget-prompt-toggle hidden";
  promptToggleBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path><path d="M12 8v6"></path><path d="M9 11h6"></path></svg>';
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = t("placeholder");
  const sendBtn = document.createElement("button");
  sendBtn.type = "submit";
  sendBtn.textContent = t("send");
  inputRow.appendChild(promptToggleBtn);
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);

  input.addEventListener("input", updateInputAvailability);

  const suggestions = document.createElement("div");
  suggestions.className = "chat-widget-suggestions hidden";
  const suggestionsTrack = document.createElement("div");
  suggestionsTrack.className = "chat-widget-suggestions-track";
  suggestions.appendChild(suggestionsTrack);

  const clearLink = document.createElement("div");
  clearLink.className = "chat-widget-clear-link";
  clearLink.textContent = t("startNewConversation");
  clearLink.style.display = "none";

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(suggestions);
  modal.appendChild(inputRow);
  modal.appendChild(clearLink);

  const toast = document.createElement("div");
  toast.className = "chat-toast";
  const toastAvatar = document.createElement("div");
  toastAvatar.className = "toast-avatar";
  const toastOnline = document.createElement("span");
  toastOnline.className = "toast-online";
  toastAvatar.appendChild(toastOnline);
  const toastText = document.createElement("div");
  toastText.className = "toast-text";
  const toastClose = document.createElement("button");
  toastClose.className = "toast-close";
  toastClose.type = "button";
  toastClose.innerHTML = "&times;";
  toast.appendChild(toastAvatar);
  toast.appendChild(toastText);
  toast.appendChild(toastClose);

  function updateAvatarMediaAll(src, altText) {
    const alt = altText || "Michaela";
    setAvatarMedia(avatar, src, alt, ".chat-widget-online");
    setAvatarMedia(headerAvatar, src, alt, ".chat-widget-online", {
      autoplayVideo: false,
    });
    setAvatarMedia(toastAvatar, src, alt, ".toast-online", {
      autoplayVideo: false,
    });
  }

  const userOverlay = document.createElement("div");
  userOverlay.className = "chat-user-overlay hidden";
  const userCard = document.createElement("div");
  userCard.className = "chat-user-card";
  const userTitle = document.createElement("h3");
  userTitle.textContent = t("userTitle");
  const userSubtitle = document.createElement("p");
  userSubtitle.textContent = t("userSubtitle");

  function buildUserField(definition) {
    const wrapper = document.createElement("label");
    wrapper.className = "chat-user-field";
    const label = document.createElement("span");
    label.textContent = t(definition.labelKey);
    const field = document.createElement("input");
    field.type = definition.type || "text";
    field.name = definition.key;
    field.placeholder = definition.placeholder || "";
    field.autocomplete = definition.autocomplete || "off";
    wrapper.appendChild(label);
    wrapper.appendChild(field);
    return {definition, wrapper, label, field};
  }

  const userForm = document.createElement("form");
  userForm.className = "chat-user-form";
  userForm.noValidate = true;
  const userFields = {};

  REGISTRATION_FIELD_DEFINITIONS.forEach(function (definition) {
    const item = buildUserField(definition);
    if (definition.fullSpan) item.wrapper.classList.add("full-span");
    if (definition.addressSearch) {
      item.wrapper.classList.add("chat-address-search-field");
    }
    userFields[definition.key] = item;
    userForm.appendChild(item.wrapper);
  });

  const addressSuggestions = document.createElement("div");
  addressSuggestions.className = "chat-address-suggestions hidden";
  if (userFields.address) {
    userFields.address.wrapper.appendChild(addressSuggestions);
  }

  const userError = document.createElement("div");
  userError.className = "chat-user-error";
  userError.setAttribute("role", "alert");
  userError.setAttribute("aria-live", "polite");
  const submitUser = document.createElement("button");
  submitUser.type = "submit";
  submitUser.textContent = t("startChat");

  userError.classList.add("full-span");
  submitUser.classList.add("full-span");

  userForm.appendChild(userError);
  userForm.appendChild(submitUser);

  Object.values(userFields).forEach(function (item) {
    item.field.addEventListener("input", function () {
      userError.textContent = "";
      if (
        item.definition.addressSearch ||
        item.definition.parentKey === "address"
      ) {
        state.user.address_latitude = "";
        state.user.address_longitude = "";
        state.user.address_country_code = "";
        state.user.full_address = "";
      }
    });
  });

  if (userFields.address?.field) {
    userFields.address.field.addEventListener("input", scheduleAddressSearch);
    userFields.address.field.addEventListener("focus", scheduleAddressSearch);
    userFields.address.field.addEventListener("keydown", function (event) {
      if (event.key === "Escape") clearAddressSuggestions();
    });
  }

  function registrationEnabled() {
    return Boolean(state.registration && state.registration.enabled);
  }

  function getRegistrationFieldConfig(definitionOrKey) {
    const definition =
      typeof definitionOrKey === "string"
        ? {key: definitionOrKey}
        : definitionOrKey || {};
    const configKey = definition.parentKey || definition.key;
    const baseConfig = state.registration?.fields?.[configKey] || {
      show: false,
      required: false,
    };

    if (definition.parentKey === "address") {
      return {
        show: Boolean(baseConfig.show),
        required:
          Boolean(baseConfig.required) &&
          Boolean(definition.requiredWhenParentRequired),
      };
    }

    if (definition.addressSearch) {
      return {
        show: Boolean(baseConfig.show),
        required:
          Boolean(baseConfig.required) &&
          Boolean(definition.requiredWhenParentRequired),
      };
    }

    return baseConfig;
  }

  function visibleRegistrationFields() {
    if (!registrationEnabled()) return [];
    return REGISTRATION_FIELD_DEFINITIONS.filter(function (definition) {
      return Boolean(getRegistrationFieldConfig(definition).show);
    });
  }

  function requiredRegistrationFields() {
    return visibleRegistrationFields().filter(function (definition) {
      return Boolean(getRegistrationFieldConfig(definition).required);
    });
  }

  function registrationHasVisibleFields() {
    return visibleRegistrationFields().length > 0;
  }

  function registrationHasRequiredFields() {
    return requiredRegistrationFields().length > 0;
  }

  function registrationRequiredFieldsComplete() {
    return requiredRegistrationFields().every(function (definition) {
      return Boolean(String(state.user[definition.key] || "").trim());
    });
  }

  function registrationFieldLabel(definition, fieldConfig) {
    const label = t(definition.labelKey);
    return fieldConfig.required
      ? label
      : `${label} ${t("optionalSuffix")}`.trim();
  }

  function renderRegistrationFields() {
    REGISTRATION_FIELD_DEFINITIONS.forEach(function (definition) {
      const item = userFields[definition.key];
      if (!item) return;
      const fieldConfig = getRegistrationFieldConfig(definition);
      const visible = registrationEnabled() && Boolean(fieldConfig.show);

      item.wrapper.classList.toggle("hidden", !visible);
      item.label.textContent = registrationFieldLabel(definition, fieldConfig);
      item.field.required = visible && Boolean(fieldConfig.required);
      item.field.placeholder = definition.placeholder || "";
    });

    const phoneField = userFields.phone?.field;
    if (phoneField && phoneField.dataset.dialPlaceholder) {
      phoneField.placeholder = phoneField.dataset.dialPlaceholder;
    }

    if (!getRegistrationFieldConfig("address").show) {
      clearAddressSuggestions();
    }
  }

  let addressSearchTimer = null;
  let addressSearchController = null;

  function clearAddressSuggestions() {
    if (addressSearchTimer) {
      clearTimeout(addressSearchTimer);
      addressSearchTimer = null;
    }
    if (addressSearchController) {
      addressSearchController.abort();
      addressSearchController = null;
    }
    addressSuggestions.innerHTML = "";
    addressSuggestions.classList.add("hidden");
  }

  function addressContextName(context, key) {
    return String(context?.[key]?.name || "").trim();
  }

  function addressCountryName(context) {
    return String(
      context?.country?.name ||
        context?.country?.country_name ||
        context?.country?.country_code ||
        "",
    ).trim();
  }

  function addressCoordinate(feature, key) {
    const fromProperties = feature?.properties?.coordinates?.[key];
    if (Number.isFinite(fromProperties)) return fromProperties;
    const index = key === "longitude" ? 0 : 1;
    const fromGeometry = feature?.geometry?.coordinates?.[index];
    return Number.isFinite(fromGeometry) ? fromGeometry : "";
  }

  function mapboxFeatureToAddress(feature) {
    const properties = feature?.properties || {};
    const context = properties.context || {};
    const addressContext = context.address || {};
    const addressLine1 = String(
      properties.address_line1 || addressContext.name || properties.name || "",
    ).trim();
    const placeFormatted = String(properties.place_formatted || "").trim();
    const fullAddress = String(
      properties.full_address ||
        [addressLine1, placeFormatted].filter(Boolean).join(", "),
    ).trim();

    return {
      address: addressLine1,
      full_address: fullAddress,
      address_line2: String(context.secondary_address?.name || "").trim(),
      city:
        addressContextName(context, "place") ||
        addressContextName(context, "locality"),
      region: addressContextName(context, "region"),
      postal_code: addressContextName(context, "postcode"),
      country: addressCountryName(context),
      country_code: String(context.country?.country_code || "")
        .trim()
        .toUpperCase(),
      longitude: addressCoordinate(feature, "longitude"),
      latitude: addressCoordinate(feature, "latitude"),
    };
  }

  function setAddressFieldValue(key, value) {
    if (!userFields[key]) return;
    const text = String(value || "");
    userFields[key].field.value = text;
    state.user[key] = text;
  }

  function applyAddressSuggestion(feature) {
    const address = mapboxFeatureToAddress(feature);
    [
      "address",
      "address_line2",
      "city",
      "region",
      "postal_code",
      "country",
    ].forEach(function (key) {
      setAddressFieldValue(key, address[key]);
    });
    state.user.address_latitude = address.latitude;
    state.user.address_longitude = address.longitude;
    state.user.address_country_code = address.country_code;
    state.user.full_address = address.full_address;
    userError.textContent = "";
    clearAddressSuggestions();
    focusWithoutPageScroll(userFields.address?.field);
  }

  function renderAddressSuggestions(features) {
    addressSuggestions.innerHTML = "";

    if (!features.length) {
      const empty = document.createElement("div");
      empty.className = "chat-address-suggestion-empty";
      empty.textContent = t("addressNoSuggestions");
      addressSuggestions.appendChild(empty);
      addressSuggestions.classList.remove("hidden");
      return;
    }

    features.forEach(function (feature) {
      const address = mapboxFeatureToAddress(feature);
      const option = document.createElement("button");
      option.type = "button";
      option.className = "chat-address-suggestion";
      option.addEventListener("mousedown", function (event) {
        event.preventDefault();
      });
      option.addEventListener("click", function () {
        applyAddressSuggestion(feature);
      });

      const title = document.createElement("span");
      title.textContent = address.address || address.full_address;
      const subtitle = document.createElement("small");
      subtitle.textContent = [
        address.city,
        address.region,
        address.postal_code,
        address.country,
      ]
        .filter(Boolean)
        .join(", ");

      option.appendChild(title);
      option.appendChild(subtitle);
      addressSuggestions.appendChild(option);
    });

    addressSuggestions.classList.remove("hidden");
  }

  function scheduleAddressSearch() {
    if (!registrationEnabled() || !getRegistrationFieldConfig("address").show) {
      clearAddressSuggestions();
      return;
    }

    if (addressSearchTimer) clearTimeout(addressSearchTimer);
    const query = userFields.address?.field.value.trim() || "";
    if (!state.mapboxToken || query.length < 3) {
      clearAddressSuggestions();
      return;
    }

    addressSearchTimer = setTimeout(function () {
      void fetchAddressSuggestions(query);
    }, 350);
  }

  function finiteCoordinate(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max
      ? number
      : null;
  }

  function hasCoordinateBias() {
    return (
      finiteCoordinate(state.tracking.latitude, -90, 90) !== null &&
      finiteCoordinate(state.tracking.longitude, -180, 180) !== null
    );
  }

  function toRadians(value) {
    return (value * Math.PI) / 180;
  }

  function distanceMeters(
    fromLatitude,
    fromLongitude,
    toLatitude,
    toLongitude,
  ) {
    const earthRadiusMeters = 6371000;
    const deltaLatitude = toRadians(toLatitude - fromLatitude);
    const deltaLongitude = toRadians(toLongitude - fromLongitude);
    const startLatitude = toRadians(fromLatitude);
    const endLatitude = toRadians(toLatitude);
    const haversine =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(startLatitude) *
        Math.cos(endLatitude) *
        Math.sin(deltaLongitude / 2) ** 2;

    return (
      2 *
      earthRadiusMeters *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
  }

  function sortAddressFeaturesByDistance(features) {
    if (!hasCoordinateBias()) return features;

    const fromLatitude = Number(state.tracking.latitude);
    const fromLongitude = Number(state.tracking.longitude);
    return [...features].sort(function (left, right) {
      const leftLatitude = finiteCoordinate(
        addressCoordinate(left, "latitude"),
        -90,
        90,
      );
      const leftLongitude = finiteCoordinate(
        addressCoordinate(left, "longitude"),
        -180,
        180,
      );
      const rightLatitude = finiteCoordinate(
        addressCoordinate(right, "latitude"),
        -90,
        90,
      );
      const rightLongitude = finiteCoordinate(
        addressCoordinate(right, "longitude"),
        -180,
        180,
      );

      if (leftLatitude === null || leftLongitude === null) return 1;
      if (rightLatitude === null || rightLongitude === null) return -1;

      return (
        distanceMeters(
          fromLatitude,
          fromLongitude,
          leftLatitude,
          leftLongitude,
        ) -
        distanceMeters(
          fromLatitude,
          fromLongitude,
          rightLatitude,
          rightLongitude,
        )
      );
    });
  }

  async function fetchAddressSuggestions(query) {
    if (addressSearchController) addressSearchController.abort();
    const controller = new AbortController();
    addressSearchController = controller;

    const params = new URLSearchParams({
      access_token: state.mapboxToken,
      autocomplete: "true",
      language: state.lang || "en",
      limit: "10",
      permanent: "true",
      q: query,
      types: "address",
    });
    const latitude = finiteCoordinate(state.tracking.latitude, -90, 90);
    const longitude = finiteCoordinate(state.tracking.longitude, -180, 180);
    const countryCode = String(state.tracking.countryCode || "")
      .trim()
      .toLowerCase();

    if (latitude !== null && longitude !== null) {
      params.set("proximity", `${longitude},${latitude}`);
    } else {
      params.set("proximity", "ip");
    }

    if (/^[a-z]{2}$/.test(countryCode)) {
      params.set("country", countryCode);
    }

    try {
      const response = await fetch(
        `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`,
        {signal: controller.signal},
      );
      if (!response.ok) throw new Error(`Mapbox ${response.status}`);
      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features : [];
      renderAddressSuggestions(
        sortAddressFeaturesByDistance(features).slice(0, 5),
      );
    } catch (error) {
      if (error?.name === "AbortError") return;
      addressSuggestions.innerHTML = "";
      const message = document.createElement("div");
      message.className = "chat-address-suggestion-empty";
      message.textContent = t("addressSuggestionsUnavailable");
      addressSuggestions.appendChild(message);
      addressSuggestions.classList.remove("hidden");
    } finally {
      if (addressSearchController === controller) {
        addressSearchController = null;
      }
    }
  }

  userCard.appendChild(userTitle);
  userCard.appendChild(userSubtitle);
  userCard.appendChild(userForm);
  userOverlay.appendChild(userCard);
  body.appendChild(userOverlay);

  shell.appendChild(modal);
  if (mode === "modal") {
    shell.appendChild(toast);
    shell.appendChild(launcher);
  }
  let shellMounted = false;

  function mountWidgetShell() {
    if (shellMounted) return;
    shellMounted = true;
    setColors();
    updateInputAvailability();
    toggleUserOverlay();
    attachTarget.appendChild(shell);
  }

  function sanitizeUserPayload(rawUser) {
    if (!rawUser) return null;
    const addressLine1 = (
      rawUser.address_line1 ||
      rawUser.address ||
      ""
    ).trim();
    const addressLine2 = (rawUser.address_line2 || "").trim();
    const city = (rawUser.city || "").trim();
    const region = (rawUser.region || "").trim();
    const postalCode = (rawUser.postal_code || "").trim();
    const country = (rawUser.country || "").trim();
    const postalCity = [postalCode, city].filter(Boolean).join(" ");
    const composedAddress = [
      addressLine1,
      addressLine2,
      postalCity,
      region,
      country,
    ]
      .filter(Boolean)
      .join(", ");
    const payload = {
      first_name: (rawUser.first_name || "").trim(),
      last_name: (rawUser.last_name || "").trim(),
      email: (rawUser.email || "").trim(),
      phone: (rawUser.phone || "").trim(),
      company: (rawUser.company || "").trim(),
      address: (rawUser.full_address || "").trim() || composedAddress,
      address_line1: addressLine1,
      address_line2: addressLine2,
      city,
      region,
      postal_code: postalCode,
      country,
      address_latitude: (rawUser.address_latitude || "").toString().trim(),
      address_longitude: (rawUser.address_longitude || "").toString().trim(),
      address_country_code: (rawUser.address_country_code || "")
        .toString()
        .trim(),
    };
    const hasData = Object.values(payload).some(Boolean);
    return hasData ? payload : null;
  }

  function getRegistrationUserPayload() {
    if (!registrationEnabled()) return null;
    const rawUser = {};

    visibleRegistrationFields().forEach(function (definition) {
      rawUser[definition.key] = state.user[definition.key] || "";
    });

    if (getRegistrationFieldConfig("address").show) {
      rawUser.address_latitude = state.user.address_latitude || "";
      rawUser.address_longitude = state.user.address_longitude || "";
      rawUser.address_country_code = state.user.address_country_code || "";
      rawUser.full_address = state.user.full_address || "";
    }

    return sanitizeUserPayload(rawUser);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function renderRegistrationTemplate(template, userPayload) {
    let text = String(template || "");
    const user = userPayload || {};

    REGISTRATION_TEMPLATE_FIELDS.forEach(function (field) {
      const aliases = field.aliases.map(escapeRegExp).join("|");
      const pattern = new RegExp(`\\{\\{\\s*(?:${aliases})\\s*\\}\\}`, "gi");
      text = text.replace(pattern, String(user[field.key] || "").trim());
    });

    return text
      .replace(/\{\{\s*[\w.-]+\s*\}\}/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function reducedMotionEnabled() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function focusWithoutPageScroll(element) {
    if (!element || typeof element.focus !== "function") return;
    requestAnimationFrame(function () {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      try {
        element.focus({preventScroll: true});
      } catch (_) {
        element.focus();
      }
      if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
        window.scrollTo(scrollX, scrollY);
      }
    });
  }

  function focusCurrentWidgetTarget() {
    if (needsUserDetails()) {
      const firstVisibleField = visibleRegistrationFields()[0];
      focusWithoutPageScroll(userFields[firstVisibleField?.key]?.field);
      return;
    }
    if (!input.disabled) {
      focusWithoutPageScroll(input);
    }
  }

  function hasUserMessage() {
    return state.conversation.some(function (message) {
      return message.role === "user";
    });
  }

  function introCharacterDelay(char) {
    if (/\s/.test(char)) return 12;
    if (/[.,!?;:]/.test(char)) return 90;
    return 24;
  }

  function assistantCharacterDelay(char) {
    if (/\s/.test(char)) return 8;
    if (/[.,!?;:]/.test(char)) return 55;
    return 18;
  }

  function assistantTypewriterBatchSize(charCount) {
    if (charCount > 900) return 4;
    if (charCount > 500) return 3;
    if (charCount > 240) return 2;
    return 1;
  }

  function updateStartNewVisibility() {
    const show = state.conversation.length > 1;
    clearLink.style.display = show ? "block" : "none";
    clearLink.classList.toggle(
      "disabled",
      state.typing ||
        state.typewriting ||
        state.sending ||
        state.introInProgress,
    );
  }

  function startNewConversationFlow() {
    if (state.typing || state.typewriting || state.sending) return;
    const userPayload = getRegistrationUserPayload();
    state.typewriterRunId += 1;
    state.typewriting = false;
    state.promptsOpen = false;
    state.conversation = [];
    state.conversationId = null;
    state.hasStarted = false;
    state.typing = false;
    saveConversationCookie();
    renderMessages();
    updateInputAvailability();
    if (userPayload) {
      startIntroConversation(userPayload);
    } else if (needsUserDetails()) {
      toggleUserOverlay(null, true);
    }
  }

  function needsUserDetails() {
    if (state.conversationId) return false;
    if (!registrationEnabled() || !registrationHasVisibleFields()) return false;
    if (!state.registrationCompleted) return true;
    return (
      registrationHasRequiredFields() && !registrationRequiredFieldsComplete()
    );
  }

  function updateInputAvailability() {
    const blocked = needsUserDetails();
    input.disabled = blocked || state.introInProgress;
    const emptyMessage = !input.value.trim();
    sendBtn.disabled =
      blocked || state.sending || state.introInProgress || emptyMessage;
    inputRow.classList.toggle("hidden", blocked);
    input.placeholder = blocked ? t("blockedPlaceholder") : t("placeholder");
    renderSuggestions();
  }

  function toggleUserOverlay(message, shouldFocus = false) {
    const shouldShow = needsUserDetails();
    userOverlay.classList.toggle("hidden", !shouldShow);
    if (shouldShow) {
      renderRegistrationFields();
      REGISTRATION_FIELD_DEFINITIONS.forEach(function (definition) {
        const item = userFields[definition.key];
        if (item) item.field.value = state.user[definition.key] || "";
      });
      userError.textContent = message || "";
      if (shouldFocus) {
        const firstVisibleField = visibleRegistrationFields()[0];
        focusWithoutPageScroll(userFields[firstVisibleField?.key]?.field);
      }
    } else {
      userError.textContent = "";
    }
    updateInputAvailability();
  }

  async function setPhonePlaceholder() {
    try {
      const dial = await deriveDialCode(rawLocale);
      if (!dial) return;
      if (userFields.phone?.field) {
        userFields.phone.field.dataset.dialPlaceholder =
          formatDialPlaceholder(dial);
      }
      renderRegistrationFields();
    } catch (_) {
      // ignore placeholder failures
    }
  }

  function promptControlsBusy() {
    return (
      state.sending ||
      state.typing ||
      state.typewriting ||
      state.introInProgress
    );
  }

  function updatePromptToggleLabel() {
    const label = state.promptsOpen ? t("hidePrompts") : t("showPrompts");
    promptToggleBtn.setAttribute("aria-label", label);
    promptToggleBtn.title = label;
  }

  function renderSuggestions() {
    const hasPrompts = state.promptOptions.length > 0;
    const blocked =
      needsUserDetails() ||
      state.introInProgress ||
      (state.conversationId && state.conversation.length === 0);
    const afterFirstQuestion = hasUserMessage();
    const showToggle = hasPrompts && !blocked && afterFirstQuestion;
    const busy = promptControlsBusy();

    if (!showToggle) state.promptsOpen = false;
    promptToggleBtn.classList.toggle("hidden", !showToggle);
    promptToggleBtn.classList.toggle("active", showToggle && state.promptsOpen);
    promptToggleBtn.disabled = !showToggle || busy;
    promptToggleBtn.setAttribute(
      "aria-expanded",
      String(showToggle && state.promptsOpen),
    );
    updatePromptToggleLabel();

    const show =
      hasPrompts && !blocked && (!afterFirstQuestion || state.promptsOpen);

    suggestions.classList.toggle("hidden", !show);
    suggestionsTrack.innerHTML = "";
    if (!show) return;

    state.promptOptions.forEach(function (prompt) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-widget-suggestion";
      button.textContent = prompt;
      button.title = prompt;
      button.disabled = busy;
      button.addEventListener("click", function () {
        if (button.disabled) return;
        state.promptsOpen = false;
        input.value = "";
        sendMessage(prompt);
      });
      suggestionsTrack.appendChild(button);
    });
  }

  async function loadDefaultQuestions() {
    try {
      const locale = encodeURIComponent(state.lang || "en");
      const res = await fetch(host + `/api/default-questions?locale=${locale}`);
      if (!res.ok) throw new Error(`default questions ${res.status}`);
      const data = await res.json();
      state.promptOptions = Array.isArray(data?.questions)
        ? data.questions
            .map(function (question) {
              return typeof question === "string" ? question.trim() : "";
            })
            .filter(Boolean)
        : [];
    } catch (e) {
      console.warn("[chat-widget] failed to load prompt suggestions", e);
      state.promptOptions = [];
    } finally {
      renderSuggestions();
    }
  }

  function renderMessages() {
    const prevHeight = messages.scrollHeight;
    const prevTop = body.scrollTop;
    const nearBottom = prevHeight - (prevTop + body.clientHeight) < 40; // stick only if near bottom

    messages.innerHTML = "";
    state.conversation.forEach(function (m) {
      const bubble = document.createElement("div");
      bubble.className = "chat-msg " + (m.role === "user" ? "user" : "agent");
      if (m.role === "assistant" && m.typewriting) {
        bubble.className += " typewriting";
      }
      bubble.innerHTML = formatMarkdown(m.content);
      messages.appendChild(bubble);
    });
    if (state.typing) {
      const typing = document.createElement("div");
      typing.className = "chat-msg agent typing-bubble";
      typing.innerHTML =
        '<span class="chat-typing"><span></span><span></span><span></span></span>';
      messages.appendChild(typing);
    }

    // preserve scroll position unless we were near bottom
    if (nearBottom) {
      body.scrollTop = body.scrollHeight;
    } else {
      const newHeight = messages.scrollHeight;
      body.scrollTop = prevTop + (newHeight - prevHeight);
    }

    updateStartNewVisibility();
    renderSuggestions();
  }

  async function startIntroConversation(userPayload) {
    if (state.hasStarted || state.introInProgress) {
      return;
    }
    const openingTemplate = (state.starting || state.greeting || "").trim();
    const opening = renderRegistrationTemplate(openingTemplate, userPayload);

    state.introInProgress = true;
    state.hasStarted = true;
    updateInputAvailability();
    try {
      const intro = opening || t("fallback");
      state.typing = true;
      renderMessages();
      await wait(700);
      state.typing = false;

      const chars = Array.from(intro);
      const firstChar = chars.shift() || "";
      state.conversation.push({role: "assistant", content: firstChar});
      renderMessages();

      const introIndex = state.conversation.length - 1;
      for (const char of chars) {
        if (!state.introInProgress) return;
        state.conversation[introIndex].content += char;
        renderMessages();
        await wait(introCharacterDelay(char));
      }

      persistConversation([{role: "assistant", content: intro}]);
    } finally {
      state.introInProgress = false;
      state.typing = false;
      renderMessages();
      updateInputAvailability();
    }
  }

  function scrollToBottom(smooth = true) {
    const behavior = smooth ? "smooth" : "auto";
    requestAnimationFrame(() => {
      body.scrollTo({top: body.scrollHeight, behavior});
    });
  }

  function createAssistantTypewriter() {
    const runId = ++state.typewriterRunId;
    const reducedMotion = reducedMotionEnabled();
    let message = null;
    let messageIndex = null;
    let pendingChars = [];
    let fullText = "";
    let finished = false;
    let pumpPromise = null;
    let wakePump = null;

    function wake() {
      if (!wakePump) return;
      const resolve = wakePump;
      wakePump = null;
      resolve();
    }

    function waitForMoreText() {
      return new Promise(function (resolve) {
        wakePump = resolve;
      });
    }

    function ensureMessage() {
      if (message) return;
      state.typing = false;
      state.typewriting = !reducedMotion;
      message = {
        role: "assistant",
        content: "",
        typewriting: !reducedMotion,
      };
      state.conversation.push(message);
      messageIndex = state.conversation.length - 1;
      updateInputAvailability();
    }

    async function pump() {
      try {
        while (!finished || pendingChars.length > 0) {
          if (state.typewriterRunId !== runId) return messageIndex;
          if (pendingChars.length === 0) {
            await waitForMoreText();
            continue;
          }

          ensureMessage();
          const batchSize = assistantTypewriterBatchSize(fullText.length);
          const batch = pendingChars.splice(0, batchSize).join("");
          if (!batch) continue;

          message.content += batch;
          renderMessages();

          const lastChar = Array.from(batch).pop() || "";
          await wait(assistantCharacterDelay(lastChar));
        }

        if (message) {
          message.content = fullText;
          delete message.typewriting;
        }
        return messageIndex;
      } finally {
        if (state.typewriterRunId === runId) {
          state.typewriting = false;
        }
        if (message) {
          delete message.typewriting;
        }
        renderMessages();
        updateInputAvailability();
      }
    }

    function startPump() {
      if (!pumpPromise && !reducedMotion) {
        state.typewriting = true;
        updateInputAvailability();
        pumpPromise = pump();
      }
      return pumpPromise;
    }

    function append(text) {
      const chunk = String(text || "");
      if (!chunk) return;
      fullText += chunk;

      if (reducedMotion) {
        ensureMessage();
        message.content = fullText;
        renderMessages();
        return;
      }

      pendingChars = pendingChars.concat(Array.from(chunk));
      startPump();
      wake();
    }

    function finish(fallbackText) {
      if (!fullText && fallbackText) {
        append(fallbackText);
      }
      finished = true;

      if (reducedMotion) {
        if (fullText) {
          ensureMessage();
          message.content = fullText;
          delete message.typewriting;
        }
        state.typewriting = false;
        renderMessages();
        updateInputAvailability();
        return Promise.resolve(messageIndex);
      }

      if (!pumpPromise) startPump();
      wake();
      return pumpPromise || Promise.resolve(messageIndex);
    }

    return {
      append,
      finish,
      getContent: function () {
        return fullText;
      },
    };
  }

  async function addAssistantMessage(content) {
    const writer = createAssistantTypewriter();
    writer.append(content);
    return writer.finish();
  }

  function mapMessages(entries) {
    return entries.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      message: m.content,
    }));
  }

  function escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeUrl(url) {
    const trimmed = (url || "").trim();
    if (/^mailto:/i.test(trimmed)) {
      const rawAddress = trimmed
        .replace(/^mailto:/i, "")
        .split("?")[0]
        .trim();
      let address = rawAddress;
      try {
        address = decodeURIComponent(rawAddress);
      } catch (_) {
        address = rawAddress;
      }
      if (/^[^@\s"'<>]+@[^@\s"'<>]+\.[^@\s"'<>]+$/.test(address)) {
        return "mailto:" + encodeURIComponent(address);
      }
      return "";
    }

    // quick reject for common injection patterns
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(trimmed)) return "";
    try {
      const parsed = new URL(trimmed, window.location.origin);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
      return "";
    } catch (e) {
      return "";
    }
  }

  function formatMarkdown(text) {
    if (!text) return "";
    // pull out fenced code blocks first so we don't run inline replacements on them
    const codeBlocks = [];
    let working = text.replace(/```([\s\S]*?)```/g, function (_match, code) {
      const token = "__CODE_BLOCK_" + codeBlocks.length + "__";
      codeBlocks.push(code || "");
      return token;
    });

    // escape everything up-front
    working = escapeHtml(working);

    // inline code
    working = working.replace(/`([^`]+?)`/g, "<code>$1</code>");

    // bold and italic (keep simple, already escaped)
    working = working.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    working = working.replace(
      /(^|[^*])\*([^*]+)\*(?=[^*]|$)/g,
      "$1<em>$2</em>",
    );

    // markdown links [text](url)
    working = working.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      function (_m, label, url) {
        const safe = safeUrl(url);
        if (!safe) return label;
        return (
          '<a href="' +
          safe +
          '" target="_blank" rel="noopener noreferrer">' +
          label +
          "</a>"
        );
      },
    );

    // auto-link plain URLs, but only in text (not inside tags)
    function autoLinkSegments(html) {
      return html
        .split(/(<[^>]+>)/g)
        .map(function (segment, idx) {
          if (idx % 2 === 1) return segment; // inside a tag
          return segment.replace(
            /(https?:\/\/[^\s<>"']+)/g,
            function (_m, url) {
              const safe = safeUrl(url);
              if (!safe) return url;
              return (
                '<a href="' +
                safe +
                '" target="_blank" rel="noopener noreferrer">' +
                safe +
                "</a>"
              );
            },
          );
        })
        .join("");
    }
    working = autoLinkSegments(working);

    // bullet lists (- or *) per line
    function convertLists(str) {
      const lines = str.split("\n");
      const out = [];
      let inList = false;
      lines.forEach(function (line) {
        const match = line.match(/^\s*[-*]\s+(.+)/);
        if (match) {
          if (!inList) {
            out.push("<ul>");
            inList = true;
          }
          out.push("<li>" + match[1] + "</li>");
        } else {
          if (inList) {
            out.push("</ul>");
            inList = false;
          }
          out.push(line);
        }
      });
      if (inList) out.push("</ul>");
      return out.join("\n");
    }
    working = convertLists(working);

    // line breaks
    working = working.replace(/\n/g, "<br>");

    // restore fenced code blocks
    codeBlocks.forEach(function (code, idx) {
      const escaped = escapeHtml(code);
      working = working.replace(
        "__CODE_BLOCK_" + idx + "__",
        "<pre><code>" + escaped + "</code></pre>",
      );
    });

    return working;
  }

  async function persistConversation(newEntries) {
    try {
      if (!Array.isArray(newEntries) || newEntries.length === 0) return;
      const payload = {
        metadata: {
          lang: state.lang,
        },
        source: "widget",
      };
      const userPayload = getRegistrationUserPayload();
      if (userPayload) payload.user = userPayload;
      console.log("[chat-widget] persistConversation payload", {
        hasConversationId: Boolean(state.conversationId),
        conversationLength: Array.isArray(payload.conversation)
          ? payload.conversation.length
          : undefined,
        user: payload.user,
        metadata: payload.metadata,
      });
      if (state.conversationId) {
        payload.conversation_id = state.conversationId;
        payload.conversation = mapMessages(newEntries);
        await fetch(host + "/api/agents/conversations/update", {
          method: "PUT",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(payload),
        });
      } else {
        payload.agent = state.name || "Michaela";
        payload.conversation = mapMessages(newEntries);
        const resp = await fetch(host + "/api/agents/conversations/create", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => ({}));
        if (data && data.data && data.data.conversation_id) {
          state.conversationId = data.data.conversation_id;
          saveConversationCookie();
        }
      }
    } catch (e) {
      console.warn("[chat-widget] conversation log failed", e?.message || e);
    }
  }

  function toggleModal(open) {
    state.open = open;
    if (mode === "embedded") {
      modal.classList.add("active");
      return;
    }
    modal.classList.toggle("active", open);
    if (mode === "modal") {
      if (state.toastTimer) {
        clearTimeout(state.toastTimer);
        state.toastTimer = null;
      }
      toast.classList.remove("visible");
      state.toastShown = true;
    }
    if (open) {
      scrollToBottom(true);
      focusCurrentWidgetTarget();
    }
  }

  let nudgeTimer = null;
  let nudgeResetTimer = null;

  function clearLauncherNudgeTimers() {
    if (nudgeTimer) {
      clearTimeout(nudgeTimer);
      nudgeTimer = null;
    }
    if (nudgeResetTimer) {
      clearTimeout(nudgeResetTimer);
      nudgeResetTimer = null;
    }
  }

  function triggerLauncherNudge() {
    if (mode !== "modal" || state.open) return;
    launcher.classList.add("nudge");
    nudgeResetTimer = setTimeout(function () {
      launcher.classList.remove("nudge");
    }, 2200);
    scheduleLauncherNudge();
  }

  function scheduleLauncherNudge() {
    clearLauncherNudgeTimers();
    if (mode !== "modal" || state.open) return;
    const delay = 16000 + Math.random() * 18000; // 16-34s to feel natural
    nudgeTimer = setTimeout(triggerLauncherNudge, delay);
  }

  function showToast() {
    if (mode !== "modal") return;
    if (state.toastShown || state.open) return;
    state.toastShown = true;
    toastText.textContent = state.greeting;
    state.toastTimer = setTimeout(function () {
      toast.classList.add("visible");
      state.toastTimer = setTimeout(function () {
        toast.classList.remove("visible");
      }, 10200);
    }, 1800);
  }

  function parseAgent(agentData) {
    if (!agentData) return;
    state.agent = agentData;
    const chatbot = agentData.chatbot || {};
    const resolvedName =
      chatbot.name || ds.agentName || agentData.agent?.name || "Michaela";
    state.name = resolvedName;
    state.colors = {
      primary: chatbot.primary_color || ds.primaryColor || state.colors.primary,
      secondary:
        chatbot.secondary_color || ds.secondaryColor || state.colors.secondary,
      button:
        chatbot.button_color ||
        chatbot.button_background_color ||
        ds.buttonColor ||
        state.colors.button ||
        "#6e26f5",
    };
    state.avatar = resolveWidgetAssetUrl(
      chatbot.avatar || ds.avatar || state.avatar,
    );
    state.greeting =
      pickLocalized(chatbot.greeting, state.lang) ||
      chatbot.greeting ||
      ds.greeting ||
      state.greeting;
    state.starting =
      pickLocalized(chatbot.starting_message, state.lang) ||
      chatbot.starting_message ||
      ds.startingMessage ||
      state.starting;
    state.registration = normalizeRegistrationConfig(
      agentData.settings?.registration || chatbot.registration,
    );
    state.mapboxToken = String(agentData.settings?.mapboxToken || "").trim();
    const serverTracking = {
      countryCode: String(agentData.tracking?.countryCode || "")
        .trim()
        .toUpperCase(),
      latitude: agentData.tracking?.latitude || "",
      longitude: agentData.tracking?.longitude || "",
    };
    state.tracking = {
      countryCode: state.tracking.countryCode || serverTracking.countryCode,
      latitude: state.tracking.latitude || serverTracking.latitude,
      longitude: state.tracking.longitude || serverTracking.longitude,
      source:
        state.tracking.source ||
        (serverTracking.latitude && serverTracking.longitude ? "server" : ""),
    };
    if (!registrationEnabled() || !registrationHasVisibleFields()) {
      state.registrationCompleted = true;
    } else if (
      registrationHasRequiredFields() &&
      registrationRequiredFieldsComplete()
    ) {
      state.registrationCompleted = true;
    }

    updateAvatarMediaAll(state.avatar, state.name);
    headerName.textContent = state.name || "Michaela";
    setColors();
    renderRegistrationFields();
    toggleUserOverlay();
    saveConversationCookie();
  }

  function setLoading(isLoading) {
    state.sending = isLoading;
    updateInputAvailability();
  }

  async function sendMessage(text) {
    if (!text) return;
    if (needsUserDetails()) {
      toggleUserOverlay(t("registrationRequired"), true);
      return;
    }
    if (!state.hasStarted) state.hasStarted = true;
    // Show the pending assistant state while the request is still opening.
    state.conversation.push({role: "user", content: text});
    state.typing = true;
    renderMessages();
    setLoading(true);
    try {
      const userPayload = getRegistrationUserPayload();
      const streamPayload = {
        lang: state.lang,
        source: "widget",
        messages: state.conversation.map(function (m) {
          return {
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          };
        }),
      };
      if (state.conversationId) {
        streamPayload.conversation_id = state.conversationId;
      }
      if (userPayload) {
        streamPayload.user = userPayload;
      }

      const res = await fetch(host + "/api/agents/chat/stream", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(streamPayload),
      });

      if (!res.ok || !res.body || !res.body.getReader) {
        const data = await res.json().catch(() => ({}));
        const reply =
          data?.data?.choices?.[0]?.message?.content ||
          data?.choices?.[0]?.message?.content ||
          data?.data?.message ||
          data?.message ||
          t("fallback");
        state.typing = false;
        await addAssistantMessage(reply);
        persistConversation([
          {role: "user", content: text},
          {role: "assistant", content: reply},
        ]);
        return;
      }

      // Streamed response
      let buffer = "";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let streamDone = false;
      const assistantWriter = createAssistantTypewriter();

      function commitChunk(chunkText) {
        if (!chunkText) return;
        state.typing = false;
        assistantWriter.append(chunkText);
      }

      // Keep showing typing until the first token arrives.
      if (!state.typing) {
        state.typing = true;
        renderMessages();
      }

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        parts.forEach((part) => {
          const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) return;
          const payload = dataLine.replace(/^data:\s*/, "");
          if (payload === "[DONE]") {
            streamDone = true;
            return;
          }
          try {
            const parsed = JSON.parse(payload);
            const delta =
              parsed?.choices?.[0]?.delta?.content ||
              parsed?.choices?.[0]?.message?.content ||
              "";
            commitChunk(delta);
          } catch (_) {
            commitChunk(payload);
          }
        });
        if (streamDone) break;
      }

      state.typing = false;
      await assistantWriter.finish(t("fallback"));

      // Persist conversation (user + assistant reply)
      persistConversation([
        {role: "user", content: text},
        {
          role: "assistant",
          content: assistantWriter.getContent() || t("fallback"),
        },
      ]);
    } catch (e) {
      state.typing = false;
      await addAssistantMessage(t("error"));
    } finally {
      setLoading(false);
    }
  }

  if (mode === "modal") {
    launcher.addEventListener("click", function () {
      toggleModal(!state.open);
      if (state.open) {
        clearLauncherNudgeTimers();
      } else {
        scheduleLauncherNudge();
      }
    });

    closeBtn.addEventListener("click", function () {
      toggleModal(false);
      scheduleLauncherNudge();
    });
  } else {
    // embedded: modal is always active
    modal.classList.add("active");
  }

  clearLink.addEventListener("click", function () {
    startNewConversationFlow();
  });

  promptToggleBtn.addEventListener("click", function () {
    if (promptToggleBtn.disabled) return;
    state.promptsOpen = !state.promptsOpen;
    renderSuggestions();
  });

  userForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const nextUser = {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      company: "",
      address: "",
      address_line1: "",
      address_line2: "",
      city: "",
      region: "",
      postal_code: "",
      country: "",
      address_latitude: state.user.address_latitude || "",
      address_longitude: state.user.address_longitude || "",
      address_country_code: state.user.address_country_code || "",
      full_address: state.user.full_address || "",
    };
    const errors = [];

    visibleRegistrationFields().forEach(function (definition) {
      const fieldConfig = getRegistrationFieldConfig(definition);
      const value = userFields[definition.key].field.value.trim();
      nextUser[definition.key] = value;

      if (fieldConfig.required && !value) {
        errors.push(t(definition.requiredKey));
      }
    });

    const emailVisible = visibleRegistrationFields().some(
      function (definition) {
        return definition.key === "email";
      },
    );
    const email = String(nextUser.email || "").trim();
    if (emailVisible && email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push(t("emailInvalid"));
    }

    if (errors.length > 0) {
      userError.textContent = errors.join(" ");
      return;
    }

    state.user = nextUser;
    state.registrationCompleted = true;
    userError.textContent = "";
    toggleUserOverlay();
    saveConversationCookie();
    const userPayload = getRegistrationUserPayload();
    startIntroConversation(userPayload || {});
    focusWithoutPageScroll(input);
  });

  inputRow.addEventListener("submit", function (e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || state.sending) return;
    input.value = "";
    sendMessage(text);
  });

  if (mode === "modal") {
    toast.addEventListener("click", function () {
      toggleModal(true);
      toast.classList.remove("visible");
    });

    toastClose.addEventListener("click", function (e) {
      e.stopPropagation();
      toast.classList.remove("visible");
    });
  }

  async function fetchAgentDetails() {
    const detailsUrl = host + "/api/agents/details";
    console.log("Fetching Agent Details from ", detailsUrl);

    try {
      const res = await fetch(detailsUrl);
      if (!res.ok) {
        console.warn("Agent details request failed", res.status);
        return null;
      }
      try {
        const json = await res.json();
        console.log("Response from Fetching Agent -> ", json);
        return json?.data || null;
      } catch (e) {
        console.warn("Failed to parse agent details response", e);
        return null;
      }
    } catch (err) {
      console.warn("Agent details fetch error", err);
      return null;
    }
  }

  async function waitForWidgetData(promises) {
    await Promise.all(
      promises.map(function (promise) {
        return Promise.resolve(promise).catch(function () {});
      }),
    );
  }

  async function init() {
    // reload previous conversation from cookie then server if available
    const dsLangRaw = (ds.lang || "").trim();
    const dsLangLower = dsLangRaw.toLowerCase();
    const dsLangIsBrowser = !dsLangRaw || dsLangLower === "browser";

    // Do not let cookie override chosen language; always restore only id/user
    loadConversationCookie(false);

    // If script provided a lang, override whatever we loaded from cookie
    if (!dsLangIsBrowser) {
      const normalized = dsLangLower.slice(0, 2);
      state.lang = normalized || state.lang;
    }

    const translationsPromise = loadExternalTranslations(state.lang).then(
      applyTranslations,
    );
    const phonePlaceholderPromise = setPhonePlaceholder();
    const defaultQuestionsPromise = loadDefaultQuestions();
    const conversationPromise = loadConversationFromServer();
    const agentData = await fetchAgentDetails();

    if (agentData) {
      parseAgent(agentData);
    } else {
      updateAvatarMediaAll(state.avatar, state.name || "Michaela");
      headerName.textContent = state.name || "Michaela";
      setColors();
      renderRegistrationFields();
      toggleUserOverlay();
      saveConversationCookie();
    }

    await waitForWidgetData([
      translationsPromise,
      phonePlaceholderPromise,
      defaultQuestionsPromise,
      conversationPromise,
    ]);

    mountWidgetShell();

    if (mode === "modal") {
      showToast();
      if (openOnLoad) toggleModal(true);
    }

    scheduleLauncherNudge();
  }

  init();
})();
