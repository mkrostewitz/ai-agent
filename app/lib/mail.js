import crypto from "crypto";

import nodemailer from "nodemailer";

import {getStoredMailConfig} from "./appConfig";

const PROVIDER_ALIASES = {
  "apple-mail": "apple",
  icloud: "apple",
  google: "gmail",
  googlemail: "gmail",
  microsoft365: "microsoft",
  "microsoft-365": "microsoft",
  office365: "microsoft",
  "office-365": "microsoft",
  outlook: "microsoft",
};

const PROVIDER_PRESETS = {
  apple: {
    label: "Apple iCloud Mail",
    host: "smtp.mail.me.com",
    port: 587,
    secure: false,
  },
  gmail: {
    label: "Gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
  },
  microsoft: {
    label: "Microsoft 365 / Outlook",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
  },
  custom: {
    label: "Custom SMTP",
    port: 587,
    secure: false,
  },
};

let cachedTransport = null;
let cachedTransportKey = "";

function cleanString(value) {
  return String(value || "").trim();
}

function firstValue(...values) {
  return values.map(cleanString).find(Boolean) || "";
}

function normalizeProvider(value) {
  const provider = cleanString(value || "apple")
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  return PROVIDER_ALIASES[provider] || provider || "apple";
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  const text = cleanString(value).toLowerCase();
  if (!text) return fallback;
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function parseInteger(value, fallback, min, max) {
  const text = cleanString(value);
  if (!text) return fallback;

  const number = Number(text);
  if (!Number.isFinite(number)) return fallback;

  const rounded = Math.round(number);
  return Math.min(Math.max(rounded, min), max);
}

function splitRecipients(value) {
  return cleanString(value)
    .split(/[,\n;]/)
    .map(cleanString)
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getProviderPreset(provider) {
  return PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
}

function hasStoredMailConfig(config) {
  if (!config || typeof config !== "object") return false;

  return [
    "provider",
    "enabled",
    "host",
    "port",
    "fromAddress",
    "fromName",
    "recipients",
    "replyTo",
    "username",
    "smtpPasswordEncrypted",
  ].some((key) => Object.prototype.hasOwnProperty.call(config, key));
}

function getMissingConfigKeys(config) {
  const missing = [];

  if (!config.host) missing.push("SMTP host");
  if (!config.auth.user) missing.push("SMTP username");
  if (!config.auth.pass) missing.push("SMTP password");
  if (!config.from.address) missing.push("From email");
  if (!config.to.length) missing.push("Notification recipient");

  return missing;
}

function getEnvMailConfig() {
  const provider = normalizeProvider(
    firstValue(
      process.env.MAIL_PROVIDER,
      process.env.EMAIL_PROVIDER,
      process.env.SMTP_PROVIDER
    )
  );
  const providerDisabled = ["disabled", "none", "off"].includes(provider);
  const preset = getProviderPreset(provider);
  const host = firstValue(process.env.SMTP_HOST, process.env.MAIL_HOST, preset.host);
  const port = parseInteger(
    firstValue(process.env.SMTP_PORT, process.env.MAIL_PORT),
    preset.port || 587,
    1,
    65535
  );
  const secure = parseBoolean(
    firstValue(process.env.SMTP_SECURE, process.env.MAIL_SECURE),
    typeof preset.secure === "boolean" ? preset.secure : port === 465
  );
  const user = firstValue(
    process.env.SMTP_USER,
    process.env.SMTP_USERNAME,
    process.env.MAIL_USER,
    process.env.EMAIL_USER
  );
  const pass = firstValue(
    process.env.SMTP_PASS,
    process.env.SMTP_PASSWORD,
    process.env.MAIL_PASS,
    process.env.MAIL_PASSWORD,
    process.env.EMAIL_PASSWORD
  );
  const fromAddress = firstValue(
    process.env.MAIL_FROM,
    process.env.EMAIL_FROM,
    process.env.SMTP_FROM,
    user
  );
  const fromName = firstValue(
    process.env.MAIL_FROM_NAME,
    process.env.EMAIL_FROM_NAME,
    "AI Agent"
  );
  const configuredRecipients = splitRecipients(
    firstValue(
      process.env.MAIL_TO,
      process.env.NOTIFICATION_EMAIL_TO,
      process.env.ADMIN_NOTIFICATION_EMAIL,
      process.env.NOTIFICATION_EMAIL
    )
  );
  const to = unique(configuredRecipients.length ? configuredRecipients : [fromAddress]);
  const replyTo = firstValue(process.env.MAIL_REPLY_TO, process.env.EMAIL_REPLY_TO);
  const requireTLS = parseBoolean(
    firstValue(process.env.SMTP_REQUIRE_TLS, process.env.MAIL_REQUIRE_TLS),
    port === 587
  );
  const timeoutMs = parseInteger(
    firstValue(process.env.SMTP_TIMEOUT_MS, process.env.MAIL_TIMEOUT_MS),
    10000,
    1000,
    60000
  );
  const enabled = providerDisabled
    ? false
    : parseBoolean(
        firstValue(
          process.env.MAIL_NOTIFICATIONS_ENABLED,
          process.env.EMAIL_NOTIFICATIONS_ENABLED,
          process.env.CONVERSATION_NOTIFICATION_EMAILS
        ),
        true
      );

  return createResolvedConfig({
    provider,
    providerLabel: providerDisabled ? "Disabled" : preset.label,
    host,
    port,
    secure,
    requireTLS,
    user,
    pass,
    fromAddress,
    fromName,
    to,
    replyTo,
    enabled,
    timeoutMs,
    passwordConfigured: Boolean(pass),
    source: "environment",
  });
}

function getStoredResolvedConfig(stored) {
  const provider = normalizeProvider(stored.provider);
  const providerDisabled = ["disabled", "none", "off"].includes(provider);
  const preset = getProviderPreset(provider);
  const port = parseInteger(stored.port, preset.port || 587, 1, 65535);
  const secure = parseBoolean(
    stored.secure,
    typeof preset.secure === "boolean" ? preset.secure : port === 465
  );
  const fromAddress = cleanString(stored.fromAddress);
  const to = unique(
    Array.isArray(stored.recipients) && stored.recipients.length
      ? stored.recipients.map(cleanString)
      : [fromAddress]
  );

  return createResolvedConfig({
    provider,
    providerLabel: providerDisabled ? "Disabled" : preset.label,
    host: firstValue(stored.host, preset.host),
    port,
    secure,
    requireTLS: parseBoolean(stored.requireTLS, port === 587),
    user: cleanString(stored.username),
    pass: cleanString(stored.smtpPassword),
    fromAddress,
    fromName: firstValue(stored.fromName, "AI Agent"),
    to,
    replyTo: cleanString(stored.replyTo),
    enabled: providerDisabled ? false : parseBoolean(stored.enabled, true),
    timeoutMs: parseInteger(stored.timeoutMs, 10000, 1000, 60000),
    passwordConfigured: Boolean(stored.passwordConfigured),
    source: "database",
  });
}

function createResolvedConfig(input) {
  const config = {
    provider: input.provider,
    providerLabel: input.providerLabel,
    host: input.host,
    port: input.port,
    secure: input.secure,
    requireTLS: input.requireTLS,
    auth: {
      user: input.user,
      pass: input.pass,
    },
    from: {
      address: input.fromAddress,
      name: input.fromName,
    },
    to: input.to,
    replyTo: input.replyTo,
    enabled: input.enabled,
    timeoutMs: input.timeoutMs,
    passwordConfigured: input.passwordConfigured,
    source: input.source,
  };
  const missing = ["disabled", "none", "off"].includes(config.provider)
    ? []
    : getMissingConfigKeys(config);

  return {
    ...config,
    configured: missing.length === 0,
    missing,
  };
}

export async function getMailConfig() {
  const stored = await getStoredMailConfig();
  if (hasStoredMailConfig(stored)) return getStoredResolvedConfig(stored);

  return getEnvMailConfig();
}

function getTransporter(config) {
  const passwordFingerprint = crypto
    .createHash("sha256")
    .update(config.auth.pass || "")
    .digest("hex");
  const key = JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.auth.user,
    pass: passwordFingerprint,
    requireTLS: config.requireTLS,
    timeoutMs: config.timeoutMs,
  });

  if (cachedTransport && cachedTransportKey === key) return cachedTransport;

  cachedTransport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: {
      user: config.auth.user,
      pass: config.auth.pass,
    },
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
    tls: {
      minVersion: "TLSv1.2",
    },
  });
  cachedTransportKey = key;

  return cachedTransport;
}

