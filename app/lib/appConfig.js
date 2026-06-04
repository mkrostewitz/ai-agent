import crypto from "crypto";

import {getDb} from "./mongo";

const CONFIG_COLLECTION = "app_config";
const SECURITY_CONFIG_ID = "security";
const INTEGRATIONS_CONFIG_ID = "integrations";

function cleanString(value) {
  return String(value || "").trim();
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

  if (Object.prototype.hasOwnProperty.call(input, "ipInfoToken")) {
    set.ipInfoToken = cleanString(input.ipInfoToken);
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
