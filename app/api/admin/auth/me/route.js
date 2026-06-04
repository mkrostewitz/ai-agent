import {NextResponse} from "next/server";

import {getCurrentAdminUser} from "@/app/lib/adminAuth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentAdminUser();

  if (!user) {
    return NextResponse.json({user: null}, {status: 401});
  }

  return NextResponse.json({user});
}
