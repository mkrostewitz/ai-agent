import crypto from "crypto";

import {getDb} from "./mongo";

const CONFIG_COLLECTION = "app_config";
const SECURITY_CONFIG_ID = "security";
const INTEGRATIONS_CONFIG_ID = "integrations";
const SECRET_CIPHER_VERSION = "enc:v1";
const SECRET_AAD = "ai-agent:app-config-secret";

function cleanString(value) {
  return String(value || "").trim();
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function cleanStringArray(value) {
  const values = Array.isArray(value)
    ? value
    : cleanString(value).split(/[,\n;]/);

  return [...new Set(values.map(cleanString).filter(Boolean))];
}

function finiteInteger(value, fallback, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;

  const min = Number.isFinite(options.min) ? options.min : -Infinity;
  const max = Number.isFinite(options.max) ? options.max : Infinity;
  return Math.min(Math.max(Math.round(number), min), max);
}

function booleanValue(value, fallback = false) {
  if (typeof value === "boolean") return value;

  const text = cleanString(value).toLowerCase();
  if (!text) return fallback;
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

export async function getSecurityConfig() {
  const db = await getDb();
  return db.collection(CONFIG_COLLECTION).findOne({_id: SECURITY_CONFIG_ID});
}

export async function ensureSecurityConfig() {
  const existing = await getSecurityConfig();
  if (existing?.sessionSecret) return existing;

  const db = await getDb();
  const now = new Date();
  const sessionSecret = crypto.randomBytes(48).toString("base64url");

  await db.collection(CONFIG_COLLECTION).updateOne(
    {_id: SECURITY_CONFIG_ID},
    {
      $setOnInsert: {
        _id: SECURITY_CONFIG_ID,
        sessionSecret,
        createdAt: now,
      },
      $set: {
        updatedAt: now,
      },
    },
    {upsert: true}
  );

  return getSecurityConfig();
}

async function ensureEncryptionSecret() {
  const envSecret = cleanString(
    process.env.APP_ENCRYPTION_KEY || process.env.MAIL_ENCRYPTION_KEY
  );
  if (envSecret) return envSecret;

  const existing = await ensureSecurityConfig();
  if (existing?.encryptionSecret) return cleanString(existing.encryptionSecret);

  const db = await getDb();
  const now = new Date();
  const encryptionSecret = crypto.randomBytes(48).toString("base64url");

  await db.collection(CONFIG_COLLECTION).updateOne(
    {_id: SECURITY_CONFIG_ID, encryptionSecret: {$exists: false}},
    {
      $set: {
        encryptionSecret,
        updatedAt: now,
      },
    }
  );

  const config = await getSecurityConfig();
  return cleanString(config?.encryptionSecret || encryptionSecret);
}

async function getSecretKey() {
  const secret = await ensureEncryptionSecret();

  if (!secret || secret.length < 16) {
    throw new Error("Secret encryption key is not configured.");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

export async function encryptSecret(value) {
  const text = cleanString(value);
  if (!text) return "";

  const key = await getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(SECRET_AAD));

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    SECRET_CIPHER_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export async function decryptSecret(value) {
  const payload = cleanString(value);
  if (!payload) return "";

  const [prefix, version, iv, tag, encrypted] = payload.split(":");
  if (`${prefix}:${version}` !== SECRET_CIPHER_VERSION || !iv || !tag || !encrypted) {
    return "";
  }

  try {
    const key = await getSecretKey();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url")
    );
    decipher.setAAD(Buffer.from(SECRET_AAD));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

export async function getSessionSecret() {
  const config = await getSecurityConfig();
  return cleanString(config?.sessionSecret);
}

export async function getIntegrationsConfig() {
  const db = await getDb();
  return db.collection(CONFIG_COLLECTION).findOne({_id: INTEGRATIONS_CONFIG_ID});
}

export async function updateIntegrationsConfig(input = {}) {
  const db = await getDb();
  const now = new Date();
  const set = {updatedAt: now};

  if (hasOwn(input, "ipInfoToken")) {
    set.ipInfoToken = cleanString(input.ipInfoToken);
  }

  if (input.mail && typeof input.mail === "object" && !Array.isArray(input.mail)) {
    const existing = await getIntegrationsConfig();
    const currentMail = existing?.mail || {};
    const nextMail = {
      ...currentMail,
      updatedAt: now,
    };
    const mail = input.mail;

    if (hasOwn(mail, "provider")) {
      nextMail.provider = cleanString(mail.provider).toLowerCase() || "apple";
    }

    if (hasOwn(mail, "enabled")) {
      nextMail.enabled = booleanValue(mail.enabled, true);
    }

    if (hasOwn(mail, "host")) {
      nextMail.host = cleanString(mail.host);
    }

    if (hasOwn(mail, "port")) {
      nextMail.port = finiteInteger(mail.port, 587, {min: 1, max: 65535});
    }

    if (hasOwn(mail, "secure")) {
      nextMail.secure = booleanValue(mail.secure, false);
    }

    if (hasOwn(mail, "requireTLS")) {
      nextMail.requireTLS = booleanValue(mail.requireTLS, true);
    }

    if (hasOwn(mail, "timeoutMs")) {
      nextMail.timeoutMs = finiteInteger(mail.timeoutMs, 10000, {
        min: 1000,
        max: 60000,
      });
    }

    if (hasOwn(mail, "fromName")) {
      nextMail.fromName = cleanString(mail.fromName);
    }

    if (hasOwn(mail, "from")) {
      nextMail.fromAddress = cleanString(mail.from);
    }

    if (hasOwn(mail, "fromAddress")) {
      nextMail.fromAddress = cleanString(mail.fromAddress);
    }

    if (hasOwn(mail, "recipients")) {
      nextMail.recipients = cleanStringArray(mail.recipients);
    }

    if (hasOwn(mail, "replyTo")) {
      nextMail.replyTo = cleanString(mail.replyTo);
    }

    if (hasOwn(mail, "username")) {
      nextMail.username = cleanString(mail.username);
    }

    if (mail.clearSmtpPassword) {
      delete nextMail.smtpPasswordEncrypted;
      delete nextMail.smtpPasswordUpdatedAt;
    } else if (hasOwn(mail, "smtpPassword") && cleanString(mail.smtpPassword)) {
      nextMail.smtpPasswordEncrypted = await encryptSecret(mail.smtpPassword);
      nextMail.smtpPasswordUpdatedAt = now;
    }

    set.mail = nextMail;
  }

  await db.collection(CONFIG_COLLECTION).updateOne(
    {_id: INTEGRATIONS_CONFIG_ID},
    {
      $setOnInsert: {
        _id: INTEGRATIONS_CONFIG_ID,
        createdAt: now,
      },
      $set: set,
    },
    {upsert: true}
  );

  return getIntegrationsConfig();
}

export async function getIpInfoToken() {
  const config = await getIntegrationsConfig();
  return cleanString(config?.ipInfoToken);
}

export async function getStoredMailConfig() {
  const config = await getIntegrationsConfig();
  const mail = config?.mail || null;
  if (!mail) return null;

  const smtpPassword = mail.smtpPasswordEncrypted
    ? await decryptSecret(mail.smtpPasswordEncrypted)
    : "";

  return {
    ...mail,
    smtpPassword,
    passwordConfigured: Boolean(mail.smtpPasswordEncrypted),
  };
}
