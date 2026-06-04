import {readFile} from "node:fs/promises";
import path from "node:path";

import {getCurrentAdminUser, isSetupComplete} from "@/app/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const setupComplete = await isSetupComplete();
  const user = setupComplete ? await getCurrentAdminUser() : null;

  if (!setupComplete || !user) {
    return new Response(null, {
      status: 307,
      headers: {Location: "/admin?next=%2Fwidget-demo.html"},
    });
  }

  const html = await readFile(
    path.join(process.cwd(), "app/widget-demo.html/widget-demo.html"),
    "utf8"
  );

  return new Response(html, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
