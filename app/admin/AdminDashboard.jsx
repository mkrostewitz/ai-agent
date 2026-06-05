"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {
  FiCheck,
  FiChevronDown,
  FiCode,
  FiCopy,
  FiCpu,
  FiDatabase,
  FiExternalLink,
  FiMapPin,
  FiMessageSquare,
  FiPlus,
  FiRefreshCw,
  FiSave,
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
  ipInfoConfigured: false,
  ipInfoTokenPreview: "",
  ipInfoToken: "",
  clearIpInfoToken: false,
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

function normalizeLocation(tracking = {}) {
  return (
    tracking.address ||
    [tracking.city, tracking.state, tracking.country].filter(Boolean).join(", ") ||
    tracking.countryCode ||
    "Unknown"
  );
}

function mapUrl(tracking = {}) {
  const latitude = Number(tracking.latitude);
  const longitude = Number(tracking.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";

  const delta = 0.08;
  const bbox = [
    longitude - delta,
    latitude - delta,
    longitude + delta,
    latitude + delta,
  ].join(",");

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox
  )}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

function Toast({toast, onClose}) {
  if (!toast) return null;

  return (
    <button
      type="button"
      className={`${styles.toast} ${
        toast.type === "error" ? styles.toastError : styles.toastSuccess
      }`}
      onClick={onClose}
    >
      {toast.message}
    </button>
  );
}