function mailbox(address, name) {
  if (!name) return address;
  return {address, name};
}

export async function getMailDeliveryStatus() {
  const config = await getMailConfig();

  return {
    provider: config.provider,
    providerLabel: config.providerLabel,
    configured: config.configured,
    enabled: config.enabled,
    active: config.enabled && config.configured,
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    timeoutMs: config.timeoutMs,
    from: config.from.address,
    fromName: config.from.name,
    recipients: config.to,
    replyTo: config.replyTo,
    username: config.auth.user,
    passwordConfigured: config.passwordConfigured,
    source: config.source,
    missing: config.missing,
  };
}

export async function sendMail({to, subject, text, html, replyTo}) {
  const config = await getMailConfig();

  if (!config.enabled) {
    return {ok: false, skipped: true, reason: "disabled"};
  }

  if (!config.configured) {
    return {
      ok: false,
      skipped: true,
      reason: "not_configured",
      missing: config.missing,
    };
  }

  const recipients = Array.isArray(to) ? to.filter(Boolean) : splitRecipients(to);
  const resolvedRecipients = recipients.length ? recipients : config.to;

  if (!resolvedRecipients.length) {
    return {ok: false, skipped: true, reason: "missing_recipient"};
  }

  const info = await getTransporter(config).sendMail({
    from: mailbox(config.from.address, config.from.name),
    to: resolvedRecipients,
    replyTo: replyTo || config.replyTo || undefined,
    subject,
    text,
    html,
  });

  return {
    ok: true,
    messageId: info.messageId,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
  };
}
