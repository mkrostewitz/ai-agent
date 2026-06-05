import path from "path";

import {NextResponse} from "next/server";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {storeBuffer} from "@/app/lib/fileStorage";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = Number(
  process.env.AVATAR_UPLOAD_MAX_BYTES || 25 * 1024 * 1024
);

const EXTENSION_BY_MIME = new Map([
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["video/mp4", "mp4"],
]);

const MIME_BY_EXTENSION = new Map([
  ["gif", "image/gif"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["mp4", "video/mp4"],
]);

function normalizeExtension(value) {
  const ext = String(value || "")
    .replace(/^\./, "")
    .toLowerCase();

  return ext === "jpeg" ? "jpg" : ext;
}

function extensionFromName(name) {
  return normalizeExtension(path.extname(String(name || "")));
}

function hasFileSignature(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;

  if (extension === "jpg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (extension === "png") {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (extension === "gif") {
    const header = buffer.toString("ascii", 0, 6);
    return header === "GIF87a" || header === "GIF89a";
  }

  if (extension === "webp") {
    return (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }

  if (extension === "mp4") {
    return buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp";
  }

  return false;
}

function detectMedia(file, buffer) {
  const type = String(file.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const typeExtension = normalizeExtension(EXTENSION_BY_MIME.get(type));
  const nameExtension = extensionFromName(file.name);
  const candidates = [
    ...new Set(
      [typeExtension, nameExtension, "jpg", "png", "webp", "gif", "mp4"].filter(
        Boolean
      )
    ),
  ];

  for (const extension of candidates) {
    const mime = MIME_BY_EXTENSION.get(extension);
    if (!mime || !hasFileSignature(buffer, extension)) continue;

    const normalizedExtension = extension === "jpeg" ? "jpg" : extension;
    return {
      extension: normalizedExtension,
      mediaType: mime.startsWith("video/") ? "video" : "image",
      mime,
    };
  }

  return null;
}

function isUploadFile(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.arrayBuffer === "function" &&
    typeof value.name === "string"
  );
}

export async function POST(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!isUploadFile(file)) {
      return NextResponse.json({error: "Avatar file is required."}, {status: 400});
    }

    if (!file.size) {
      return NextResponse.json({error: "Avatar file is empty."}, {status: 400});
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {error: "Avatar file is too large."},
        {status: 413}
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const media = detectMedia(file, buffer);

    if (!media) {
      return NextResponse.json(
        {error: "Upload a PNG, JPG, WEBP, GIF, or MP4 avatar."},
        {status: 400}
      );
    }

    const stored = await storeBuffer({
      buffer,
      contentType: media.mime,
      directory: "avatars",
      extension: media.extension,
      originalName: file.name,
      visibility: "public",
    });

    return NextResponse.json({
      storage: {
        bucket: stored.bucket || "",
        driver: stored.driver,
        key: stored.key,
      },
      mediaType: media.mediaType,
      url: stored.url,
    });
  } catch (error) {
    console.error("Admin avatar upload error:", error);
    return NextResponse.json(
      {error: "Unable to upload avatar."},
      {status: 500}
    );
  }
}