function Stat({label, value}) {
  return (
    <div className={styles.stat}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
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

function AgentSection({
  agent,
  setAgent,
  chatPrompts,
  setChatPrompts,
  onOpenEmbed,
  onSaveAgent,
  onSavePrompts,
  onUploadAvatar,
  saving,
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

  return (
    <section className={styles.agentWorkspace}>
      <div className={styles.panelHeader}>
        <div className={styles.titleBlock}>
          <h1>Agent</h1>
        </div>
      </div>

      <div className={styles.agentSectionStack}>
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
      </div>
    </section>
  );
}

function SettingsSection({
  namespaceOptions,
  settings,
  setSettings,
  system,
  setSystem,
  onSave,
  saving,
}) {
  const isIpInfoConnected =
    Boolean(system.ipInfoConfigured) && !system.clearIpInfoToken;
  const showIpInfoTokenField =
    !system.ipInfoConfigured ||
    Boolean(system.clearIpInfoToken) ||
    Boolean(system.ipInfoToken?.trim());
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
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.titleBlock}>
          <h1>Agent Settings</h1>
        </div>
        <button className={styles.primaryButton} onClick={onSave} disabled={saving}>
          <FiSave aria-hidden="true" />
          {saving ? "Saving..." : "Save"}
        </button>
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

      <div className={styles.integrationPanel}>
        <div className={styles.integrationHeader}>
          <div className={styles.titleBlock}>
            <h2>IPInfo</h2>
            <p>
              {isIpInfoConnected
                ? `Token ${system.ipInfoTokenPreview || "configured"}`
                : "Add a token to enrich conversations with location data."}
            </p>
          </div>
          <span
            className={`${styles.connectionChip} ${
              isIpInfoConnected
                ? styles.connectionChipConnected
                : styles.connectionChipDisconnected
            }`}
          >
            {isIpInfoConnected ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className={styles.ipInfoControls}>
          {showIpInfoTokenField ? (
            <label className={`${styles.field} ${styles.ipInfoTokenField}`}>
              Token
              <input
                value={system.ipInfoToken || ""}
                onChange={(event) =>
                  setSystem((current) => ({
                    ...current,
                    ipInfoToken: event.target.value,
                    clearIpInfoToken: false,
                  }))
                }
                autoComplete="off"
                placeholder="Optional IPInfo token"
              />
            </label>
          ) : (
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() =>
                setSystem((current) => ({
                  ...current,
                  clearIpInfoToken: true,
                  ipInfoToken: "",
                }))
              }
            >
              <FiTrash2 aria-hidden="true" />
              Disconnect
            </button>
          )}
        </div>
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
  onRefresh,
  onSave,
  onDelete,
  busy,
}) {
  const [activeId, setActiveId] = useState("");
  const [statusDraft, setStatusDraft] = useState("open");
  const [notesDraft, setNotesDraft] = useState("");
  const [actionDraft, setActionDraft] = useState("");
  const activeConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === activeId) ||
      conversations[0] ||
      null,
    [activeId, conversations]
  );
  const activeMapUrl = mapUrl(activeConversation?.tracking || {});

  useEffect(() => {
    if (!activeConversation) return;
    setActiveId(activeConversation.id);
    setStatusDraft(activeConversation.status || "open");
    setNotesDraft(activeConversation.notes || "");
    setActionDraft("");
  }, [activeConversation]);

  async function saveActive() {
    if (!activeConversation) return;
    await onSave(activeConversation.id, {
      status: statusDraft,
      notes: notesDraft,
      actionText: actionDraft,
    });
    setActionDraft("");
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.titleBlock}>
          <h1>Conversations</h1>
        </div>
        <button className={styles.ghostButton} onClick={onRefresh} disabled={busy}>
          <FiRefreshCw aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className={styles.statsGrid}>
        <Stat label="open" value={counts.open || 0} />
        <Stat label="reviewing" value={counts.reviewing || 0} />
        <Stat label="qualified" value={counts.qualified || 0} />
        <Stat label="closed" value={counts.closed || 0} />
      </div>

      <div className={styles.filterRow}>
        <SelectField
          label="Status"
          options={CONVERSATION_STATUSES}
          value={filter.status}
          onChange={(status) =>
            setFilter((current) => ({...current, status}))
          }
        />
        <label className={styles.field}>
          Search
          <input
            value={filter.q}
            onChange={(event) =>
              setFilter((current) => ({...current, q: event.target.value}))
            }
          />
        </label>
      </div>

      <div className={styles.conversationWorkspace}>
        <div className={styles.conversationList}>
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`${styles.conversationItem} ${
                activeConversation?.id === conversation.id
                  ? styles.conversationItemActive
                  : ""
              }`}
              onClick={() => setActiveId(conversation.id)}
            >
              <strong>
                {conversation.user?.name ||
                  conversation.user?.email ||
                  conversation.conversation_id}
              </strong>
              <span>{conversation.preview || "No messages"}</span>
              <small>
                {conversation.status} · {formatDateTime(conversation.updated_at)}
              </small>
            </button>
          ))}
          {conversations.length === 0 ? (
            <div className={styles.emptyState}>No conversations found.</div>
          ) : null}
        </div>

        <div className={styles.conversationDetail}>
          {activeConversation ? (
            <>
              <div className={styles.detailHeader}>
                <div>
                  <h2>
                    {activeConversation.user?.name ||
                      activeConversation.user?.email ||
                      "Conversation"}
                  </h2>
                  <p>
                    {activeConversation.user?.email || "No email"} ·{" "}
                    {activeConversation.user?.phone || "No phone"}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.iconDangerButton}
                  title="Delete"
                  onClick={() => onDelete(activeConversation.id)}
                >
                  <FiTrash2 aria-hidden="true" />
                </button>
              </div>

              <div className={styles.locationBand}>
                <FiMapPin aria-hidden="true" />
                <span>{normalizeLocation(activeConversation.tracking)}</span>
                <small>{activeConversation.tracking?.ip || "No IP"}</small>
              </div>

              {activeMapUrl ? (
                <iframe
                  className={styles.mapFrame}
                  src={activeMapUrl}
                  title="Conversation location map"
                  loading="lazy"
                />
              ) : (
                <div className={styles.mapPlaceholder}>No map coordinates.</div>
              )}

              <div className={styles.formGridCompact}>
                <SelectField
                  label="Status"
                  options={CONVERSATION_STATUSES.filter((status) => status.value)}
                  value={statusDraft}
                  onChange={setStatusDraft}
                />
                <label className={styles.field}>
                  Notes
                  <textarea
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  Action
                  <textarea
                    value={actionDraft}
                    onChange={(event) => setActionDraft(event.target.value)}
                  />
                </label>
              </div>

              <button className={styles.primaryButton} onClick={saveActive} disabled={busy}>
                <FiSave aria-hidden="true" />
                Save conversation
              </button>

              <div className={styles.messageList}>
                {activeConversation.messages.map((message, index) => (
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
              </div>

              {activeConversation.actions?.length ? (
                <div className={styles.actionList}>
                  <h2>Actions</h2>
                  {activeConversation.actions.map((action, index) => (
                    <div key={`${action.createdAt}-${index}`} className={styles.actionItem}>
                      <strong>{formatDateTime(action.createdAt)}</strong>
                      <span>{action.text}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.emptyState}>Select a conversation.</div>
          )}
        </div>
      </div>
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
      const systemPayload = {};

      if (system.ipInfoToken?.trim()) {
        systemPayload.ipInfoToken = system.ipInfoToken;
      } else if (system.clearIpInfoToken) {
        systemPayload.clearIpInfoToken = true;
      }

      const systemData = Object.keys(systemPayload).length
        ? await fetchJson("/api/admin/system", {
            method: "PUT",
            body: JSON.stringify(systemPayload),
          })
        : {integrations: system};

      setSettings({
        ...DEFAULT_SETTINGS,
        ...(data.settings || {}),
        response_language: "",
      });
      setSystem({...DEFAULT_SYSTEM, ...(systemData.integrations || {})});
    }, "Settings saved.");
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
        </div>

        {activeTab === "profile" ? (
          <AgentSection
            agent={agent}
            setAgent={setAgent}
            chatPrompts={chatPrompts}
            setChatPrompts={setChatPrompts}
            onOpenEmbed={() => setEmbedOpen(true)}
            onSaveAgent={saveAgentProfile}
            onSavePrompts={saveChatPrompts}
            onUploadAvatar={uploadAvatar}
            saving={busy}
          />
        ) : null}

        {activeTab === "settings" ? (
          <SettingsSection
            namespaceOptions={namespaceOptions}
            settings={settings}
            setSettings={setSettings}
            system={system}
            setSystem={setSystem}
            onSave={saveSettings}
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
            onRefresh={() => runTask(loadConversations, "")}
            onSave={saveConversation}
            onDelete={deleteConversation}
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
