import {NextResponse} from "next/server";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {formatEmailDate, renderTestEmailHtml} from "@/app/lib/emailTemplates";
import {sendMail} from "@/app/lib/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function skippedError(result = {}) {
  if (result.reason === "disabled") return "Email delivery is disabled.";
  if (result.reason === "missing_recipient") {
    return "No notification recipient is configured.";
  }
  if (result.reason === "not_configured") {
    const missing = Array.isArray(result.missing) ? result.missing.join(", ") : "";
    return missing
      ? `Email delivery is missing: ${missing}.`
      : "Email delivery is not fully configured.";
  }

  return "Unable to send test email.";
}

export async function POST(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const sentAt = formatEmailDate(new Date());
    const result = await sendMail({
      subject: "ilysa mail settings verified",
      text: [
        "Your ilysa mail settings can send email successfully.",
        "",
        `Sent at: ${sentAt}`,
        `Requested by: ${auth.user.email}`,
      ].join("\n"),
      html: renderTestEmailHtml({
        requestedBy: auth.user.email,
        sentAt,
      }),
    });

    if (result.skipped) {
      return NextResponse.json({error: skippedError(result)}, {status: 400});
    }

    if (!result.ok) {
      return NextResponse.json(
        {error: "Unable to send test email."},
        {status: 502}
      );
    }

    return NextResponse.json({
      ok: true,
      accepted: result.accepted || [],
      rejected: result.rejected || [],
    });
  } catch (error) {
    console.error("Admin test email error:", error);
    return NextResponse.json(
      {error: error?.message || "Unable to send test email."},
      {status: 502}
    );
  }
}
