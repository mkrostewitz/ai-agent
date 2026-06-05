import crypto from "crypto";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";

import {
  ensureSecurityConfig,
  getSessionSecret,
  updateIntegrationsConfig,
} from "./appConfig";
import {getDb} from "./mongo";

export const ADMIN_SESSION_COOKIE = "ai_agent_admin_session";

const SESSIONS_COLLECTION = "admin_sessions";
const USERS_COLLECTION = "users";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) return false;

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function signToken(token) {
  const secret = await getSessionSecret();

  if (!secret || secret.length < 32) {
    throw new Error("Admin setup is incomplete.");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(token)
    .digest("base64url");
}

async function encodeSessionCookie(token) {
  return `${token}.${await signToken(token)}`;
}

async function decodeSessionCookie(value) {
  if (!value || !value.includes(".")) return null;

  const [token, signature] = value.split(".");
  if (!token || !signature) return null;

  try {
    if (!timingSafeStringEqual(signature, await signToken(token))) return null;
  } catch {
    return null;
  }

  return token;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

function parseScryptHash(value) {
  const parts = String(value || "").split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const [, keylen, cost, salt, storedKey, digest] = parts;
  return {
    keylen: Number(keylen),
    cost: Number(cost),
    salt,
    storedKey,
    digest,
  };
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const keylen = 64;
  const cost = 16384;
  const digest = "sha512";
  const key = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, {N: cost}, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey.toString("base64url"));
    });
  });

  return `scrypt$${keylen}$${cost}$${salt}$${key}$${digest}`;
}

async function verifyScryptPassword(password, storedHash) {
  const parsed = parseScryptHash(storedHash);
  if (!parsed) return false;

  const key = await new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      parsed.salt,
      parsed.keylen,
      {N: parsed.cost},
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey.toString("base64url"));
      }
    );
  });

  return timingSafeStringEqual(key, parsed.storedKey);
}

function normalizeAdminUser(user) {
  const email = normalizeEmail(user?.email);
  if (!email) return null;

  return {
    email,
    name: user.name || email,
    password: user.password || "",
    passwordHash: user.passwordHash || "",
  };
}

export async function getConfiguredAdmin(email) {
  const requestedEmail = normalizeEmail(email);

  try {
    const db = await getDb();
    const query = requestedEmail
      ? {email: requestedEmail}
      : {
          $or: [
            {_id: "admin"},
            {isAdmin: true},
            {role: "admin"},
            {roles: "admin"},
          ],
        };
    const user = await db.collection(USERS_COLLECTION).findOne(query);
    return normalizeAdminUser(user);
  } catch {
    return null;
  }
}

export async function isSetupComplete() {
  try {
    const db = await getDb();
    const admin = await db.collection(USERS_COLLECTION).findOne({
      $or: [
        {isAdmin: true},
        {role: "admin"},
        {roles: "admin"},
      ],
    });
    const secret = await getSessionSecret();

    return Boolean(admin && secret && secret.length >= 32);
  } catch {
    return false;
  }
}

export async function createInitialSetup(input = {}) {
  const alreadySetup = await isSetupComplete();
  if (alreadySetup) {
    throw new Error("Setup is already complete.");
  }

  const email = normalizeEmail(input.email);
  const firstName = String(input.firstName || "").trim();
  const lastName = String(input.lastName || "").trim();
  const derivedName = [firstName, lastName].filter(Boolean).join(" ");
  const name = String(input.name || derivedName || "").trim() || email;
  const password = String(input.password || "");

  if (!email || !email.includes("@")) {
    throw new Error("A valid admin email is required.");
  }

  if (password.length < 8) {
    throw new Error("Admin password must be at least 8 characters.");
  }

  const db = await getDb();
  const now = new Date();
  const passwordHash = await hashPassword(password);

  await ensureSecurityConfig();
  await db.collection(USERS_COLLECTION).insertOne({
    email,
    firstName,
    lastName,
    name,
    passwordHash,
    isAdmin: true,
    role: "admin",
    roles: ["admin"],
    createdAt: now,
    updatedAt: now,
  });
  await updateIntegrationsConfig({
    ipGeolocationApiKey: String(input.ipGeolocationApiKey || "").trim(),
  });

  return {email, firstName, lastName, name};
}

export async function verifyAdminPassword(password, admin) {
  if (!admin || !password) return false;

  if (admin.passwordHash) {
    return verifyScryptPassword(password, admin.passwordHash);
  }

  if (admin.password) {
    return timingSafeStringEqual(password, admin.password);
  }

  return false;
}

export async function createAdminSession(user) {
  const db = await getDb();
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

  await db.collection(SESSIONS_COLLECTION).insertOne({
    tokenHash: hashToken(token),
    email: user.email,
    name: user.name,
    createdAt: now,
    expiresAt,
  });

  return {token, expiresAt};
}

export async function setSessionCookie(response, token) {
  response.cookies.set(ADMIN_SESSION_COOKIE, await encodeSessionCookie(token), {
    ...sessionCookieOptions(),
    expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  });

  return response;
}

export function clearSessionCookie(response = NextResponse.json({ok: true})) {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}

export async function revokeAdminSessionFromCookie() {
  const cookieStore = cookies();
  const token = await decodeSessionCookie(
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value
  );
  if (!token) return;

  const db = await getDb();
  await db
    .collection(SESSIONS_COLLECTION)
    .deleteOne({tokenHash: hashToken(token)});
}

export async function getCurrentAdminUser() {
  const cookieStore = cookies();
  const token = await decodeSessionCookie(
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value
  );
  if (!token) return null;

  const db = await getDb();
  const session = await db.collection(SESSIONS_COLLECTION).findOne({
    tokenHash: hashToken(token),
    expiresAt: {$gt: new Date()},
  });

  if (!session) return null;

  return {
    email: session.email,
    name: session.name || session.email,
  };
}

export async function requireAdmin() {
  return getCurrentAdminUser();
}

export function isSameOriginRequest(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const host = request.headers.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function unauthorizedResponse() {
  return NextResponse.json({error: "Unauthorized"}, {status: 401});
}

export async function requireAdminApi(request) {
  if (!isSameOriginRequest(request)) {
    return {
      error: NextResponse.json({error: "Invalid request origin."}, {status: 403}),
    };
  }

  const user = await requireAdmin();
  if (!user) return {error: unauthorizedResponse()};

  return {user};
}
