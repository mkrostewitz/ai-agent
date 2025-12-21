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
  // Apply initial defaults so the widget is colored even before agent fetch resolves
  setTimeout(setColors, 0);

  const ds = script.dataset || {};
  // console.log("DS Response -> ", ds);
  const dsLangRaw = (ds.lang || "").trim();
  const dsLangLower = dsLangRaw.toLowerCase();
  const useBrowserLang = !dsLangRaw || dsLangLower === "browser";
  const forcedLang = useBrowserLang ? null : dsLangLower.slice(0, 2);
  const rawLocale = useBrowserLang ? navigator.language || "en" : dsLangRaw;
  const resolvedLang = (forcedLang || rawLocale || "en").slice(0, 2).toLowerCase();

  const state = {
    agent: null,
    colors: {
      primary: "#A8C957",
      secondary: "#c6c1c1ff",
      button: "#A8C957",
    },
    lang: resolvedLang,
    name: ds.agentName || "",
    greeting: "Hi there, how can I help you?",
    starting: "",
    avatar: host + "/avatars/Michael_Intro.mp4",
    conversation: [],
    open: false,
    toastShown: false,
    toastTimer: null,
    sending: false,
    conversationId: null,
    typing: false,
    hasStarted: false,
    introInProgress: false,
    user: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
    },
  };

  const COOKIE_NAME = "chat_conversation";

  function saveConversationCookie() {
    try {
      const user = sanitizeUserPayload(state.user);
      const payload = {
        id: state.conversationId || null,
        lang: state.lang,
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
      if (parsed?.user) state.user = {...state.user, ...parsed.user};
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
            state.conversationId
          )}`
      );

      console.log("Conversations Response -> ", res);
      if (!res.ok) throw new Error(`details ${res.status}`);
      const data = await res.json();
      const convo = data?.data?.conversation;
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
            (item.language || item.lang).slice(0, 2).toLowerCase() === lang
        ) ||
        value.find(
          (item) =>
            item &&
            typeof item === "object" &&
            (item.language || item.lang || "").slice(0, 2).toLowerCase() ===
              "en"
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
      notConfigured: "This agent is not fully configured yet.",
      error: "Sorry, something went wrong. Please try again.",
      fallback: "I am here to help.",
      userTitle: "How can we reach you if we lose contact?",
      userSubtitle:
        "Share your details so we can follow up even if the chat is interrupted.",
      firstNameLabel: "First name",
      lastNameLabel: "Last name",
      emailLabel: "Email",
      phoneLabel: "Phone (optional)",
      startChat: "Start chat",
      firstNameRequired: "First name is required.",
      lastNameRequired: "Last name is required.",
      emailRequired: "Email is required.",
      emailInvalid: "Email must be valid.",
      blockedPlaceholder: "Enter your details to start chatting",
      startNewConversation: "Start new conversation",
    },
    de: {
      send: "Senden",
      placeholder: "Nachricht eingeben...",
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
      phoneLabel: "Telefon (optional)",
      startChat: "Chat starten",
      firstNameRequired: "Vorname ist erforderlich.",
      lastNameRequired: "Nachname ist erforderlich.",
      emailRequired: "E-Mail ist erforderlich.",
      emailInvalid: "E-Mail muss gültig sein.",
      blockedPlaceholder: "Details eingeben, um zu starten",
      startNewConversation: "Neue Konversation starten",
    },
    it: {
      send: "Invia",
      placeholder: "Scrivi il tuo messaggio...",
      notConfigured: "Questo agente non è ancora completamente configurato.",
      error: "Spiacente, si è verificato un errore. Riprova.",
      fallback: "Sono qui per aiutarti.",
      userTitle: "Come possiamo contattarti se perdiamo il contatto?",
      userSubtitle:
        "Condividi i tuoi dati così possiamo richiamarti se la chat si interrompe.",
      firstNameLabel: "Nome",
      lastNameLabel: "Cognome",
      emailLabel: "Email",
      phoneLabel: "Telefono (opzionale)",
      startChat: "Inizia chat",
      firstNameRequired: "Il nome è obbligatorio.",
      lastNameRequired: "Il cognome è obbligatorio.",
      emailRequired: "L'email è obbligatoria.",
      emailInvalid: "L'email deve essere valida.",
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
      const res = await fetch(`/locales/${lang}/translation.json`);
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
    clearLink.textContent = t("startNewConversation");
    userTitle.textContent = t("userTitle");
    userSubtitle.textContent = t("userSubtitle");
    firstField.wrapper.querySelector("span").textContent = t("firstNameLabel");
    lastField.wrapper.querySelector("span").textContent = t("lastNameLabel");
    emailField.wrapper.querySelector("span").textContent = t("emailLabel");
    phoneField.wrapper.querySelector("span").textContent = t("phoneLabel");
    submitUser.textContent = t("startChat");
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
        (entry) => (entry.code || "").toUpperCase() === region && entry.dialCode
      );
    }

    if (!match && language) {
      match = countryData.find(
        (entry) =>
          (entry.code || "").toLowerCase() === language && entry.dialCode
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

  function createAvatarMedia(src, alt, options) {
    const opts = Object.assign({autoplayVideo: true}, options);
    const isVideo = isVideoAvatar(src);
    const media = document.createElement(isVideo ? "video" : "img");
    media.src = src;
    if (isVideo) {
      media.muted = true;
      media.autoplay = Boolean(opts.autoplayVideo);
      media.loop = Boolean(opts.autoplayVideo);
      media.playsInline = true;
      media.controls = false;
      media.setAttribute("aria-label", alt || "Chatbot");
      media.setAttribute("playsinline", "true");
      media.setAttribute("muted", "true");
      if (!opts.autoplayVideo) {
        media.preload = "metadata"; // load poster frame without playing
      }
      if (opts.autoplayVideo) {
        media.setAttribute("autoplay", "true");
        media.addEventListener("loadeddata", function () {
          if (typeof media.play === "function") {
            media.play().catch(function () {});
          }
        });
      }
    } else {
      media.alt = alt || "Chatbot";
    }
    return media;
  }

  function setAvatarMedia(container, src, alt, indicatorSelector, options) {
    const indicator =
      indicatorSelector && container.querySelector(indicatorSelector);
    const existing = container.querySelector("img, video");
    const media = createAvatarMedia(src, alt, options);
    if (existing) {
      container.replaceChild(media, existing);
    } else if (indicator && indicator.parentNode === container) {
      container.insertBefore(media, indicator);
    } else {
      container.appendChild(media);
    }
  }

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "chat-widget-launcher";

  const avatar = document.createElement("div");
  avatar.className = "chat-widget-avatar launcher-avatar";
  const onlineDot = document.createElement("span");
  onlineDot.className = "chat-widget-online";
  setAvatarMedia(avatar, state.avatar, state.name, ".chat-widget-online");
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
  setAvatarMedia(headerAvatar, state.avatar, state.name, ".chat-widget-online", {
    autoplayVideo: false,
  });
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
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = t("placeholder");
  const sendBtn = document.createElement("button");
  sendBtn.type = "submit";
  sendBtn.textContent = t("send");
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);

  input.addEventListener("input", updateInputAvailability);

  const clearLink = document.createElement("div");
  clearLink.className = "chat-widget-clear-link";
  clearLink.textContent = t("startNewConversation");
  clearLink.style.display = "none";

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(inputRow);
  modal.appendChild(clearLink);

  const toast = document.createElement("div");
  toast.className = "chat-toast";
  const toastAvatar = document.createElement("div");
  toastAvatar.className = "toast-avatar";
  const toastOnline = document.createElement("span");
  toastOnline.className = "toast-online";
  setAvatarMedia(toastAvatar, state.avatar, state.name, ".toast-online", {
    autoplayVideo: false,
  });
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
    const alt = altText || "Chatbot";
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

  function buildUserField(
    labelText,
    type,
    name,
    placeholder,
    required = false
  ) {
    const wrapper = document.createElement("label");
    wrapper.className = "chat-user-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const field = document.createElement("input");
    field.type = type;
    field.name = name;
    field.placeholder = placeholder || "";
    field.autocomplete = "off";
    if (required) field.required = true;
    wrapper.appendChild(label);
    wrapper.appendChild(field);
    return {wrapper, field};
  }

  const userForm = document.createElement("form");
  userForm.className = "chat-user-form";
  const firstField = buildUserField(
    t("firstNameLabel"),
    "text",
    "first_name",
    "Jane",
    true
  );
  const lastField = buildUserField(
    t("lastNameLabel"),
    "text",
    "last_name",
    "Doe",
    true
  );
  const emailField = buildUserField(
    t("emailLabel"),
    "email",
    "email",
    "jane.doe@email.com",
    true
  );
  const defaultPhonePlaceholder = formatDialPlaceholder(null);
  const phoneField = buildUserField(
    t("phoneLabel"),
    "tel",
    "phone",
    defaultPhonePlaceholder
  );
  const userError = document.createElement("div");
  userError.className = "chat-user-error";
  const submitUser = document.createElement("button");
  submitUser.type = "submit";
  submitUser.textContent = t("startChat");

  emailField.wrapper.classList.add("full-span");
  phoneField.wrapper.classList.add("full-span");
  userError.classList.add("full-span");
  submitUser.classList.add("full-span");

  userForm.appendChild(firstField.wrapper);
  userForm.appendChild(lastField.wrapper);
  userForm.appendChild(emailField.wrapper);
  userForm.appendChild(phoneField.wrapper);
  userForm.appendChild(userError);
  userForm.appendChild(submitUser);

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
  attachTarget.appendChild(shell);

  function sanitizeUserPayload(rawUser) {
    if (!rawUser) return null;
    const payload = {
      first_name: (rawUser.first_name || "").trim(),
      last_name: (rawUser.last_name || "").trim(),
      email: (rawUser.email || "").trim(),
      phone: (rawUser.phone || "").trim(),
    };
    const hasData = Object.values(payload).some(Boolean);
    return hasData ? payload : null;
  }

  function updateStartNewVisibility() {
    const show = state.conversation.length > 1;
    clearLink.style.display = show ? "block" : "none";
    clearLink.classList.toggle("disabled", state.typing);
  }

  function startNewConversationFlow() {
    if (state.typing) return;
    const userPayload = sanitizeUserPayload(state.user);
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
      toggleUserOverlay();
    }
  }

  function needsUserDetails() {
    if (state.conversationId) return false;
    return !state.user.first_name || !state.user.last_name || !state.user.email;
  }

  function updateInputAvailability() {
    const blocked = needsUserDetails();
    input.disabled = blocked;
    const emptyMessage = !input.value.trim();
    sendBtn.disabled = blocked || state.sending || emptyMessage;
    inputRow.classList.toggle("hidden", blocked);
    input.placeholder = blocked ? t("blockedPlaceholder") : t("placeholder");
  }

  function toggleUserOverlay(message) {
    const shouldShow = needsUserDetails();
    userOverlay.classList.toggle("hidden", !shouldShow);
    if (shouldShow) {
      firstField.field.value = state.user.first_name || "";
      lastField.field.value = state.user.last_name || "";
      emailField.field.value = state.user.email || "";
      phoneField.field.value = state.user.phone || "";
      userError.textContent = message || "";
      firstField.field.focus();
    } else {
      userError.textContent = "";
    }
    updateInputAvailability();
  }

  async function setPhonePlaceholder() {
    try {
      const dial = await deriveDialCode(rawLocale);
      if (!dial) return;
      phoneField.field.placeholder = formatDialPlaceholder(dial);
    } catch (_) {
      // ignore placeholder failures
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
  }

  async function startIntroConversation(userPayload) {
    if (state.hasStarted || state.introInProgress || !userPayload) {
      return;
    }
    const composedName = [userPayload.first_name, userPayload.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    const introSystemMessage = [
      "You are the assistant for this chat.",
      composedName ? `Visitor name: ${composedName}` : null,
      userPayload.email ? `Visitor email: ${userPayload.email}` : null,
      userPayload.phone ? `Visitor phone: ${userPayload.phone}` : null,
      "Greet the visitor warmly, keep it short and friendly.",
    ]
      .filter(Boolean)
      .join("\n");

    const introUserPrompt = [
      "Please greet the visitor by their first name",
      composedName ? `(${composedName})` : "",
      "in their language and ask how you can help.",
    ]
      .filter(Boolean)
      .join(" ");

    state.introInProgress = true;
    state.typing = true;
    renderMessages();

    let assistantIndex = null;
    let gotChunk = false;
    let buffer = "";
    const decoder = new TextDecoder();

    function commitChunk(chunkText) {
      if (!chunkText) return;
      if (!gotChunk) {
        gotChunk = true;
        state.typing = false;
      }
      if (assistantIndex === null) {
        state.conversation.push({role: "assistant", content: chunkText});
        assistantIndex = state.conversation.length - 1;
      } else {
        state.conversation[assistantIndex].content += chunkText;
      }
      renderMessages();
    }

    try {
      console.log("[chat-widget] starting intro conversation");
      const res = await fetch(host + "/api/agents/chat/stream", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: introSystemMessage,
            },
            {
              role: "user",
              content: introUserPrompt,
            },
          ],
        }),
      });

      if (!res.ok || !res.body || !res.body.getReader) {
        const data = await res.json().catch(() => ({}));
        const reply =
          data?.data?.choices?.[0]?.message?.content ||
          data?.choices?.[0]?.message?.content ||
          data?.data?.message ||
          data?.message ||
          t("fallback");
        commitChunk(reply);
      } else {
        const reader = res.body.getReader();
        let streamDone = false;

        state.typing = true;
        renderMessages();

        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, {stream: true});
          const parts = buffer.split("\n\n");
          buffer = parts.pop();
          parts.forEach((part) => {
            const dataLine = part
              .split("\n")
              .find((l) => l.startsWith("data:"));
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
      }

      state.typing = false;
      renderMessages();
      if (!gotChunk) {
        state.conversation.push({role: "assistant", content: t("fallback")});
        assistantIndex = state.conversation.length - 1;
        renderMessages();
      }
      state.hasStarted = true;
      if (assistantIndex !== null) {
        persistConversation([
          {
            role: "assistant",
            content: state.conversation[assistantIndex].content,
          },
        ]);
      }
    } catch (e) {
      state.typing = false;
      renderMessages();
    } finally {
      state.introInProgress = false;
      updateInputAvailability();
    }
  }

  function scrollToBottom(smooth = true) {
    const behavior = smooth ? "smooth" : "auto";
    requestAnimationFrame(() => {
      body.scrollTo({top: body.scrollHeight, behavior});
    });
  }

  function addMessage(role, content) {
    state.conversation.push({role: role, content: content});
    renderMessages();
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
      "$1<em>$2</em>"
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
      }
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
            }
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
        "<pre><code>" + escaped + "</code></pre>"
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
      const userPayload = sanitizeUserPayload(state.user);
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
        payload.agent = state.name || "Chatbot";
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
      chatbot.name || ds.agentName || agentData.agent?.name || "Chatbot";
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
        "#A8C957",
    };
    state.avatar = chatbot.avatar || ds.avatar || state.avatar;
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

    updateAvatarMediaAll(state.avatar, state.name);
    headerName.textContent = state.name || "Chatbot";
    setColors();
    saveConversationCookie();
  }

  function setLoading(isLoading) {
    state.sending = isLoading;
    updateInputAvailability();
  }

  async function sendMessage(text) {
    if (!text) return;
    if (needsUserDetails()) {
      toggleUserOverlay("Please add your name and email to start chatting.");
      return;
    }
    if (!state.hasStarted) state.hasStarted = true;
    // user message first
    addMessage("user", text);
    setLoading(true);
    try {
      const res = await fetch(host + "/api/agents/chat/stream", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          messages: state.conversation.map(function (m) {
            return {
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            };
          }),
        }),
      });

      if (!res.ok || !res.body || !res.body.getReader) {
        const data = await res.json().catch(() => ({}));
        const reply =
          data?.data?.choices?.[0]?.message?.content ||
          data?.choices?.[0]?.message?.content ||
          data?.data?.message ||
          data?.message ||
          t("fallback");
        addMessage("assistant", reply);
        state.typing = false;
        renderMessages();
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
      let gotChunk = false;
      let assistantIndex = null;

      function commitChunk(chunkText) {
        if (!chunkText) return;
        if (!gotChunk) {
          gotChunk = true;
          state.typing = false;
        }
        if (assistantIndex === null) {
          state.conversation.push({role: "assistant", content: chunkText});
          assistantIndex = state.conversation.length - 1;
        } else {
          state.conversation[assistantIndex].content += chunkText;
        }
        renderMessages();
      }

      // show typing until first token arrives
      state.typing = true;
      renderMessages();

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
      renderMessages();
      if (!gotChunk && state.conversation.length > 0) {
        // fallback: ensure we have at least an assistant message
        state.conversation.push({role: "assistant", content: t("fallback")});
        assistantIndex = state.conversation.length - 1;
        renderMessages();
      }
      // Persist conversation (user + assistant reply)
      persistConversation([
        {role: "user", content: text},
        {
          role: "assistant",
          content:
            assistantIndex !== null
              ? state.conversation[assistantIndex]?.content || ""
              : state.conversation[state.conversation.length - 1]?.content ||
                "",
        },
      ]);
    } catch (e) {
      addMessage("assistant", t("error"));
      state.typing = false;
      renderMessages();
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

  userForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const first = firstField.field.value.trim();
    const last = lastField.field.value.trim();
    const email = emailField.field.value.trim();
    const phone = phoneField.field.value.trim();

    const errors = [];
    if (!first) errors.push(t("firstNameRequired"));
    if (!last) errors.push(t("lastNameRequired"));
    if (!email) {
      errors.push(t("emailRequired"));
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push(t("emailInvalid"));
    }

    if (errors.length > 0) {
      userError.textContent = errors.join(" ");
      return;
    }

    state.user = {
      first_name: first,
      last_name: last,
      email,
      phone,
    };
    userError.textContent = "";
    toggleUserOverlay();
    saveConversationCookie();
    const userPayload = sanitizeUserPayload(state.user);
    startIntroConversation(userPayload);
    input.focus();
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

  function init() {
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

    loadExternalTranslations(state.lang).then(applyTranslations);
    toggleUserOverlay();
    setPhonePlaceholder();
    loadConversationFromServer();

    const detailsUrl = host + "/api/agents/details";
    console.log("Fetching Agent Details from ", detailsUrl);

    fetch(detailsUrl)
      .then(async function (res) {
        if (!res.ok) {
          console.warn("Agent details request failed", res.status);
          return null;
        }
        try {
          const json = await res.json();
          console.log("Response from Fetching Agent -> ", json);
          return json;
        } catch (e) {
          console.warn("Failed to parse agent details response", e);
          return null;
        }
      })
      .then(function (resp) {
        if (resp && resp.data) {
          parseAgent(resp.data);
          if (mode === "modal") {
            showToast();
            if (openOnLoad) toggleModal(true);
          }
        } else if (mode === "modal") {
          showToast();
        }
      })
      .catch(function (err) {
        console.warn("Agent details fetch error", err);
        if (mode === "modal") showToast();
      });

    scheduleLauncherNudge();
  }

  setColors();
  init();
})();
