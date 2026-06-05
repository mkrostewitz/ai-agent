"use client";

import mapboxgl from "mapbox-gl";
import {useEffect, useMemo, useRef, useState} from "react";
import {
  FiCheck,
  FiChevronDown,
  FiCode,
  FiCopy,
  FiCpu,
  FiDatabase,
  FiExternalLink,
  FiHelpCircle,
  FiMessageSquare,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSend,
  FiSettings,
  FiTrash2,
  FiUpload,
  FiUser,
  FiX,
} from "react-icons/fi";

import AdminHeader from "./AdminHeader";
import styles from "./admin.module.css";

const TABS = [
  {id: "profile", label: "Agent", Icon: FiUser},
  {id: "settings", label: "Settings", Icon: FiSettings},
  {id: "knowledge", label: "Knowledge", Icon: FiDatabase},
  {id: "conversations", label: "Conversations", Icon: FiMessageSquare},
];

const AVATAR_OPTIONS = [
  "/avatars/Emily_Intro.mp4",
  "/avatars/John_Intro.mp4",
  "/avatars/Julia_Intro.mp4",
  "/avatars/Michael_Intro.mp4",
  "/avatars/Michelle_Intro.mp4",
  "/avatars/Olivia_Intro.mp4",
  "/avatars/Sarah_Intro.mp4",
];

const LANGUAGES = [
  {code: "en", label: "English"},
  {code: "de", label: "German"},
  {code: "it", label: "Italian"},
];

const EMBED_MODE_OPTIONS = [
  {id: "modal", label: "Launcher"},
  {id: "embedded", label: "Inline"},
];

const EMBED_LANGUAGE_OPTIONS = [
  {value: "browser", label: "Browser language"},
  ...LANGUAGES.map((language) => ({
    value: language.code,
    label: language.label,
  })),
];

const DEFAULT_EMBED_HOST = "https://your-agent-domain.com";

const DEFAULT_SETTINGS = {
  instruction: "",
  model: "phi3:mini",
  namespace: "",
  response_language: "",
  retrieval_k: 6,
  temperature: 0.3,
  top_k: 40,
  top_p: 0.9,
  max_tokens: 2000,
};

const DEFAULT_SYSTEM = {
  ipGeolocationConfigured: false,
  ipGeolocationApiKeyPreview: "",
  ipGeolocationApiKey: "",
  clearIpGeolocationApiKey: false,
  mapboxConfigured: false,
  mapboxToken: "",
  mapboxTokenPreview: "",
  clearMapboxToken: false,
  mail: {
    provider: "apple",
    providerLabel: "Apple iCloud Mail",
    configured: false,
    enabled: true,
    active: false,
    host: "smtp.mail.me.com",
    port: 587,
    secure: false,
    requireTLS: true,
    timeoutMs: 10000,
    from: "",
    fromName: "Krostewitz AI Agent",
    recipients: [],
    replyTo: "",
    username: "",
    passwordConfigured: false,
    smtpPassword: "",
    clearSmtpPassword: false,
    source: "database",
    missing: [],
  },
};

const MAIL_PROVIDER_OPTIONS = [
  {value: "apple", label: "Apple iCloud Mail"},
  {value: "gmail", label: "Gmail"},
  {value: "microsoft", label: "Microsoft 365 / Outlook"},
  {value: "custom", label: "Custom SMTP"},
  {value: "disabled", label: "Disabled"},
];

const MAIL_PROVIDER_PRESETS = {
  apple: {
    host: "smtp.mail.me.com",
    port: 587,
    secure: false,
    requireTLS: true,
  },
  gmail: {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
  },
  microsoft: {
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    requireTLS: true,
  },
  custom: {
    host: "",
    port: 587,
    secure: false,
    requireTLS: true,
  },
  disabled: {
    host: "",
    port: 587,
    secure: false,
    requireTLS: true,
  },
};

const DEFAULT_AGENT = {
  name: "Chatbot",
  avatar: "/avatars/Michael_Intro.mp4",
  primary_color: "#6e26f5",
  secondary_color: "#0e273d",
  button_color: "#6e26f5",
  greeting: LANGUAGES.map(({code}) => ({lang: code, text: ""})),
  starting_message: LANGUAGES.map(({code}) => ({lang: code, text: ""})),
};

const CONVERSATION_STATUSES = [
  {value: "", label: "All"},
  {value: "open", label: "Open"},
  {value: "reviewing", label: "Reviewing"},
  {value: "qualified", label: "Qualified"},
  {value: "closed", label: "Closed"},
  {value: "spam", label: "Spam"},
];

const CONVERSATION_ACTION_TYPES = [
  {value: "follow_up", label: "Follow-up"},
  {value: "call", label: "Call"},
  {value: "email", label: "Email"},
  {value: "meeting", label: "Meeting"},
  {value: "qualification", label: "Qualification"},
  {value: "note", label: "Note"},
];

const CONVERSATION_STATUS_LABELS = Object.fromEntries(
  CONVERSATION_STATUSES.filter((status) => status.value).map((status) => [
    status.value,
    status.label,
  ])
);

const CONVERSATION_ACTION_TYPE_LABELS = Object.fromEntries(
  CONVERSATION_ACTION_TYPES.map((type) => [type.value, type.label])
);

