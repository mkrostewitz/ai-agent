import {isIP} from "node:net";

import {getIpInfoToken as getStoredIpInfoToken} from "./appConfig";

const IPINFO_LITE_ENDPOINT = "https://api.ipinfo.io/lite";
const IPINFO_LOOKUP_ENDPOINT = "https://api.ipinfo.io/lookup";
const IPINFO_TIMEOUT_MS = 2000;

const IP_HEADER_NAMES = [
  "x-site-client-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "x-real-ip",
  "x-nf-client-connection-ip",
  "x-client-ip",
  "fastly-client-ip",
];

const COUNTRY_HEADER_NAMES = [
  "x-site-geo-country-code",
  "x-vercel-ip-country",
  "cf-ipcountry",
  "cloudfront-viewer-country",
  "x-country-code",
  "x-country",
  "x-nf-geo-country",
  "x-appengine-country",
  "x-geo-country",
  "fastly-client-country-code",
];

const UNKNOWN_COUNTRY_CODES = new Set(["T1", "XX", "ZZ"]);

function cleanString(value) {
  return String(value || "").trim();
}

function firstString(...values) {
  for (const value of values) {
    const text = cleanString(value);
    if (text) return text;
  }

  return "";
}

function normalizeCountryCode(value) {
  const code = cleanString(value).toUpperCase();
  return /^[A-Z]{2}$/.test(code) && !UNKNOWN_COUNTRY_CODES.has(code) ? code : "";
}

export async function getIpInfoToken() {
  return getStoredIpInfoToken();
}

export function normalizeIp(value) {
  let ip = cleanString(value).replace(/^"|"$/g, "");

  if (!ip || ip.toLowerCase() === "unknown") return null;

  if (ip.startsWith("[") && ip.includes("]")) {
    ip = ip.slice(1, ip.indexOf("]"));
  }

  const ipv4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4WithPort) {
    ip = ipv4WithPort[1];
  }

  return isIP(ip) ? ip : null;
}

export function isPrivateIp(ip) {
  if (!ip) return true;

  if (ip.startsWith("::ffff:")) {
    return isPrivateIp(ip.slice(7));
  }

  if (isIP(ip) === 4) {
    const [first, second] = ip.split(".").map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

export function getClientIp(request) {
  for (const headerName of IP_HEADER_NAMES) {
    const headerValue = request.headers.get(headerName);
    if (!headerValue) continue;

    const candidates = headerValue.split(",");
    for (const candidate of candidates) {
      const ip = normalizeIp(candidate);
      if (ip && !isPrivateIp(ip)) return ip;
    }
  }

  const requestIp = normalizeIp(request.ip);
  if (requestIp && !isPrivateIp(requestIp)) return requestIp;

  return null;
}

export function getCountryCodeFromHeaders(request) {
  for (const headerName of COUNTRY_HEADER_NAMES) {
    const countryCode = normalizeCountryCode(request.headers.get(headerName));

    if (countryCode) return countryCode;
  }

  return "";
}

function parseIpInfoCoordinates(ipInfo = {}) {
  const data = ipInfo || {};
  const geo = data.geo || {};
  const latitude = firstString(geo.latitude, data.latitude);
  const longitude = firstString(geo.longitude, data.longitude);

  if (latitude || longitude) {
    return {latitude, longitude};
  }

  const loc = cleanString(geo.loc || data.loc);
  const [locLatitude, locLongitude] = loc.split(",").map((part) => part?.trim());

  return {
    latitude: locLatitude || "",
    longitude: locLongitude || "",
  };
}

async function fetchIpInfoEndpoint(endpoint, ip, token) {
  if (!ip || !token) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IPINFO_TIMEOUT_MS);

  try {
    const url = new URL(`${endpoint}/${ip}`);
    url.searchParams.set("token", token);

    const response = await fetch(url, {
      cache: "no-store",
      headers: {Accept: "application/json"},
      signal: controller.signal,
    });

    if (!response.ok) return null;

    return response.json().catch(() => null);
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeIpInfoGeo(ipInfo = {}) {
  const data = ipInfo || {};
  const geo = data.geo || {};
  const countryCode = normalizeCountryCode(
    geo.country_code ||
      data.country_code ||
      (/^[a-z]{2}$/i.test(cleanString(geo.country)) ? geo.country : "") ||
      (/^[a-z]{2}$/i.test(cleanString(data.country)) ? data.country : "")
  );
  const coordinates = parseIpInfoCoordinates(data);

  return {
    country: firstString(
      geo.country,
      data.country_name,
      /^[a-z]{2}$/i.test(cleanString(data.country)) ? "" : data.country,
      countryCode
    ),
    countryCode,
    state: firstString(geo.region, data.region),
    stateCode: firstString(geo.region_code, data.region_code),
    city: firstString(geo.city, data.city),
    postalCode: firstString(
      geo.postal_code,
      geo.postalCode,
      data.postal_code,
      data.postalCode,
      data.postal
    ),
    timezone: firstString(geo.timezone, data.timezone),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
}

export async function fetchIpInfoGeo(ip, token) {
  const resolvedToken = token || (await getIpInfoToken());
  const lookupInfo = await fetchIpInfoEndpoint(
    IPINFO_LOOKUP_ENDPOINT,
    ip,
    resolvedToken
  ).catch(() => null);
  const lookupGeo = normalizeIpInfoGeo(lookupInfo);

  if (lookupGeo.country || lookupGeo.countryCode || lookupGeo.state) {
    return {...lookupGeo, source: "ipinfo-lookup"};
  }

  const liteInfo = await fetchIpInfoEndpoint(
    IPINFO_LITE_ENDPOINT,
    ip,
    resolvedToken
  ).catch(() => null);
  const liteGeo = normalizeIpInfoGeo(liteInfo);

  if (liteGeo.country || liteGeo.countryCode) {
    return {...liteGeo, source: "ipinfo-lite"};
  }

  return null;
}

export async function getRequestTracking(request) {
  const ip = getClientIp(request);
  const headerCountryCode = getCountryCodeFromHeaders(request);
  const geo = ip ? await fetchIpInfoGeo(ip) : null;

  return {
    ip,
    userAgent: request.headers.get("user-agent") || "",
    referrer: request.headers.get("referer") || "",
    countryCode: geo?.countryCode || headerCountryCode || "",
    country: geo?.country || "",
    state: geo?.state || "",
    stateCode: geo?.stateCode || "",
    city: geo?.city || "",
    postalCode: geo?.postalCode || "",
    latitude: geo?.latitude || "",
    longitude: geo?.longitude || "",
    timezone: geo?.timezone || "",
    locationSource: geo?.source || (headerCountryCode ? "headers" : ""),
    capturedAt: new Date().toISOString(),
  };
}
