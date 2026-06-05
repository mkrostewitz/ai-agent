import crypto from "crypto";
import {mkdir, unlink, writeFile} from "fs/promises";
import path from "path";

const DEFAULT_PUBLIC_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const DEFAULT_PRIVATE_UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");
const DEFAULT_SPACES_REGION = "fra1";

function envValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function normalizeDriver(value) {
  const driver = String(value || "local")
    .trim()
    .toLowerCase();

  if (["digitalocean", "digitalocean-spaces", "do-spaces", "spaces", "s3"].includes(driver)) {
    return "spaces";
  }

  return "local";
}

function cleanSegment(value, fallback = "file") {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return cleaned || fallback;
}

function cleanKeyPath(value) {
  return String(value || "")
    .split(/[\\/]+/)
    .map((segment) => cleanSegment(segment, ""))
    .filter(Boolean)
    .join("/");
}

function normalizeExtension(value) {
  return String(value || "")
    .replace(/^\./, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function buildStoredFileName(originalName, extension) {
  const parsed = path.parse(String(originalName || "upload"));
  const baseName = cleanSegment(parsed.name, "upload");
  const ext = normalizeExtension(extension || parsed.ext || "bin") || "bin";

  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${baseName}.${ext}`;
}

function localPublicRoot() {
  return envValue("LOCAL_PUBLIC_UPLOAD_DIR") || DEFAULT_PUBLIC_UPLOAD_DIR;
}

function localPrivateRoot() {
  return envValue("LOCAL_PRIVATE_UPLOAD_DIR") || DEFAULT_PRIVATE_UPLOAD_DIR;
}

function resolveLocalPath(root, key) {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(rootPath, key);

  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error("Invalid storage key.");
  }

  return targetPath;
}

function encodeKey(key) {
  return String(key)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function amzDates(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");

  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function normalizeEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  return raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw}`;
}

function getSpacesConfig() {
  const region = envValue("DIGITALOCEAN_SPACES_REGION", "DO_SPACES_REGION") || DEFAULT_SPACES_REGION;
  const endpoint =
    normalizeEndpoint(envValue("DIGITALOCEAN_SPACES_ENDPOINT", "DO_SPACES_ENDPOINT")) ||
    `https://${region}.digitaloceanspaces.com`;

  return {
    accessKey: envValue(
      "DIGITALOCEAN_SPACES_KEY",
      "DIGITALOCEAN_SPACES_ACCESS_KEY_ID",
      "DO_SPACES_KEY",
      "DO_SPACES_ACCESS_KEY_ID"
    ),
    bucket: envValue("DIGITALOCEAN_SPACES_BUCKET", "DO_SPACES_BUCKET"),
    endpoint,
    publicBaseUrl: envValue("DIGITALOCEAN_SPACES_PUBLIC_URL", "DO_SPACES_PUBLIC_URL"),
    region,
    secretKey: envValue(
      "DIGITALOCEAN_SPACES_SECRET",
      "DIGITALOCEAN_SPACES_SECRET_ACCESS_KEY",
      "DO_SPACES_SECRET",
      "DO_SPACES_SECRET_ACCESS_KEY"
    ),
  };
}

function assertSpacesConfig(config) {
  if (!config.accessKey || !config.secretKey || !config.bucket || !config.region) {
    throw new Error(
      "Missing DigitalOcean Spaces config. Set DIGITALOCEAN_SPACES_KEY, DIGITALOCEAN_SPACES_SECRET, DIGITALOCEAN_SPACES_BUCKET, and DIGITALOCEAN_SPACES_REGION."
    );
  }
}

function objectUrlForSpaces(config, key) {
  const endpoint = new URL(config.endpoint);
  return new URL(`/${encodeKey(key)}`, `${endpoint.protocol}//${config.bucket}.${endpoint.host}`).toString();
}

function publicUrlForSpaces(config, key) {
  if (!config.publicBaseUrl) return objectUrlForSpaces(config, key);

  return `${config.publicBaseUrl.replace(/\/+$/, "")}/${encodeKey(key)}`;
}

function signedHeaders(headers) {
  const entries = Object.entries(headers)
    .map(([name, value]) => [
      name.toLowerCase(),
      String(value)
        .trim()
        .replace(/\s+/g, " "),
    ])
    .sort(([left], [right]) => left.localeCompare(right));

  return {
    canonicalHeaders: entries.map(([name, value]) => `${name}:${value}\n`).join(""),
    signedHeaderNames: entries.map(([name]) => name).join(";"),
  };
}

function signSpacesRequest({config, headers, method, payloadHash, url}) {
  const {amzDate, dateStamp} = amzDates();
  headers["x-amz-date"] = amzDate;

  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const {canonicalHeaders, signedHeaderNames} = signedHeaders(headers);
  const canonicalRequest = [
    method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaderNames,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(`AWS4${config.secretKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = hmac(signingKey, stringToSign, "hex");

  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`;
}

async function requestSpacesObject({body, contentType, key, method, visibility}) {
  const config = getSpacesConfig();
  assertSpacesConfig(config);

  const url = new URL(objectUrlForSpaces(config, key));
  const payloadHash = sha256Hex(body || "");
  const headers = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
  };

  if (method === "PUT") {
    headers["content-type"] = contentType || "application/octet-stream";
    if (visibility === "public") headers["x-amz-acl"] = "public-read";
  }

  signSpacesRequest({config, headers, method, payloadHash, url});

  const response = await fetch(url, {
    body: method === "PUT" ? body : undefined,
    headers,
    method,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `DigitalOcean Spaces ${method} failed (${response.status}). ${detail.slice(0, 300)}`
    );
  }

  return config;
}

export function storageDriver() {
  return normalizeDriver(envValue("FILE_STORAGE_DRIVER", "STORAGE_DRIVER"));
}

export function storageStatus() {
  const driver = storageDriver();
  const spaces = getSpacesConfig();

  return {
    driver,
    localPrivateDir: localPrivateRoot(),
    localPublicDir: localPublicRoot(),
    spaces: {
      bucket: spaces.bucket,
      configured: Boolean(
        spaces.accessKey && spaces.secretKey && spaces.bucket && spaces.region
      ),
      endpoint: spaces.endpoint,
      publicUrlConfigured: Boolean(spaces.publicBaseUrl),
      region: spaces.region,
    },
  };
}

export async function storeBuffer({
  buffer,
  contentType,
  directory,
  extension,
  originalName,
  visibility = "private",
}) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const keyPrefix = cleanKeyPath(envValue("FILE_STORAGE_PREFIX", "STORAGE_PREFIX"));
  const safeDirectory = cleanKeyPath(directory);
  const filename = buildStoredFileName(originalName, extension);
  const key = [keyPrefix, safeDirectory, filename].filter(Boolean).join("/");
  const driver = storageDriver();
  const normalizedVisibility = visibility === "public" ? "public" : "private";

  if (driver === "spaces") {
    const config = await requestSpacesObject({
      body: bytes,
      contentType,
      key,
      method: "PUT",
      visibility: normalizedVisibility,
    });

    return {
      bucket: config.bucket,
      driver,
      key,
      url: normalizedVisibility === "public" ? publicUrlForSpaces(config, key) : "",
      visibility: normalizedVisibility,
    };
  }

  const root =
    normalizedVisibility === "public" ? localPublicRoot() : localPrivateRoot();
  const targetPath = resolveLocalPath(root, key);

  await mkdir(path.dirname(targetPath), {recursive: true});
  await writeFile(targetPath, bytes, {flag: "wx"});

  return {
    driver,
    key,
    path: targetPath,
    url: normalizedVisibility === "public" ? `/uploads/${encodeKey(key)}` : "",
    visibility: normalizedVisibility,
  };
}

export async function deleteStoredObject(storedObject = {}) {
  const driver = normalizeDriver(storedObject.driver);
  const key = cleanKeyPath(storedObject.key);
  if (!key) return false;

  if (driver === "spaces") {
    await requestSpacesObject({key, method: "DELETE"});
    return true;
  }

  const visibility = storedObject.visibility === "public" ? "public" : "private";
  const root = visibility === "public" ? localPublicRoot() : localPrivateRoot();
  const targetPath = resolveLocalPath(root, key);

  try {
    await unlink(targetPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
