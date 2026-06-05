import {NextResponse} from "next/server";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {getDb} from "@/app/lib/mongo";
import {
  fetchIpGeolocationGeo,
  getIpGeolocationApiKey,
  isPrivateIp,
  normalizeIp,
} from "@/app/lib/requestGeo";

export const runtime = "nodejs";

const CONVERSATIONS_COLLECTION =
  process.env.MONGODB_CONVERSATIONS_COLLECTION || "conversations";

function cleanString(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function cleanLimit(value) {
  const limit = Number(value);
  return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 300) : 100;
}

function hasCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function hasTrackingCoordinates(tracking = {}) {
  return (
    hasCoordinate(tracking.latitude, -90, 90) &&
    hasCoordinate(tracking.longitude, -180, 180)
  );
}

function trackingNeedsGeolocation(tracking = {}) {
  return (
    !cleanString(tracking.country) ||
    !cleanString(tracking.countryCode) ||
    !cleanString(tracking.state || tracking.region) ||
    !cleanString(tracking.city) ||
    !hasTrackingCoordinates(tracking)
  );
}

function getPublicTrackingIp(tracking = {}) {
  const ip = normalizeIp(tracking.ip);
  return ip && !isPrivateIp(ip) ? ip : "";
}

function mergeTrackingGeo(tracking = {}, geo = {}) {
  if (!geo) return tracking;

  return {
    ...tracking,
    hostname: tracking.hostname || geo.hostname || "",
    country: geo.country || tracking.country || "",
    countryCode: geo.countryCode || tracking.countryCode || "",
    countryCode3: geo.countryCode3 || tracking.countryCode3 || "",
    countryOfficialName:
      geo.countryOfficialName || tracking.countryOfficialName || "",
    countryCapital: geo.countryCapital || tracking.countryCapital || "",
    continentCode: geo.continentCode || tracking.continentCode || "",
    continent: geo.continent || tracking.continent || "",
    state: geo.state || tracking.state || "",
    stateCode: geo.stateCode || tracking.stateCode || "",
    district: geo.district || tracking.district || "",
    city: geo.city || tracking.city || "",
    locality: geo.locality || tracking.locality || "",
    accuracyRadius: geo.accuracyRadius || tracking.accuracyRadius || "",
    locationConfidence:
      geo.locationConfidence || tracking.locationConfidence || "",
    dmaCode: geo.dmaCode || tracking.dmaCode || "",
    postalCode: geo.postalCode || tracking.postalCode || "",
    latitude: geo.latitude || tracking.latitude || "",
    longitude: geo.longitude || tracking.longitude || "",
    isEu: geo.isEu ?? tracking.isEu ?? "",
    countryFlag: geo.countryFlag || tracking.countryFlag || "",
    geonameId: geo.geonameId || tracking.geonameId || "",
    countryEmoji: geo.countryEmoji || tracking.countryEmoji || "",
    callingCode: geo.callingCode || tracking.callingCode || "",
    countryTld: geo.countryTld || tracking.countryTld || "",
    languages: Array.isArray(geo.languages)
      ? geo.languages
      : Array.isArray(tracking.languages)
      ? tracking.languages
      : [],
    currencyCode: geo.currencyCode || tracking.currencyCode || "",
    currencyName: geo.currencyName || tracking.currencyName || "",
    currencySymbol: geo.currencySymbol || tracking.currencySymbol || "",
    asn: geo.asn || tracking.asn || "",
    asnOrganization: geo.asnOrganization || tracking.asnOrganization || "",
    asnCountry: geo.asnCountry || tracking.asnCountry || "",
    asnType: geo.asnType || tracking.asnType || "",
    asnDomain: geo.asnDomain || tracking.asnDomain || "",
    asnDateAllocated: geo.asnDateAllocated || tracking.asnDateAllocated || "",
    asnRir: geo.asnRir || tracking.asnRir || "",
    companyName: geo.companyName || tracking.companyName || "",
    companyType: geo.companyType || tracking.companyType || "",
    companyDomain: geo.companyDomain || tracking.companyDomain || "",
    networkRoute: geo.networkRoute || tracking.networkRoute || "",
    networkConnectionType:
      geo.networkConnectionType || tracking.networkConnectionType || "",
    networkIsAnycast: geo.networkIsAnycast ?? tracking.networkIsAnycast ?? "",
    timezone: geo.timezone || tracking.timezone || "",
    timezoneOffset: geo.timezoneOffset ?? tracking.timezoneOffset ?? "",
    timezoneOffsetWithDst:
      geo.timezoneOffsetWithDst ?? tracking.timezoneOffsetWithDst ?? "",
    timezoneCurrentTime:
      geo.timezoneCurrentTime || tracking.timezoneCurrentTime || "",
    timezoneCurrentTimeUnix:
      geo.timezoneCurrentTimeUnix ?? tracking.timezoneCurrentTimeUnix ?? "",
    timezoneCurrentAbbreviation:
      geo.timezoneCurrentAbbreviation ||
      tracking.timezoneCurrentAbbreviation ||
      "",
    timezoneCurrentName:
      geo.timezoneCurrentName || tracking.timezoneCurrentName || "",
    timezoneStandardAbbreviation:
      geo.timezoneStandardAbbreviation ||
      tracking.timezoneStandardAbbreviation ||
      "",
    timezoneStandardName:
      geo.timezoneStandardName || tracking.timezoneStandardName || "",
    timezoneIsDst: geo.timezoneIsDst ?? tracking.timezoneIsDst ?? "",
    timezoneDstSavings:
      geo.timezoneDstSavings ?? tracking.timezoneDstSavings ?? "",
    timezoneDstExists: geo.timezoneDstExists ?? tracking.timezoneDstExists ?? "",
    timezoneDstAbbreviation:
      geo.timezoneDstAbbreviation || tracking.timezoneDstAbbreviation || "",
    timezoneDstName: geo.timezoneDstName || tracking.timezoneDstName || "",
    timezoneDstStart: geo.timezoneDstStart || tracking.timezoneDstStart || {},
    timezoneDstEnd: geo.timezoneDstEnd || tracking.timezoneDstEnd || {},
    locationSource: geo.source || tracking.locationSource || "",
    geolocatedAt: new Date().toISOString(),
  };
}

