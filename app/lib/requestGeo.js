import {isIP} from "node:net";

import {getIpGeolocationApiKey as getStoredIpGeolocationApiKey} from "./appConfig";

const IPGEOLOCATION_ENDPOINT = "https://api.ipgeolocation.io/v3/ipgeo";
const IPGEOLOCATION_TIMEOUT_MS = 2500;

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
  return value === null || value === undefined ? "" : String(value).trim();
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

export async function getIpGeolocationApiKey() {
  return getStoredIpGeolocationApiKey().catch(() => "");
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

function parseCoordinate(value, min, max) {
  const text = cleanString(value);
  if (!text) return null;

  const normalized = text.includes(".") ? text : text.replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;

  const coordinate = Number(normalized);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : null;
}

function isZeroCoordinatePair(latitude, longitude) {
  return Math.abs(latitude) < 0.000001 && Math.abs(longitude) < 0.000001;
}

function serializeCoordinate(coordinate) {
  return Number(coordinate.toFixed(6));
}

function parseCoordinatePair(latitudeValue, longitudeValue) {
  const latitude = parseCoordinate(latitudeValue, -90, 90);
  const longitude = parseCoordinate(longitudeValue, -180, 180);

  if (latitude === null || longitude === null) return null;
  if (isZeroCoordinatePair(latitude, longitude)) return null;

  return {
    latitude: serializeCoordinate(latitude),
    longitude: serializeCoordinate(longitude),
  };
}

function normalizeBoolean(value) {
  return typeof value === "boolean" ? value : "";
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeIpGeolocationGeo(ipGeo = {}) {
  const data = ipGeo || {};
  const location = data.location || {};
  const timeZone = data.time_zone || {};
  const countryMetadata = data.country_metadata || {};
  const currency = data.currency || {};
  const asn = data.asn || {};
  const company = data.company || {};
  const network = data.network || {};
  const coordinates = parseCoordinatePair(
    location.latitude,
    location.longitude
  );

  return {
    hostname: firstString(data.hostname),
    country: firstString(location.country_name),
    countryCode: normalizeCountryCode(location.country_code2),
    countryCode3: firstString(location.country_code3),
    countryOfficialName: firstString(location.country_name_official),
    countryCapital: firstString(location.country_capital),
    continentCode: firstString(location.continent_code),
    continent: firstString(location.continent_name),
    state: firstString(location.state_prov),
    stateCode: firstString(location.state_code),
    district: firstString(location.district),
    city: firstString(location.city),
    locality: firstString(location.locality),
    accuracyRadius: normalizeNumber(location.accuracy_radius),
    locationConfidence: firstString(location.confidence),
    dmaCode: firstString(location.dma_code),
    postalCode: firstString(location.zipcode),
    latitude: coordinates?.latitude || "",
    longitude: coordinates?.longitude || "",
    isEu: normalizeBoolean(location.is_eu),
    countryFlag: firstString(location.country_flag),
    geonameId: firstString(location.geoname_id),
    countryEmoji: firstString(location.country_emoji),
    callingCode: firstString(countryMetadata.calling_code),
    countryTld: firstString(countryMetadata.tld),
    languages: Array.isArray(countryMetadata.languages)
      ? countryMetadata.languages.filter(Boolean)
      : [],
    currencyCode: firstString(currency.code),
    currencyName: firstString(currency.name),
    currencySymbol: firstString(currency.symbol),
    asn: firstString(asn.as_number),
    asnOrganization: firstString(asn.organization),
    asnCountry: firstString(asn.country),
    asnType: firstString(asn.type),
    asnDomain: firstString(asn.domain),
    asnDateAllocated: firstString(asn.date_allocated),
    asnRir: firstString(asn.rir),
    companyName: firstString(company.name),
    companyType: firstString(company.type),
    companyDomain: firstString(company.domain),
    networkRoute: firstString(network.route),
    networkConnectionType: firstString(network.connection_type),
    networkIsAnycast: normalizeBoolean(network.is_anycast),
    timezone: firstString(timeZone.name),
    timezoneOffset: normalizeNumber(timeZone.offset),
    timezoneOffsetWithDst: normalizeNumber(timeZone.offset_with_dst),
    timezoneCurrentTime: firstString(timeZone.current_time),
    timezoneCurrentTimeUnix: normalizeNumber(timeZone.current_time_unix),
    timezoneCurrentAbbreviation: firstString(timeZone.current_tz_abbreviation),
    timezoneCurrentName: firstString(timeZone.current_tz_full_name),
    timezoneStandardAbbreviation: firstString(timeZone.standard_tz_abbreviation),
    timezoneStandardName: firstString(timeZone.standard_tz_full_name),
    timezoneIsDst: normalizeBoolean(timeZone.is_dst),
    timezoneDstSavings: normalizeNumber(timeZone.dst_savings),
    timezoneDstExists: normalizeBoolean(timeZone.dst_exists),
    timezoneDstAbbreviation: firstString(timeZone.dst_tz_abbreviation),
    timezoneDstName: firstString(timeZone.dst_tz_full_name),
    timezoneDstStart: normalizeObject(timeZone.dst_start),
    timezoneDstEnd: normalizeObject(timeZone.dst_end),
  };
}

async function fetchIpGeolocationGeo(ip, apiKey) {
  const resolvedApiKey = apiKey || (await getIpGeolocationApiKey());
  if (!ip || !resolvedApiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IPGEOLOCATION_TIMEOUT_MS);

  try {
    const url = new URL(IPGEOLOCATION_ENDPOINT);
    url.searchParams.set("apiKey", resolvedApiKey);
    url.searchParams.set("ip", ip);

    const response = await fetch(url, {
      cache: "no-store",
      headers: {Accept: "application/json"},
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = await response.json().catch(() => null);
    const geo = normalizeIpGeolocationGeo(data);

    if (
      geo.country ||
      geo.countryCode ||
      geo.state ||
      geo.city ||
      (geo.latitude && geo.longitude)
    ) {
      return {...geo, source: "ipgeolocation"};
    }
  } catch (error) {
    console.warn(`[geo] IPGeolocation lookup failed for ${ip}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }

  return null;
}

export async function getRequestTracking(request) {
  const ip = getClientIp(request);
  const headerCountryCode = getCountryCodeFromHeaders(request);
  const geo = ip ? await fetchIpGeolocationGeo(ip) : null;

  return {
    ip,
    userAgent: request.headers.get("user-agent") || "",
    referrer: request.headers.get("referer") || "",
    hostname: geo?.hostname || "",
    countryCode: geo?.countryCode || headerCountryCode || "",
    countryCode3: geo?.countryCode3 || "",
    countryOfficialName: geo?.countryOfficialName || "",
    countryCapital: geo?.countryCapital || "",
    continentCode: geo?.continentCode || "",
    continent: geo?.continent || "",
    country: geo?.country || "",
    state: geo?.state || "",
    stateCode: geo?.stateCode || "",
    district: geo?.district || "",
    city: geo?.city || "",
    locality: geo?.locality || "",
    accuracyRadius: geo?.accuracyRadius ?? "",
    locationConfidence: geo?.locationConfidence || "",
    dmaCode: geo?.dmaCode || "",
    postalCode: geo?.postalCode || "",
    latitude: geo?.latitude || "",
    longitude: geo?.longitude || "",
    isEu: geo?.isEu ?? "",
    countryFlag: geo?.countryFlag || "",
    geonameId: geo?.geonameId || "",
    countryEmoji: geo?.countryEmoji || "",
    callingCode: geo?.callingCode || "",
    countryTld: geo?.countryTld || "",
    languages: Array.isArray(geo?.languages) ? geo.languages : [],
    currencyCode: geo?.currencyCode || "",
    currencyName: geo?.currencyName || "",
    currencySymbol: geo?.currencySymbol || "",
    asn: geo?.asn || "",
    asnOrganization: geo?.asnOrganization || "",
    asnCountry: geo?.asnCountry || "",
    asnType: geo?.asnType || "",
    asnDomain: geo?.asnDomain || "",
    asnDateAllocated: geo?.asnDateAllocated || "",
    asnRir: geo?.asnRir || "",
    companyName: geo?.companyName || "",
    companyType: geo?.companyType || "",
    companyDomain: geo?.companyDomain || "",
    networkRoute: geo?.networkRoute || "",
    networkConnectionType: geo?.networkConnectionType || "",
    networkIsAnycast: geo?.networkIsAnycast ?? "",
    timezone: geo?.timezone || "",
    timezoneOffset: geo?.timezoneOffset ?? "",
    timezoneOffsetWithDst: geo?.timezoneOffsetWithDst ?? "",
    timezoneCurrentTime: geo?.timezoneCurrentTime || "",
    timezoneCurrentTimeUnix: geo?.timezoneCurrentTimeUnix ?? "",
    timezoneCurrentAbbreviation: geo?.timezoneCurrentAbbreviation || "",
    timezoneCurrentName: geo?.timezoneCurrentName || "",
    timezoneStandardAbbreviation: geo?.timezoneStandardAbbreviation || "",
    timezoneStandardName: geo?.timezoneStandardName || "",
    timezoneIsDst: geo?.timezoneIsDst ?? "",
    timezoneDstSavings: geo?.timezoneDstSavings ?? "",
    timezoneDstExists: geo?.timezoneDstExists ?? "",
    timezoneDstAbbreviation: geo?.timezoneDstAbbreviation || "",
    timezoneDstName: geo?.timezoneDstName || "",
    timezoneDstStart: geo?.timezoneDstStart || {},
    timezoneDstEnd: geo?.timezoneDstEnd || {},
    locationSource: geo?.source || (headerCountryCode ? "headers" : ""),
    capturedAt: new Date().toISOString(),
  };
}
