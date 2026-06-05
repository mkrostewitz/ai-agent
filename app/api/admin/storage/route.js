import {NextResponse} from "next/server";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {deleteStoredObject, storageStatus, storeBuffer} from "@/app/lib/fileStorage";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  return NextResponse.json({storage: storageStatus()});
}

export async function POST(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  let stored = null;

  try {
    stored = await storeBuffer({
      buffer: Buffer.from("storage-ok\n"),
      contentType: "text/plain",
      directory: "storage-probes",
      extension: "txt",
      originalName: "probe.txt",
      visibility: "private",
    });

    await deleteStoredObject(stored);

    return NextResponse.json({
      ok: true,
      storage: storageStatus(),
    });
  } catch (error) {
    if (stored) {
      await deleteStoredObject(stored).catch(() => {});
    }

    return NextResponse.json(
      {
        error: error.message || "Storage check failed.",
        ok: false,
        storage: storageStatus(),
      },
      {status: 500}
    );
  }
}