function trackingChanged(previous = {}, next = {}) {
  const keys = [
    "country",
    "countryCode",
    "state",
    "city",
    "postalCode",
    "latitude",
    "longitude",
    "timezone",
    "locationSource",
  ];

  return keys.some((key) => previous[key] !== next[key]);
}

async function lookupIps(ips, apiKey) {
  const results = new Map();
  const batchSize = 8;

  for (let index = 0; index < ips.length; index += batchSize) {
    const batch = ips.slice(index, index + batchSize);
    const resolved = await Promise.all(
      batch.map(async (ip) => [ip, await fetchIpGeolocationGeo(ip, apiKey)])
    );

    resolved.forEach(([ip, geo]) => results.set(ip, geo));
  }

  return results;
}

export async function POST(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const limit = cleanLimit(body.limit);
    const force = body.force === true;
    const apiKey = await getIpGeolocationApiKey();

    if (!apiKey) {
      return NextResponse.json(
        {error: "IPGeolocation API key is not configured."},
        {status: 400}
      );
    }

    const query = {
      "tracking.ip": {$type: "string", $ne: ""},
    };

    if (!force) {
      query.$or = [
        {"tracking.country": {$in: [null, ""]}},
        {"tracking.countryCode": {$in: [null, ""]}},
        {"tracking.state": {$in: [null, ""]}},
        {"tracking.city": {$in: [null, ""]}},
        {"tracking.latitude": {$in: [null, ""]}},
        {"tracking.longitude": {$in: [null, ""]}},
      ];
    }

    const db = await getDb();
    const collection = db.collection(CONVERSATIONS_COLLECTION);
    const docs = await collection
      .find(query)
      .sort({updated_at: -1, created_at: -1})
      .limit(limit)
      .toArray();
    const eligible = docs
      .map((document) => ({
        document,
        tracking: document.tracking || document.metadata?.tracking || {},
      }))
      .map((item) => ({...item, ip: getPublicTrackingIp(item.tracking)}))
      .filter(
        (item) =>
          item.ip && (force || trackingNeedsGeolocation(item.tracking))
      );
    const uniqueIps = [...new Set(eligible.map((item) => item.ip))];
    const geoByIp = await lookupIps(uniqueIps, apiKey);
    let updated = 0;
    let failed = 0;

    for (const {document, ip, tracking} of eligible) {
      const geo = geoByIp.get(ip);

      if (!geo) {
        failed += 1;
        continue;
      }

      const nextTracking = mergeTrackingGeo(tracking, geo);
      if (!trackingChanged(tracking, nextTracking)) continue;

      await collection.updateOne(
        {_id: document._id},
        {
          $set: {
            tracking: nextTracking,
            "metadata.tracking": nextTracking,
          },
        }
      );
      updated += 1;
    }

    return NextResponse.json({
      summary: {
        checked: docs.length,
        eligible: eligible.length,
        lookedUp: uniqueIps.length,
        updated,
        failed,
      },
    });
  } catch (error) {
    console.error("Admin conversation geolocation POST error:", error);
    return NextResponse.json(
      {error: "Unable to geolocate conversations."},
      {status: 500}
    );
  }
}