function formatDateTime(value) {
  if (!value) return "Not available";

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function localizedValue(entries, lang) {
  if (!Array.isArray(entries)) return "";
  return entries.find((entry) => entry.lang === lang)?.text || "";
}

function setLocalizedValue(entries, lang, text) {
  const existing = Array.isArray(entries) ? entries : [];
  const withoutLang = existing.filter((entry) => entry.lang !== lang);
  return [...withoutLang, {lang, text}].sort((left, right) =>
    left.lang.localeCompare(right.lang)
  );
}

function createPromptDraft(prompt = {}) {
  const translations = {};
  LANGUAGES.forEach((language) => {
    translations[language.code] = String(
      prompt.translations?.[language.code] || ""
    );
  });

  return {
    clientId:
      prompt.clientId ||
      prompt.id ||
      `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    id: prompt.id || "",
    active: prompt.active !== false,
    translations,
  };
}

function promptLocalizedValue(prompt, lang) {
  return prompt?.translations?.[lang] || "";
}

function setPromptLocalizedValue(prompts, index, lang, text) {
  return prompts.map((prompt, promptIndex) =>
    promptIndex === index
      ? {
          ...prompt,
          translations: {
            ...(prompt.translations || {}),
            [lang]: text,
          },
        }
      : prompt
  );
}

function normalizeEmbedHost(value) {
  const host = String(value || "").trim().replace(/\/+$/, "");
  return host || DEFAULT_EMBED_HOST;
}

function buildEmbedScriptSnippet({host, language, mode}) {
  const attrs = [
    "async",
    `src="${normalizeEmbedHost(host)}/scripts/chat-widget.js"`,
  ];

  if (mode === "embedded") {
    attrs.push('data-mode="embedded"');
    attrs.push('data-mount="#agent-chat-widget"');
  }

  if (language && language !== "browser") {
    attrs.push(`data-lang="${language}"`);
  }

  return `<script ${attrs.join("\n  ")}>\n</script>`;
}

function buildEmbedSnippet({host, language, mode}) {
  const script = buildEmbedScriptSnippet({host, language, mode});

  if (mode !== "embedded") return script;

  return `<div id="agent-chat-widget"></div>\n${script}`;
}

function isVideoAvatar(value) {
  const src = String(value || "").trim();
  if (!src) return false;
  if (/^data:video\//i.test(src) || /^blob:/i.test(src)) return true;
  return /\.(mp4|webm|ogg|mov)([?#].*)?$/i.test(src);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : {"Content-Type": "application/json", ...(options.headers || {})},
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function normalizeMailDraft(mail = {}) {
  return {
    ...DEFAULT_SYSTEM.mail,
    ...(mail || {}),
    recipients: Array.isArray(mail?.recipients) ? mail.recipients : [],
    smtpPassword: String(mail?.smtpPassword || ""),
    clearSmtpPassword: Boolean(mail?.clearSmtpPassword),
  };
}

function recipientsToText(recipients) {
  return Array.isArray(recipients) ? recipients.join(", ") : "";
}

function textToRecipients(value) {
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSystemPayload(system = {}) {
  const payload = {};

  if (system.ipGeolocationApiKey?.trim()) {
    payload.ipGeolocationApiKey = system.ipGeolocationApiKey;
  } else if (system.clearIpGeolocationApiKey) {
    payload.clearIpGeolocationApiKey = true;
  }

  if (system.mapboxToken?.trim()) {
    payload.mapboxToken = system.mapboxToken;
  } else if (system.clearMapboxToken) {
    payload.clearMapboxToken = true;
  }

  payload.mail = normalizeMailDraft(system.mail);

  return payload;
}

function normalizeLocation(tracking = {}) {
  return (
    tracking.address ||
    [tracking.city, tracking.state, tracking.country].filter(Boolean).join(", ") ||
    tracking.countryCode ||
    "Unknown"
  );
}

function cleanText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function parseCoordinate(value, min, max) {
  const text = cleanText(value);
  if (!text) return null;

  const normalized = text.includes(".") ? text : text.replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;

  const coordinate = Number(normalized);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : null;
}

function getCoordinatePair(tracking = {}) {
  const latitude = parseCoordinate(tracking.latitude ?? tracking.lat, -90, 90);
  const longitude = parseCoordinate(
    tracking.longitude ?? tracking.lng ?? tracking.lon,
    -180,
    180
  );

  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) < 0.000001 && Math.abs(longitude) < 0.000001) {
    return null;
  }

  return {latitude, longitude};
}

function getConversationMapCoordinates(conversation) {
  const coordinates = getCoordinatePair(conversation?.tracking || {});
  return coordinates ? [coordinates.longitude, coordinates.latitude] : null;
}

function conversationTitle(conversation = {}) {
  return (
    conversation.user?.name ||
    conversation.user?.email ||
    conversation.conversation_id ||
    "Conversation"
  );
}

function conversationSourceLabel(conversation = {}) {
  const source = String(conversation.source || "widget").trim();
  if (source === "widget") return "Website chat";
  return source
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function conversationContactLine(conversation = {}) {
  const email = conversation.user?.email || "No email";
  const phone = conversation.user?.phone || "No phone";
  return `${email} - ${phone}`;
}

function conversationActions(conversation = {}) {
  return Array.isArray(conversation.actions) ? conversation.actions : [];
}

function actionTextPreview(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "No actions";
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function conversationActionsPreview(conversation) {
  const latestAction = conversationActions(conversation)[0];
  return latestAction ? actionTextPreview(latestAction.text) : "No actions";
}

function conversationActionTypeLabel(value) {
  return CONVERSATION_ACTION_TYPE_LABELS[value] || "Action";
}

function conversationActionsCountLabel(conversation) {
  const count = conversationActions(conversation).length;
  return `${count} action${count === 1 ? "" : "s"}`;
}

function conversationMessageCountLabel(conversation = {}) {
  const count = Number(conversation.messageCount || conversation.messages?.length || 0);
  return `${count} message${count === 1 ? "" : "s"}`;
}

function ConversationMap({
  activeConversationId,
  conversations,
  mapboxToken,
  onSelectConversation,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const token = String(mapboxToken || "").trim();
  const mappedConversations = useMemo(
    () =>
      conversations
        .map((conversation) => ({
          conversation,
          coordinates: getConversationMapCoordinates(conversation),
        }))
        .filter((item) => item.coordinates),
    [conversations]
  );
  const coordinatesKey = mappedConversations
    .map((item) => `${item.conversation.id}:${item.coordinates.join(",")}`)
    .join("|");

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current || mappedConversations.length === 0) {
      return undefined;
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      attributionControl: false,
      center: mappedConversations[0].coordinates,
      container: containerRef.current,
      pitch: 0,
      style: "mapbox://styles/mapbox/light-v11",
      zoom: mappedConversations.length === 1 ? 6 : 2,
    });

    map.addControl(
      new mapboxgl.AttributionControl({compact: true}),
      "bottom-right"
    );
    map.addControl(
      new mapboxgl.NavigationControl({showCompass: false}),
      "top-right"
    );

    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    map.on("load", () => {
      map.resize();
    });
    map.on("error", () => {
      console.warn("Unable to render conversation map.");
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [mappedConversations, token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = mappedConversations.map(({conversation, coordinates}) => {
      const isActive = conversation.id === activeConversationId;
      const marker = new mapboxgl.Marker({
        anchor: "bottom",
        color: isActive ? "#6e26f5" : "#253541",
        scale: isActive ? 0.9 : 0.78,
      })
        .setLngLat(coordinates)
        .addTo(map);
      const markerElement = marker.getElement();
      const selectConversation = () => onSelectConversation(conversation.id);

      markerElement.classList.add(styles.conversationMapMarker);
      if (isActive) {
        markerElement.classList.add(styles.conversationMapMarkerActive);
      }
      markerElement.title = conversationTitle(conversation);
      markerElement.tabIndex = 0;
      markerElement.setAttribute("role", "button");
      markerElement.setAttribute("aria-current", isActive ? "true" : "false");
      markerElement.setAttribute(
        "aria-label",
        `Open ${conversationTitle(conversation)}`
      );
      markerElement.addEventListener("click", selectConversation);
      markerElement.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;

        event.preventDefault();
        selectConversation();
      });

      return marker;
    });

    if (mappedConversations.length === 1) {
      map.easeTo({
        center: mappedConversations[0].coordinates,
        duration: 0,
        zoom: 6,
      });
    } else if (mappedConversations.length > 1) {
      const bounds = mappedConversations.reduce(
        (nextBounds, item) => nextBounds.extend(item.coordinates),
        new mapboxgl.LngLatBounds(
          mappedConversations[0].coordinates,
          mappedConversations[0].coordinates
        )
      );

      map.fitBounds(bounds, {duration: 0, maxZoom: 8, padding: 54});
    }

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [activeConversationId, coordinatesKey, mappedConversations, onSelectConversation]);

  useEffect(() => {
    const map = mapRef.current;
    const activeItem = mappedConversations.find(
      (item) => item.conversation.id === activeConversationId
    );

    if (!map || !activeItem) return;

    map.easeTo({
      center: activeItem.coordinates,
      duration: 350,
      zoom: Math.max(map.getZoom(), 5),
    });
  }, [activeConversationId, mappedConversations]);

  if (!token) {
    return (
      <div className={styles.conversationMapPlaceholder}>
        Map unavailable. Configure the Mapbox public token in Settings.
      </div>
    );
  }

  if (mappedConversations.length === 0) {
    return (
      <div className={styles.conversationMapPlaceholder}>
        No location coordinates are available for the current conversations.
      </div>
    );
  }

  return (
    <div className={styles.conversationMap} aria-label="Conversation locations">
      <div className={styles.conversationMapCanvas} ref={containerRef} />
      <div className={styles.conversationMapMeta}>
        <strong>{mappedConversations.length}</strong>
        <span>
          mapped location{mappedConversations.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function Toast({toast, onClose}) {
  if (!toast) return null;
  const toneClassName =
    toast.type === "error"
      ? styles.toastError
      : toast.type === "warning"
      ? styles.toastWarning
      : styles.toastSuccess;

  return (
    <button
      type="button"
      className={`${styles.toast} ${toneClassName}`}
      onClick={onClose}
    >
      {toast.message}
    </button>
  );
}

function SelectField({label, onChange, options, value}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedOption =
    options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!isOpen) return undefined;

    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isOpen]);

  function selectOption(nextValue) {
    onChange(nextValue);
    setIsOpen(false);
  }

  function handleButtonKeyDown(event) {
    if (["ArrowDown", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setIsOpen(true);
    }
    if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className={styles.field}>
      <span>{label}</span>
      <div className={styles.selectRoot} ref={rootRef}>
        <button
          type="button"
          className={`${styles.selectButton} ${
            isOpen ? styles.selectButtonOpen : ""
          }`}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onClick={() => setIsOpen((current) => !current)}
          onKeyDown={handleButtonKeyDown}
        >
          <span>{selectedOption?.label || "Select"}</span>
          <FiChevronDown aria-hidden="true" />
        </button>

        {isOpen ? (
          <div className={styles.selectMenu} role="listbox">
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value || "__empty"}
                  type="button"
                  className={`${styles.selectOption} ${
                    isSelected ? styles.selectOptionSelected : ""
                  }`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectOption(option.value)}
                >
                  <span className={styles.selectOptionCheck}>
                    {isSelected ? <FiCheck aria-hidden="true" /> : null}
                  </span>
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmbedModal({agent, onClose, onToast}) {
  const [host, setHost] = useState(DEFAULT_EMBED_HOST);
  const [language, setLanguage] = useState("browser");
  const [mode, setMode] = useState("modal");
  const [copied, setCopied] = useState(false);
  const snippet = useMemo(
    () => buildEmbedSnippet({host, language, mode}),
    [host, language, mode]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHost(window.location.origin);
    }
  }, []);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function copySnippet() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard is not available.");
      }

      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      onToast?.("success", "Embed snippet copied.");
      setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      onToast?.("error", error.message || "Could not copy embed snippet.");
    }
  }

  function closeOnBackdrop(event) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      className={styles.modalOverlay}
      role="presentation"
      onMouseDown={closeOnBackdrop}
    >
      <div
        className={styles.modalPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="embed-modal-title"
      >
        <div className={styles.modalHeader}>
          <div className={styles.titleBlock}>
            <span className={styles.kicker}>
              <FiCode aria-hidden="true" /> Website embed
            </span>
            <h2 id="embed-modal-title">Embed agent</h2>
          </div>
          <button
            type="button"
            className={styles.modalCloseButton}
            aria-label="Close embed modal"
            onClick={onClose}
          >
            <FiX aria-hidden="true" />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.embedAgentSummary}>
            <div className={styles.embedAgentAvatar}>
              {isVideoAvatar(agent.avatar) ? (
                <video src={agent.avatar} muted playsInline autoPlay loop />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agent.avatar} alt="" />
              )}
            </div>
            <div>
              <strong>{agent.name || "Chatbot"}</strong>
              <span>{normalizeEmbedHost(host)}</span>
            </div>
          </div>

          <div className={styles.embedControls}>
            <label className={styles.field}>
              Widget host
              <input
                type="url"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder={DEFAULT_EMBED_HOST}
              />
            </label>
            <SelectField
              label="Language"
              options={EMBED_LANGUAGE_OPTIONS}
              value={language}
              onChange={setLanguage}
            />
          </div>

          <div className={styles.segmentedControl} aria-label="Embed mode">
            {EMBED_MODE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`${styles.segmentedButton} ${
                  mode === option.id ? styles.segmentedButtonActive : ""
                }`}
                aria-pressed={mode === option.id}
                onClick={() => setMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className={styles.embedSnippetShell}>
            <div className={styles.embedSnippetHeader}>
              <span>{mode === "embedded" ? "Inline snippet" : "Launcher snippet"}</span>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={copySnippet}
              >
                <FiCopy aria-hidden="true" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className={styles.embedCode}>
              <code>{snippet}</code>
            </pre>
          </div>

          <div className={styles.modalActions}>
            <a
              className={styles.ghostButton}
              href="/widget-demo.html"
              target="_blank"
              rel="noreferrer"
            >
              <FiExternalLink aria-hidden="true" />
              Preview
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentSettingsPanel({
  adminStatus,
  namespaceOptions,
  onSave,
  saving,
  settings,
  setSettings,
}) {
  const selectedNamespace = String(settings.namespace || "").trim();
  const namespaceSelectOptions = selectedNamespace
    ? [
        selectedNamespace,
        ...namespaceOptions.filter((namespace) => namespace !== selectedNamespace),
      ]
    : namespaceOptions;
  const namespaceDropdownOptions = [
    {value: "", label: "All namespaces"},
    ...namespaceSelectOptions.map((namespace) => ({
      value: namespace,
      label: namespace,
    })),
  ];

  return (
    <div className={styles.agentSettingsPanel}>
      <div className={styles.panelHeader}>
        <div className={styles.titleBlock}>
          <h1>Agent Settings</h1>
        </div>
        <div className={styles.sectionActions}>
          <div
            className={`${styles.statusPill} ${adminStatus.className}`}
            role="status"
            aria-live="polite"
          >
            <span className={styles.statusDot} aria-hidden="true" />
            {adminStatus.label}
          </div>
        </div>
      </div>

      <label className={styles.field}>
        Instructions
        <textarea
          className={styles.largeTextarea}
          value={settings.instruction || ""}
          onChange={(event) =>
            setSettings((current) => ({...current, instruction: event.target.value}))
          }
        />
      </label>

      <div className={styles.settingsGrid}>
        <label className={styles.field}>
          Model
          <input
            value={settings.model || ""}
            readOnly
            aria-readonly="true"
          />
        </label>
        <SelectField
          label="Namespace"
          options={namespaceDropdownOptions}
          value={settings.namespace || ""}
          onChange={(namespace) =>
            setSettings((current) => ({...current, namespace}))
          }
        />
        <label className={styles.field}>
          Retrieval K
          <input
            type="number"
            min="1"
            max="20"
            value={settings.retrieval_k || 6}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                retrieval_k: Number(event.target.value),
              }))
            }
          />
        </label>
      </div>

      <div className={styles.sliderGrid}>
        {[
          ["temperature", "Temperature", 0, 2, 0.05],
          ["top_p", "Top P", 0, 1, 0.05],
        ].map(([key, label, min, max, step]) => (
          <label key={key} className={styles.field}>
            <span className={styles.fieldHeader}>
              <span>{label}</span>
              <strong>{settings[key]}</strong>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={settings[key] ?? DEFAULT_SETTINGS[key]}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  [key]: Number(event.target.value),
                }))
              }
            />
          </label>
        ))}
      </div>

      <div className={styles.settingsGrid}>
        <label className={styles.field}>
          Top K
          <input
            type="number"
            min="1"
            max="200"
            value={settings.top_k || 40}
            onChange={(event) =>
              setSettings((current) => ({...current, top_k: Number(event.target.value)}))
            }
          />
        </label>
        <label className={styles.field}>
          Max tokens
          <input
            type="number"
            min="128"
            max="12000"
            value={settings.max_tokens || 2000}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                max_tokens: Number(event.target.value),
              }))
            }
          />
        </label>
      </div>

      <div className={styles.integrationFooterActions}>
        <button className={styles.primaryButton} onClick={onSave} disabled={saving}>
          <FiSave aria-hidden="true" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function ThemeColorsSection({agent, onSaveAgent, saving, setAgent}) {
  return (
    <section className={styles.agentConfigSection}>
      <div className={styles.sectionHeader}>
        <h2>Theme Colors</h2>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onSaveAgent}
          disabled={saving}
        >
          <FiSave aria-hidden="true" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className={styles.colorGrid}>
        {[
          ["primary_color", "Primary"],
          ["secondary_color", "Secondary"],
          ["button_color", "Button"],
        ].map(([key, label]) => (
          <label key={key} className={styles.field}>
            {label}
            <span className={styles.colorInput}>
              <input
                type="color"
                value={agent[key] || "#000000"}
                onChange={(event) =>
                  setAgent((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
              <input
                value={agent[key] || ""}
                onChange={(event) =>
                  setAgent((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function AgentSection({
  adminStatus,
  agent,
  setAgent,
  chatPrompts,
  setChatPrompts,
  namespaceOptions,
  onOpenEmbed,
  onSaveAgent,
  onSaveSettings,
  onSavePrompts,
  onUploadAvatar,
  saving,
  settings,
  setSettings,
}) {
  async function handleAvatarFileChange(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    await onUploadAvatar(file);
    input.value = "";
  }

  function addPrompt() {
    setChatPrompts((current) => [...current, createPromptDraft()]);
  }

  function removePrompt(index) {
    setChatPrompts((current) =>
      current.filter((_, promptIndex) => promptIndex !== index)
    );
  }

  function togglePrompt(index, active) {
    setChatPrompts((current) =>
      current.map((prompt, promptIndex) =>
        promptIndex === index ? {...prompt, active} : prompt
      )
    );
  }

  const isAgentReady = adminStatus?.label === "Ready";

  return (
    <section className={styles.agentWorkspace}>
      <div className={styles.panelHeader}>
        <div className={styles.titleBlock}>
          <h1>Agent</h1>
        </div>
      </div>

      <div className={styles.agentSectionStack}>
        <AgentSettingsPanel
          adminStatus={adminStatus}
          namespaceOptions={namespaceOptions}
          onSave={onSaveSettings}
          saving={saving}
          settings={settings}
          setSettings={setSettings}
        />

        <section className={styles.agentConfigSection}>
          <div className={styles.sectionHeader}>
            <h2>Agent Profile</h2>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onSaveAgent}
              disabled={saving}
            >
              <FiSave aria-hidden="true" />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          <div className={styles.twoColumn}>
            <div className={styles.form}>
              <label className={styles.field}>
                Agent name
                <input
                  value={agent.name || ""}
                  onChange={(event) =>
                    setAgent((current) => ({...current, name: event.target.value}))
                  }
                />
              </label>

              <label className={styles.field}>
                Avatar URL
                <input
                  value={agent.avatar || ""}
                  onChange={(event) =>
                    setAgent((current) => ({...current, avatar: event.target.value}))
                  }
                />
              </label>

              <label className={`${styles.fileDrop} ${styles.avatarUpload}`}>
                <FiUpload aria-hidden="true" />
                <span>Upload image or MP4</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
                  disabled={saving}
                  onChange={handleAvatarFileChange}
                />
              </label>

              <div className={styles.avatarGrid}>
                {AVATAR_OPTIONS.map((avatar) => (
                  <button
                    key={avatar}
                    type="button"
                    className={`${styles.avatarChoice} ${
                      agent.avatar === avatar ? styles.avatarChoiceActive : ""
                    }`}
                    onClick={() => setAgent((current) => ({...current, avatar}))}
                    title={avatar.split("/").pop()}
                  >
                    <video src={avatar} muted playsInline preload="metadata" />
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.previewPane}>
              <div className={styles.agentPreviewHeader}>
                <div className={styles.agentAvatarPreview}>
                  {isVideoAvatar(agent.avatar) ? (
                    <video src={agent.avatar} muted playsInline autoPlay loop />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={agent.avatar} alt="" />
                  )}
                </div>
                <div>
                  <strong>{agent.name || "Chatbot"}</strong>
                  <span>Online</span>
                </div>
              </div>

              <div
                className={styles.agentBubble}
                style={{
                  background: agent.primary_color || "#6e26f5",
                  color: "#ffffff",
                }}
              >
                {localizedValue(agent.starting_message, "en") ||
                  "How can I help today?"}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.agentConfigSection}>
          <div className={styles.sectionHeader}>
            <h2>Greetings</h2>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onSaveAgent}
              disabled={saving}
            >
              <FiSave aria-hidden="true" />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          <div className={styles.localizedGrid}>
            {LANGUAGES.map((language) => (
              <div key={language.code} className={styles.localePanel}>
                <h2>{language.label}</h2>
                <label className={styles.field}>
                  Greeting
                  <input
                    value={localizedValue(agent.greeting, language.code)}
                    onChange={(event) =>
                      setAgent((current) => ({
                        ...current,
                        greeting: setLocalizedValue(
                          current.greeting,
                          language.code,
                          event.target.value
                        ),
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  Starting message
                  <input
                    value={localizedValue(agent.starting_message, language.code)}
                    onChange={(event) =>
                      setAgent((current) => ({
                        ...current,
                        starting_message: setLocalizedValue(
                          current.starting_message,
                          language.code,
                          event.target.value
                        ),
                      }))
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.agentConfigSection}>
          <div className={styles.sectionHeader}>
            <h2>Chat Prompts</h2>
            <div className={styles.sectionActions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={addPrompt}
                disabled={saving}
              >
                <FiPlus aria-hidden="true" />
                Add prompt
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={onSavePrompts}
                disabled={saving}
              >
                <FiSave aria-hidden="true" />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className={styles.promptList}>
            {chatPrompts.length ? (
              chatPrompts.map((prompt, index) => (
                <div
                  className={styles.promptCard}
                  key={prompt.clientId || prompt.id || index}
                >
                  <div className={styles.promptCardHeader}>
                    <label className={styles.checkboxField}>
                      <input
                        type="checkbox"
                        checked={prompt.active !== false}
                        onChange={(event) =>
                          togglePrompt(index, event.target.checked)
                        }
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      className={styles.iconDangerButton}
                      aria-label="Remove prompt"
                      onClick={() => removePrompt(index)}
                      disabled={saving}
                    >
                      <FiX aria-hidden="true" />
                    </button>
                  </div>

                  <div className={styles.promptTranslationGrid}>
                    {LANGUAGES.map((language) => (
                      <label key={language.code} className={styles.field}>
                        {language.label}
                        <textarea
                          rows="2"
                          value={promptLocalizedValue(prompt, language.code)}
                          onChange={(event) =>
                            setChatPrompts((current) =>
                              setPromptLocalizedValue(
                                current,
                                index,
                                language.code,
                                event.target.value
                              )
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>No chat prompts configured.</div>
            )}
          </div>
        </section>

        {isAgentReady ? (
          <section className={`${styles.agentConfigSection} ${styles.agentUtilitySection}`}>
            <div className={styles.sectionHeader}>
              <h2>Widget Embed</h2>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={onOpenEmbed}
              >
                <FiCode aria-hidden="true" />
                Embed
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function SettingsSection({
  agent,
  setAgent,
  system,
  setSystem,
  onSaveAgent,
  onSave,
  onSendTestEmail,
  saving,
}) {
  const [isIpGeolocationHelpOpen, setIsIpGeolocationHelpOpen] = useState(false);
  const [isMapboxHelpOpen, setIsMapboxHelpOpen] = useState(false);
  const isIpGeolocationConnected =
    Boolean(system.ipGeolocationConfigured) &&
    !system.clearIpGeolocationApiKey;
  const showIpGeolocationApiKeyField =
    !system.ipGeolocationConfigured ||
    Boolean(system.clearIpGeolocationApiKey) ||
    Boolean(system.ipGeolocationApiKey?.trim());
  const canSaveIpGeolocation =
    Boolean(system.ipGeolocationApiKey?.trim()) ||
    Boolean(system.clearIpGeolocationApiKey);
  const ipGeolocationSummary = isIpGeolocationConnected
    ? `API key ${system.ipGeolocationApiKeyPreview || "configured"}`
    : "Add an API key to enrich conversations with location data.";
  const isMapboxConnected =
    Boolean(system.mapboxConfigured || system.mapboxToken?.trim()) &&
    !system.clearMapboxToken;
  const showMapboxTokenField =
    !system.mapboxConfigured || Boolean(system.clearMapboxToken);
  const canSaveMapbox =
    Boolean(system.mapboxToken?.trim()) || Boolean(system.clearMapboxToken);
  const mapboxSummary = isMapboxConnected
    ? `Public token ${system.mapboxTokenPreview || "configured"}`
    : "Add a public token to render the conversation location map.";
  const mail = normalizeMailDraft(system.mail);
  const mailRecipients = Array.isArray(mail.recipients) ? mail.recipients : [];
  const mailMissing = Array.isArray(mail.missing) ? mail.missing : [];
  const mailStatus = mail.active
    ? "Ready"
    : mail.enabled === false
    ? "Disabled"
    : "Needs config";
  const mailStatusClass = mail.active
    ? styles.connectionChipConnected
    : mail.enabled === false
    ? styles.connectionChipDisconnected
    : styles.connectionChipError;
  const mailEditable = mail.provider !== "disabled";

  function setMailField(field, value) {
    setSystem((current) => ({
      ...current,
      mail: {
        ...normalizeMailDraft(current.mail),
        [field]: value,
      },
    }));
  }

  function selectMailProvider(provider) {
    const preset = MAIL_PROVIDER_PRESETS[provider] || MAIL_PROVIDER_PRESETS.custom;

    setSystem((current) => {
      const currentMail = normalizeMailDraft(current.mail);
      return {
        ...current,
        mail: {
          ...currentMail,
          provider,
          enabled: provider === "disabled" ? false : currentMail.enabled !== false,
          host: preset.host,
          port: preset.port,
          secure: preset.secure,
          requireTLS: preset.requireTLS,
        },
      };
    });
  }

  function clearMailSettings() {
    setSystem((current) => ({
      ...current,
      mail: {
        ...DEFAULT_SYSTEM.mail,
        provider: "disabled",
        providerLabel: "Disabled",
        enabled: false,
        active: false,
        configured: false,
        host: "",
        fromName: "",
        smtpPassword: "",
        clearSmtpPassword: true,
        passwordConfigured: false,
        source: "database",
        missing: [],
      },
    }));
  }

  return (
    <section className={styles.panel}>
      <ThemeColorsSection
        agent={agent}
        onSaveAgent={onSaveAgent}
        saving={saving}
        setAgent={setAgent}
      />

      <div className={styles.integrationPanel}>
        <div className={styles.integrationHeader}>
          <div className={styles.titleBlock}>
            <h2>IPGeolocation.io</h2>
            <p>{ipGeolocationSummary}</p>
          </div>
          <div className={styles.sectionActions}>
            <div className={styles.helpAnchor}>
              <button
                type="button"
                className={styles.inlineHelpButton}
                aria-label="Show IPGeolocation.io setup help"
                aria-expanded={isIpGeolocationHelpOpen}
                onClick={() =>
                  setIsIpGeolocationHelpOpen((currentValue) => !currentValue)
                }
              >
                <FiHelpCircle aria-hidden="true" />
              </button>
              {isIpGeolocationHelpOpen ? (
                <div className={styles.helpPopover} role="dialog">
                  <div className={styles.helpPopoverHeader}>
                    <strong>IPGeolocation.io setup</strong>
                    <button
                      type="button"
                      className={styles.helpCloseButton}
                      aria-label="Close IPGeolocation.io setup help"
                      onClick={() => setIsIpGeolocationHelpOpen(false)}
                    >
                      <FiX aria-hidden="true" />
                    </button>
                  </div>
                  <p>
                    Create an IPGeolocation.io account, copy an API key from
                    the dashboard, then paste it here. The key is used
                    server-side to store city, country, latitude, and longitude
                    for conversations.
                  </p>
                  <a
                    href="https://app.ipgeolocation.io/dashboard"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open IPGeolocation.io dashboard{" "}
                    <FiExternalLink aria-hidden="true" />
                  </a>
                </div>
              ) : null}
            </div>
            <span
              className={`${styles.connectionChip} ${
                isIpGeolocationConnected
                  ? styles.connectionChipConnected
                  : styles.connectionChipDisconnected
              }`}
            >
              {isIpGeolocationConnected ? "Connected" : "Not connected"}
            </span>
          </div>
        </div>

        {showIpGeolocationApiKeyField ? (
          <div className={styles.ipGeoControls}>
            <label className={`${styles.field} ${styles.ipGeoKeyField}`}>
              API key
              <input
                value={system.ipGeolocationApiKey || ""}
                onChange={(event) =>
                  setSystem((current) => ({
                    ...current,
                    ipGeolocationApiKey: event.target.value,
                    clearIpGeolocationApiKey: false,
                  }))
                }
                autoComplete="off"
                placeholder="Optional IPGeolocation.io API key"
              />
            </label>
          </div>
        ) : null}

        <div className={styles.integrationFooterActions}>
          {showIpGeolocationApiKeyField ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onSave}
              disabled={saving || !canSaveIpGeolocation}
            >
              <FiCheck aria-hidden="true" />
              {saving
                ? "Saving..."
                : system.clearIpGeolocationApiKey &&
                  !system.ipGeolocationApiKey?.trim()
                ? "Save disconnect"
                : "Connect"}
            </button>
          ) : (
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() =>
                setSystem((current) => ({
                  ...current,
                  clearIpGeolocationApiKey: true,
                  ipGeolocationApiKey: "",
                }))
              }
            >
              <FiTrash2 aria-hidden="true" />
              Disconnect
            </button>
          )}
        </div>
      </div>

      <div className={styles.integrationPanel}>
        <div className={styles.integrationHeader}>
          <div className={styles.titleBlock}>
            <h2>Mapbox</h2>
            <p>{mapboxSummary}</p>
          </div>
          <div className={styles.sectionActions}>
            <div className={styles.helpAnchor}>
              <button
                type="button"
                className={styles.inlineHelpButton}
                aria-label="Show Mapbox setup help"
                aria-expanded={isMapboxHelpOpen}
                onClick={() =>
                  setIsMapboxHelpOpen((currentValue) => !currentValue)
                }
              >
                <FiHelpCircle aria-hidden="true" />
              </button>
              {isMapboxHelpOpen ? (
                <div className={styles.helpPopover} role="dialog">
                  <div className={styles.helpPopoverHeader}>
                    <strong>Mapbox setup</strong>
                    <button
                      type="button"
                      className={styles.helpCloseButton}
                      aria-label="Close Mapbox setup help"
                      onClick={() => setIsMapboxHelpOpen(false)}
                    >
                      <FiX aria-hidden="true" />
                    </button>
                  </div>
                  <p>
                    Create a public Mapbox access token and paste it here. The
                    admin dashboard uses it in the browser to render the
                    conversation location map.
                  </p>
                  <a
                    href="https://account.mapbox.com/access-tokens/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Mapbox access tokens{" "}
                    <FiExternalLink aria-hidden="true" />
                  </a>
                </div>
              ) : null}
            </div>
            <span
              className={`${styles.connectionChip} ${
                isMapboxConnected
                  ? styles.connectionChipConnected
                  : styles.connectionChipDisconnected
              }`}
            >
              {isMapboxConnected ? "Connected" : "Not connected"}
            </span>
          </div>
        </div>

        {showMapboxTokenField ? (
          <div className={styles.ipGeoControls}>
            <label className={`${styles.field} ${styles.ipGeoKeyField}`}>
              Public token
              <input
                value={system.mapboxToken || ""}
                onChange={(event) =>
                  setSystem((current) => ({
                    ...current,
                    mapboxToken: event.target.value,
                    clearMapboxToken: false,
                  }))
                }
                autoComplete="off"
                placeholder="Optional Mapbox public token"
              />
            </label>
          </div>
        ) : null}

        <div className={styles.integrationFooterActions}>
          {showMapboxTokenField ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onSave}
              disabled={saving || !canSaveMapbox}
            >
              <FiCheck aria-hidden="true" />
              {saving
                ? "Saving..."
                : system.clearMapboxToken && !system.mapboxToken?.trim()
                ? "Save disconnect"
                : "Connect"}
            </button>
          ) : (
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() =>
                setSystem((current) => ({
                  ...current,
                  clearMapboxToken: true,
                  mapboxToken: "",
                }))
              }
            >
              <FiTrash2 aria-hidden="true" />
              Disconnect
            </button>
          )}
        </div>
      </div>

      <div className={styles.integrationPanel}>
        <div className={styles.integrationHeader}>
          <div className={styles.titleBlock}>
            <h2>Email delivery</h2>
          </div>
          <div className={`${styles.sectionActions} ${styles.mailHeaderActions}`}>
            <span className={`${styles.connectionChip} ${mailStatusClass}`}>
              {mailStatus}
            </span>
          </div>
        </div>

        <div className={styles.mailToggleRow}>
          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={mail.enabled !== false && mail.provider !== "disabled"}
              disabled={mail.provider === "disabled"}
              onChange={(event) => setMailField("enabled", event.target.checked)}
            />
            New conversation notification emails
          </label>
        </div>

        <div className={styles.mailFormStack}>
          <div className={styles.mailAccountGrid}>
            <SelectField
              label="Provider"
              options={MAIL_PROVIDER_OPTIONS}
              value={mail.provider || "apple"}
              onChange={selectMailProvider}
            />
            <label className={styles.field}>
              From name
              <input
                value={mail.fromName || ""}
                disabled={!mailEditable}
                onChange={(event) => setMailField("fromName", event.target.value)}
                placeholder="Krostewitz AI Agent"
              />
            </label>
            <label className={styles.field}>
              From email
              <input
                type="email"
                value={mail.from || ""}
                disabled={!mailEditable}
                onChange={(event) => setMailField("from", event.target.value)}
                placeholder="mathias@krostewitz.com"
              />
            </label>
            <label className={styles.field}>
              Reply-to
              <input
                type="email"
                value={mail.replyTo || ""}
                disabled={!mailEditable}
                onChange={(event) => setMailField("replyTo", event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          <label className={`${styles.field} ${styles.mailRecipientsField}`}>
            Notification recipients
            <textarea
              rows="2"
              value={recipientsToText(mailRecipients)}
              disabled={!mailEditable}
              onChange={(event) =>
                setMailField("recipients", textToRecipients(event.target.value))
              }
              placeholder="mathias@krostewitz.com"
            />
          </label>

          <div className={styles.mailServerGrid}>
            <label className={styles.field}>
              SMTP host
              <input
                value={mail.host || ""}
                disabled={!mailEditable}
                onChange={(event) => setMailField("host", event.target.value)}
                placeholder="smtp.mail.me.com"
              />
            </label>
            <label className={styles.field}>
              Port
              <input
                type="number"
                min="1"
                max="65535"
                value={mail.port || 587}
                disabled={!mailEditable}
                onChange={(event) => setMailField("port", Number(event.target.value))}
              />
            </label>
            <label className={styles.field}>
              SMTP username
              <input
                value={mail.username || ""}
                disabled={!mailEditable}
                onChange={(event) => setMailField("username", event.target.value)}
                placeholder="mathias@krostewitz.com"
                autoComplete="username"
              />
            </label>
            <label className={styles.field}>
              SMTP password
              <input
                type="password"
                value={mail.smtpPassword || ""}
                disabled={!mailEditable}
                onChange={(event) =>
                  setSystem((current) => ({
                    ...current,
                    mail: {
                      ...normalizeMailDraft(current.mail),
                      smtpPassword: event.target.value,
                      clearSmtpPassword: false,
                    },
                  }))
                }
                placeholder={
                  mail.passwordConfigured && !mail.clearSmtpPassword
                    ? "Enter new password"
                    : "App-specific password"
                }
                autoComplete="new-password"
              />
            </label>
          </div>
        </div>

        <div className={styles.mailFooterRow}>
          <div className={styles.mailSecurityOptions}>
            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={Boolean(mail.requireTLS)}
                disabled={!mailEditable}
                onChange={(event) => setMailField("requireTLS", event.target.checked)}
              />
              Require STARTTLS
            </label>
            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={Boolean(mail.secure)}
                disabled={!mailEditable}
                onChange={(event) => setMailField("secure", event.target.checked)}
              />
              Use direct TLS
            </label>
          </div>
          <div className={styles.mailPasswordActions}>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={saving}
              onClick={clearMailSettings}
            >
              <FiTrash2 aria-hidden="true" />
              Clear settings
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={onSendTestEmail}
              disabled={saving}
            >
              <FiSend aria-hidden="true" />
              Send test
            </button>
            <button
              type="button"
              className={`${styles.primaryButton} ${styles.mailSaveButton}`}
              onClick={onSave}
              disabled={saving}
            >
              <FiSave aria-hidden="true" />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {mail.enabled !== false && !mail.active && mailMissing.length ? (
          <div className={styles.mailMissingKeys}>
            <span>Missing settings</span>
            <strong>{mailMissing.join(", ")}</strong>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function KnowledgeSection({
  documents,
  onDeleteDocument,
  onRefresh,
  onUploadPdf,
  onRagWebsite,
  busy,
}) {
  const [namespace, setNamespace] = useState("documents");
  const [urlNamespace, setUrlNamespace] = useState("website");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [replaceWebsite, setReplaceWebsite] = useState(true);
  const [crawlWebsite, setCrawlWebsite] = useState(true);
  const [websiteMaxPages, setWebsiteMaxPages] = useState(25);
  const [file, setFile] = useState(null);

  async function submitPdf(event) {
    event.preventDefault();
    if (!file) return;
    await onUploadPdf({file, namespace});
    event.target.reset();
    setFile(null);
  }

  async function submitWebsite(event) {
    event.preventDefault();
    await onRagWebsite({
      crawl: crawlWebsite,
      maxPages: websiteMaxPages,
      namespace: urlNamespace,
      replace: replaceWebsite,
      url: websiteUrl,
    });
    setWebsiteUrl("");
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.titleBlock}>
          <h1>Knowledge</h1>
        </div>
        <button className={styles.ghostButton} onClick={onRefresh} disabled={busy}>
          <FiRefreshCw aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className={styles.twoColumn}>
        <form className={styles.form} onSubmit={submitPdf}>
          <h2>Documents</h2>
          <label className={styles.field}>
            Namespace
            <input
              value={namespace}
              onChange={(event) => setNamespace(event.target.value)}
              required
            />
          </label>
          <label className={styles.fileDrop}>
            <FiUpload aria-hidden="true" />
            <span>{file ? file.name : "Choose PDF"}</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          <button className={styles.primaryButton} disabled={busy || !file}>
            <FiUpload aria-hidden="true" />
            Upload
          </button>
        </form>

        <form className={styles.form} onSubmit={submitWebsite}>
          <h2>Websites</h2>
          <label className={styles.field}>
            URL
            <input
              type="url"
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            Namespace
            <input
              value={urlNamespace}
              onChange={(event) => setUrlNamespace(event.target.value)}
              required
            />
          </label>
          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={replaceWebsite}
              onChange={(event) => setReplaceWebsite(event.target.checked)}
            />
            Replace existing source
          </label>
          <div className={styles.websiteOptions}>
            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={crawlWebsite}
                onChange={(event) => setCrawlWebsite(event.target.checked)}
              />
              Crawl internal pages
            </label>
            <label className={styles.field}>
              Max pages
              <input
                type="number"
                min="1"
                max="100"
                value={websiteMaxPages}
                onChange={(event) =>
                  setWebsiteMaxPages(Number(event.target.value) || 1)
                }
                disabled={!crawlWebsite}
              />
            </label>
          </div>
          <button className={styles.primaryButton} disabled={busy}>
            <FiRefreshCw aria-hidden="true" />
            RAG website
          </button>
        </form>
      </div>

      <div className={styles.tableShell}>
        <div className={styles.documentHeader}>
          <span>Source</span>
          <span>Namespace</span>
          <span>Type</span>
          <span>Chunks</span>
          <span>Updated</span>
          <span />
        </div>
        {documents.map((document) => (
          <div key={document.id} className={styles.documentRow}>
            <strong title={document.source}>{document.title || document.source}</strong>
            <span>{document.namespace}</span>
            <span>{document.type}</span>
            <span>{document.chunks}</span>
            <span>{formatDateTime(document.lastIndexedAt)}</span>
            <button
              type="button"
              className={styles.iconDangerButton}
              title="Delete"
              onClick={() => onDeleteDocument(document)}
            >
              <FiTrash2 aria-hidden="true" />
            </button>
          </div>
        ))}
        {documents.length === 0 ? (
          <div className={styles.emptyState}>No indexed knowledge sources.</div>
        ) : null}
      </div>
    </section>
  );
}

function ConversationsSection({
  conversations,
  counts,
  filter,
  setFilter,
  onGeolocate,
  onRefresh,
  onSave,
  onDelete,
  mapboxToken,
  busy,
}) {
  const [activeId, setActiveId] = useState("");
  const [statusDraft, setStatusDraft] = useState("open");
  const [notesDraft, setNotesDraft] = useState("");
  const [actionTypeDraft, setActionTypeDraft] = useState("follow_up");
  const [actionDraft, setActionDraft] = useState("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isGeolocating, setIsGeolocating] = useState(false);
  const activeConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === activeId) ||
      conversations[0] ||
      null,
    [activeId, conversations]
  );
  const activeActions = conversationActions(activeConversation || {});
  const activeMessages = Array.isArray(activeConversation?.messages)
    ? activeConversation.messages
    : [];
  const hasDetailChanges = Boolean(
    activeConversation &&
      (statusDraft !== (activeConversation.status || "open") ||
        notesDraft !== (activeConversation.notes || ""))
  );
  const hasActionDraft = Boolean(actionDraft.trim());

  useEffect(() => {
    if (!activeConversation) return;
    setActiveId(activeConversation.id);
    setStatusDraft(activeConversation.status || "open");
    setNotesDraft(activeConversation.notes || "");
    setActionTypeDraft("follow_up");
    setActionDraft("");
  }, [activeConversation]);

  useEffect(() => {
    if (isDetailsOpen && !activeConversation) {
      setIsDetailsOpen(false);
    }
  }, [activeConversation, isDetailsOpen]);

  useEffect(() => {
    if (!isDetailsOpen) return undefined;

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setIsDetailsOpen(false);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = originalOverflow;
    };
  }, [isDetailsOpen]);

  async function saveLeadDetails() {
    if (!activeConversation) return;
    await onSave(activeConversation.id, {
      status: statusDraft,
      notes: notesDraft,
    });
  }

  async function saveLeadAction() {
    if (!activeConversation) return;
    await onSave(activeConversation.id, {
      status: statusDraft,
      notes: notesDraft,
      actionType: actionTypeDraft,
      actionText: actionDraft,
    });
    setActionTypeDraft("follow_up");
    setActionDraft("");
  }

  async function deleteActive() {
    if (!activeConversation) return;
    await onDelete(activeConversation.id);
    setIsDetailsOpen(false);
  }

  function openConversationDetails(conversationId) {
    setActiveId(conversationId);
    setIsDetailsOpen(true);
  }

  async function geolocateStoredConversationIps() {
    setIsGeolocating(true);

    try {
      await onGeolocate();
    } finally {
      setIsGeolocating(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.titleBlock}>
          <h1>Conversations</h1>
          <p className={styles.muted}>
            Review visitor chats, tracking details, notes, and follow-up actions.
          </p>
        </div>
        <button className={styles.ghostButton} onClick={onRefresh} disabled={busy}>
          <FiRefreshCw aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className={styles.conversationStats} aria-label="Conversation filters">
        {[
          {
            value: "",
            label: "total",
            count: Object.values(counts || {}).reduce(
              (total, value) => total + (Number(value) || 0),
              0
            ),
          },
          {value: "open", label: "open", count: counts.open || 0},
          {value: "reviewing", label: "reviewing", count: counts.reviewing || 0},
          {value: "qualified", label: "qualified", count: counts.qualified || 0},
          {value: "closed", label: "closed", count: counts.closed || 0},
          {value: "spam", label: "spam", count: counts.spam || 0},
        ].map((chip) => (
          <button
            key={chip.value || "total"}
            type="button"
            className={`${styles.conversationStatChip} ${
              filter.status === chip.value ? styles.conversationStatChipActive : ""
            }`}
            aria-pressed={filter.status === chip.value}
            onClick={() => setFilter((current) => ({...current, status: chip.value}))}
          >
            {chip.count} {chip.label}
          </button>
        ))}
      </div>

      <div className={styles.conversationFilterRow}>
        <label className={styles.field}>
          Search
          <input
            value={filter.q}
            placeholder="Name, email, phone, message, or ID"
            onChange={(event) =>
              setFilter((current) => ({...current, q: event.target.value}))
            }
          />
        </label>
      </div>

      <div className={styles.conversationWorkspace}>
        <section className={styles.conversationListPanel}>
          <div className={styles.panelHeader}>
            <div className={styles.titleBlock}>
              <h2>Conversation list</h2>
              <p className={styles.muted}>
                Select a row to inspect activity and manage status.
              </p>
            </div>
            <div className={styles.sectionActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy || isGeolocating}
                title="Re-geolocate stored conversation IP addresses"
                onClick={() => void geolocateStoredConversationIps()}
              >
                <FiRefreshCw aria-hidden="true" />
                {isGeolocating ? "Geolocating..." : "Re-geolocate stored IPs"}
              </button>
            </div>
          </div>

          <ConversationMap
            activeConversationId={activeConversation?.id || ""}
            conversations={conversations}
            mapboxToken={mapboxToken}
            onSelectConversation={openConversationDetails}
          />

          <div className={styles.conversationList} aria-label="Conversations">
            <div className={styles.conversationListHeader} aria-hidden="true">
              <span>Visitor</span>
              <span>Status</span>
              <span>Messages</span>
              <span>Activity</span>
              <span>Updated</span>
            </div>

          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`${styles.conversationListRow} ${
                activeConversation?.id === conversation.id
                  ? styles.conversationListRowActive
                  : ""
              }`}
              onClick={() => openConversationDetails(conversation.id)}
            >
              <span className={styles.conversationIdentity}>
                <strong>{conversationTitle(conversation)}</strong>
                <small>{conversationContactLine(conversation)}</small>
              </span>
              <span className={styles.statusBadge}>
                {CONVERSATION_STATUS_LABELS[conversation.status] ||
                  conversation.status ||
                  "Open"}
              </span>
              <span className={styles.conversationMessageSummary}>
                <strong>{conversationMessageCountLabel(conversation)}</strong>
                <small>{conversation.preview || "No messages"}</small>
              </span>
              <span className={styles.conversationActivityPreview}>
                <strong>{conversationActionsCountLabel(conversation)}</strong>
                <small>{conversationActionsPreview(conversation)}</small>
              </span>
              <span className={styles.conversationTime}>
                {formatDateTime(conversation.updated_at || conversation.created_at)}
              </span>
            </button>
          ))}

          {conversations.length === 0 ? (
            <div className={styles.emptyState}>No conversations found.</div>
          ) : null}
          </div>
        </section>
      </div>

      {isDetailsOpen && activeConversation ? (
        <div
          className={styles.conversationModalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsDetailsOpen(false);
            }
          }}
        >
          <section
            aria-labelledby="conversation-details-title"
            aria-modal="true"
            className={styles.conversationModalPanel}
            role="dialog"
          >
            <div className={styles.conversationModalHeader}>
              <div className={styles.titleBlock}>
                <h2 id="conversation-details-title">
                  {conversationTitle(activeConversation)}
                </h2>
                <p className={styles.muted}>
                  {conversationSourceLabel(activeConversation)} -{" "}
                  {activeConversation.conversation_id}
                </p>
              </div>
              <div className={styles.conversationModalHeaderActions}>
                <label className={styles.conversationHeaderStatusField}>
                  <span>Lead status</span>
                  <select
                    value={statusDraft}
                    disabled={busy}
                    onChange={(event) => setStatusDraft(event.target.value)}
                  >
                    {CONVERSATION_STATUSES.filter((status) => status.value).map(
                      (status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      )
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy || !hasDetailChanges}
                  onClick={() => void saveLeadDetails()}
                >
                  <FiSave aria-hidden="true" />
                  {busy ? "Saving..." : "Save details"}
                </button>
                <button
                  type="button"
                  className={styles.iconDangerButton}
                  title="Delete conversation"
                  onClick={() => void deleteActive()}
                >
                  <FiTrash2 aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label="Close conversation details"
                  title="Close"
                  onClick={() => setIsDetailsOpen(false)}
                >
                  <FiX aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className={styles.conversationModalBody}>
              <div className={styles.conversationDetailGrid}>
                <div>
                  <span>Email</span>
                  <strong>{activeConversation.user?.email || "Not provided"}</strong>
                </div>
                <div>
                  <span>Phone</span>
                  <strong>{activeConversation.user?.phone || "Not provided"}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{conversationSourceLabel(activeConversation)}</strong>
                </div>
                <div>
                  <span>Created</span>
                  <strong>{formatDateTime(activeConversation.created_at)}</strong>
                </div>
                <div>
                  <span>Updated</span>
                  <strong>{formatDateTime(activeConversation.updated_at)}</strong>
                </div>
                <div>
                  <span>Messages</span>
                  <strong>{conversationMessageCountLabel(activeConversation)}</strong>
                </div>
              </div>

              <div className={styles.conversationTrackingGrid}>
                <div>
                  <span>IP</span>
                  <strong>{activeConversation.tracking?.ip || "Unknown"}</strong>
                </div>
                <div>
                  <span>Country</span>
                  <strong>
                    {activeConversation.tracking?.country ||
                      activeConversation.tracking?.countryCode ||
                      "Unknown"}
                  </strong>
                </div>
                <div>
                  <span>State</span>
                  <strong>
                    {activeConversation.tracking?.state ||
                      activeConversation.tracking?.region ||
                      "Unknown"}
                  </strong>
                </div>
                <div>
                  <span>Address</span>
                  <strong>{normalizeLocation(activeConversation.tracking)}</strong>
                </div>
                <div className={styles.conversationWideDetail}>
                  <span>Page</span>
                  <strong>
                    {activeConversation.tracking?.pageUrl ||
                      activeConversation.tracking?.referrer ||
                      "Unknown"}
                  </strong>
                </div>
                <div className={styles.conversationWideDetail}>
                  <span>User agent</span>
                  <strong>{activeConversation.tracking?.userAgent || "Unknown"}</strong>
                </div>
              </div>

              <div className={styles.conversationManageGrid}>
                <label className={styles.field}>
                  Lead notes
                  <textarea
                    value={notesDraft}
                    placeholder="Keep internal context for this lead."
                    onChange={(event) => setNotesDraft(event.target.value)}
                  />
                </label>
              </div>

              <section className={styles.conversationActivityComposer}>
                <div className={styles.conversationActivityComposerHeader}>
                  <div>
                    <h3>Lead activity</h3>
                    <p>Log each touchpoint so follow-ups, calls, emails, and qualification work stay traceable.</p>
                  </div>
                  <span>{conversationActionsCountLabel(activeConversation)}</span>
                </div>

                <div className={styles.conversationActionDraftGrid}>
                  <SelectField
                    label="Activity category"
                    options={CONVERSATION_ACTION_TYPES}
                    value={actionTypeDraft}
                    onChange={setActionTypeDraft}
                  />
                  <label className={styles.field}>
                    Activity details
                    <textarea
                      value={actionDraft}
                      onChange={(event) => setActionDraft(event.target.value)}
                      placeholder="Describe the call, email, meeting, follow-up, or next step."
                    />
                  </label>
                </div>

                <button
                  className={styles.primaryButton}
                  onClick={() => void saveLeadAction()}
                  disabled={busy || !hasActionDraft}
                >
                  <FiSave aria-hidden="true" />
                  {busy ? "Saving..." : "Log activity"}
                </button>
              </section>

              <div className={styles.conversationActionSection}>
                <div className={styles.conversationSectionHeader}>
                  <h3>Action history</h3>
                  <span>{conversationActionsCountLabel(activeConversation)}</span>
                </div>

                {activeActions.length > 0 ? (
                  <div className={styles.conversationActionList}>
                    {activeActions.map((action, index) => (
                      <article
                        key={action.id || `${action.createdAt}-${index}`}
                        className={styles.conversationActionItem}
                      >
                        <div className={styles.conversationActionMeta}>
                          <div>
                            <strong>
                              {conversationActionTypeLabel(action.type)}
                            </strong>
                            <small>{action.createdBy || "Admin action"}</small>
                          </div>
                          <span>{formatDateTime(action.createdAt)}</span>
                        </div>
                        <p>{action.text}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className={styles.conversationActionEmpty}>
                    No actions logged yet.
                  </p>
                )}
              </div>

              <div className={styles.conversationTranscriptSection}>
                <div className={styles.conversationSectionHeader}>
                  <h3>Messages</h3>
                  <span>{conversationMessageCountLabel(activeConversation)}</span>
                </div>
                <div className={styles.messageList}>
                  {activeMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`${styles.messageBubble} ${
                        message.role === "assistant"
                          ? styles.messageAssistant
                          : styles.messageUser
                      }`}
                    >
                      <strong>{message.role}</strong>
                      <p>{message.message}</p>
                    </div>
                  ))}
                  {activeMessages.length === 0 ? (
                    <p className={styles.conversationActionEmpty}>
                      No messages stored.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default function AdminDashboard({user}) {
  const [activeTab, setActiveTab] = useState("profile");
  const [agent, setAgent] = useState(DEFAULT_AGENT);
  const [chatPrompts, setChatPrompts] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [system, setSystem] = useState(DEFAULT_SYSTEM);
  const [documents, setDocuments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationCounts, setConversationCounts] = useState({});
  const [conversationFilter, setConversationFilter] = useState({status: "", q: ""});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [embedOpen, setEmbedOpen] = useState(false);
  const namespaceOptions = useMemo(
    () =>
      [
        ...new Set(
          documents
            .map((document) => String(document.namespace || "").trim())
            .filter(Boolean)
        ),
      ].sort((left, right) => left.localeCompare(right)),
    [documents]
  );

  function showToast(type, message) {
    setToast({type, message});
  }

  async function runTask(task, successMessage) {
    setBusy(true);
    setToast(null);

    try {
      const result = await task();
      if (successMessage) showToast("success", successMessage);
      return result;
    } catch (error) {
      showToast("error", error.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function loadAgent() {
    const data = await fetchJson("/api/admin/agent");
    setAgent({...DEFAULT_AGENT, ...(data.agent || {})});
  }

  async function loadChatPrompts() {
    const data = await fetchJson("/api/admin/default-questions");
    setChatPrompts((data.prompts || []).map(createPromptDraft));
  }

  async function loadSettings() {
    const data = await fetchJson("/api/admin/settings");
    setSettings({...DEFAULT_SETTINGS, ...(data.settings || {})});
  }

  async function loadSystem() {
    const data = await fetchJson("/api/admin/system");
    setSystem({...DEFAULT_SYSTEM, ...(data.integrations || {})});
  }

  async function loadDocuments() {
    const data = await fetchJson("/api/admin/documents");
    setDocuments(data.documents || []);
  }

  async function loadConversations() {
    const params = new URLSearchParams();
    if (conversationFilter.status) params.set("status", conversationFilter.status);
    if (conversationFilter.q) params.set("q", conversationFilter.q);
    const query = params.toString();
    const data = await fetchJson(`/api/admin/conversations${query ? `?${query}` : ""}`);
    setConversations(data.conversations || []);
    setConversationCounts(data.counts || {});
  }

  useEffect(() => {
    void runTask(
      async () => {
        await Promise.all([
          loadAgent(),
          loadChatPrompts(),
          loadSettings(),
          loadSystem(),
          loadDocuments(),
          loadConversations(),
        ]);
      },
      ""
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void runTask(loadConversations, "");
    }, 250);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationFilter.status, conversationFilter.q]);

  async function saveAgentProfile() {
    await runTask(async () => {
      const data = await fetchJson("/api/admin/agent", {
        method: "PUT",
        body: JSON.stringify(agent),
      });
      setAgent({...DEFAULT_AGENT, ...(data.agent || {})});
    }, "Agent profile saved.");
  }

  async function saveChatPrompts() {
    await runTask(async () => {
      const data = await fetchJson("/api/admin/default-questions", {
        method: "PUT",
        body: JSON.stringify({prompts: chatPrompts}),
      });
      setChatPrompts((data.prompts || []).map(createPromptDraft));
    }, "Chat prompts saved.");
  }

  async function saveSettings() {
    await runTask(async () => {
      const data = await fetchJson("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({...settings, response_language: ""}),
      });
      const systemData = await fetchJson("/api/admin/system", {
        method: "PUT",
        body: JSON.stringify(buildSystemPayload(system)),
      });

      setSettings({
        ...DEFAULT_SETTINGS,
        ...(data.settings || {}),
        response_language: "",
      });
      setSystem({...DEFAULT_SYSTEM, ...(systemData.integrations || {})});
    }, "Settings saved.");
  }

  async function sendTestEmail() {
    await runTask(async () => {
      const systemData = await fetchJson("/api/admin/system", {
        method: "PUT",
        body: JSON.stringify(buildSystemPayload(system)),
      });
      setSystem({...DEFAULT_SYSTEM, ...(systemData.integrations || {})});

      const result = await fetchJson("/api/admin/system/test-email", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const accepted = Array.isArray(result.accepted) ? result.accepted.length : 0;

      return accepted;
    }, "Test email sent.");
  }

  async function uploadPdf({file, namespace}) {
    await runTask(async () => {
      const formData = new FormData();
      formData.append("namespace", namespace);
      formData.append("file", file);
      await fetchJson("/api/embed/pdf", {method: "POST", body: formData});
      await loadDocuments();
    }, "Document indexed.");
  }

  async function uploadAvatar(file) {
    await runTask(async () => {
      const formData = new FormData();
      formData.append("file", file);
      const data = await fetchJson("/api/admin/avatar", {
        method: "POST",
        body: formData,
      });
      setAgent((current) => ({...current, avatar: data.url || current.avatar}));
    }, "Avatar uploaded. Save profile to publish it.");
  }

  async function ragWebsite({crawl, maxPages, namespace, replace, url}) {
    await runTask(async () => {
      await fetchJson("/api/embed/url", {
        method: "POST",
        body: JSON.stringify({
          crawl,
          includeKnownApis: crawl,
          maxPages,
          namespace,
          replace,
          url,
        }),
      });
      await loadDocuments();
    }, "Website indexed.");
  }

  async function deleteDocument(document) {
    await runTask(async () => {
      await fetchJson("/api/admin/documents", {
        method: "DELETE",
        body: JSON.stringify({
          namespace: document.namespace,
          source: document.source,
        }),
      });
      await loadDocuments();
    }, "Knowledge source deleted.");
  }

  async function saveConversation(conversationId, patch) {
    await runTask(async () => {
      await fetchJson(`/api/admin/conversations/${encodeURIComponent(conversationId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await loadConversations();
    }, "Conversation saved.");
  }

  async function deleteConversation(conversationId) {
    await runTask(async () => {
      await fetchJson(`/api/admin/conversations/${encodeURIComponent(conversationId)}`, {
        method: "DELETE",
      });
      await loadConversations();
    }, "Conversation deleted.");
  }

  async function geolocateConversations() {
    setBusy(true);
    setToast(null);

    try {
      const data = await fetchJson("/api/admin/conversations/geolocate", {
        method: "POST",
        body: JSON.stringify({force: true, limit: 100}),
      });
      await loadConversations();

      const summary = data.summary || {};
      const updated = Number(summary.updated) || 0;
      const lookedUp = Number(summary.lookedUp) || 0;
      const failed = Number(summary.failed) || 0;
      const baseMessage =
        updated > 0
          ? `Updated ${updated} conversation location${
              updated === 1 ? "" : "s"
            } from ${lookedUp} stored IP lookup${lookedUp === 1 ? "" : "s"}.`
          : lookedUp > 0
          ? `No conversation locations changed after ${lookedUp} stored IP lookup${
              lookedUp === 1 ? "" : "s"
            }.`
          : "No stored conversation IPs need geolocation.";

      showToast(
        failed > 0 && updated === 0 ? "error" : failed > 0 ? "warning" : "success",
        failed > 0
          ? `${baseMessage} ${failed} lookup${failed === 1 ? "" : "s"} failed.`
          : baseMessage
      );
    } catch (error) {
      showToast("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  const adminStatus = busy
    ? {label: "Working", className: styles.statusPillWorking}
    : {label: "Ready", className: styles.statusPillReady};

  return (
    <div className={styles.shell}>
      <AdminHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={TABS}
        user={user}
      />

      <main className={styles.main} aria-busy={busy}>
        <div className={styles.topBand}>
          <div className={styles.titleBlock}>
            <span className={styles.kicker}>
              <FiCpu aria-hidden="true" /> Admin console
            </span>
            <h1>Manage Agent</h1>
          </div>
          {activeTab !== "profile" ? (
            <div className={styles.topActions}>
              <div
                className={`${styles.statusPill} ${adminStatus.className}`}
                role="status"
                aria-live="polite"
              >
                <span className={styles.statusDot} aria-hidden="true" />
                {adminStatus.label}
              </div>
            </div>
          ) : null}
        </div>

        {activeTab === "profile" ? (
          <AgentSection
            adminStatus={adminStatus}
            agent={agent}
            setAgent={setAgent}
            chatPrompts={chatPrompts}
            setChatPrompts={setChatPrompts}
            namespaceOptions={namespaceOptions}
            onOpenEmbed={() => setEmbedOpen(true)}
            onSaveAgent={saveAgentProfile}
            onSaveSettings={saveSettings}
            onSavePrompts={saveChatPrompts}
            onUploadAvatar={uploadAvatar}
            saving={busy}
            settings={settings}
            setSettings={setSettings}
          />
        ) : null}

        {activeTab === "settings" ? (
          <SettingsSection
            agent={agent}
            setAgent={setAgent}
            system={system}
            setSystem={setSystem}
            onSaveAgent={saveAgentProfile}
            onSave={saveSettings}
            onSendTestEmail={sendTestEmail}
            saving={busy}
          />
        ) : null}

        {activeTab === "knowledge" ? (
          <KnowledgeSection
            documents={documents}
            onDeleteDocument={deleteDocument}
            onRefresh={() => runTask(loadDocuments, "")}
            onUploadPdf={uploadPdf}
            onRagWebsite={ragWebsite}
            busy={busy}
          />
        ) : null}

        {activeTab === "conversations" ? (
          <ConversationsSection
            conversations={conversations}
            counts={conversationCounts}
            filter={conversationFilter}
            setFilter={setConversationFilter}
            onGeolocate={geolocateConversations}
            onRefresh={() => runTask(loadConversations, "")}
            onSave={saveConversation}
            onDelete={deleteConversation}
            mapboxToken={system.mapboxToken || ""}
            busy={busy}
          />
        ) : null}
      </main>

      {embedOpen ? (
        <EmbedModal
          agent={agent}
          onClose={() => setEmbedOpen(false)}
          onToast={showToast}
        />
      ) : null}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
