import fs from "fs";
import path from "path";

const THEME = {
  background: "#fdf4ff",
  border: "#f5d0fe",
  brand: "#d946ef",
  brandMuted: "#fae8ff",
  brandStrong: "#a21caf",
  muted: "#4b5563",
  panel: "#fff7fe",
  softBorder: "#f3d8fb",
  surface: "#ffffff",
  text: "#0f172a",
};

let cachedLogoDataUri = "";

export function escapeEmailHtml(value) {
  return String(value || "")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatEmailDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function paragraph(text) {
  return `<p style="margin:0;color:${THEME.muted};font-size:16px;line-height:1.55;">${escapeEmailHtml(text)}</p>`;
}

function hiddenPreheader(text) {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;mso-hide:all;">${escapeEmailHtml(text)}</div>`;
}

function getPublicBaseUrl() {
  return String(
    process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  )
    .trim()
    .replace(/\/+$/, "");
}

function getLogoSrc() {
  const baseUrl = getPublicBaseUrl();
  if (baseUrl) return `${baseUrl}/assets/ilysa-logo.png`;

  if (cachedLogoDataUri) return cachedLogoDataUri;

  try {
    const logoPath = path.join(process.cwd(), "public", "assets", "ilysa-logo.png");
    cachedLogoDataUri = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
    return cachedLogoDataUri;
  } catch {
    return "";
  }
}

export function renderDetailsTable(rows = []) {
  const body = rows
    .filter(([, value]) => String(value || "").trim())
    .map(
      ([label, value]) => `<tr>
        <td width="180" style="padding:9px 14px 9px 0;color:${THEME.muted};font-size:13px;font-weight:700;line-height:1.35;text-transform:uppercase;vertical-align:top;">${escapeEmailHtml(label)}</td>
        <td style="padding:9px 0;color:${THEME.text};font-size:15px;font-weight:600;line-height:1.45;vertical-align:top;word-break:break-word;">${escapeEmailHtml(value)}</td>
      </tr>`
    )
    .join("");

  if (!body) return "";

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
    <tbody>${body}</tbody>
  </table>`;
}

export function renderMessageCards(messages = []) {
  if (!messages.length) {
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0;">
      <tr>
        <td style="border:1px solid ${THEME.softBorder};border-radius:12px;background:${THEME.panel};padding:16px 18px;color:${THEME.muted};font-size:15px;line-height:1.5;">No message content was stored yet.</td>
      </tr>
    </table>`;
  }

  return messages
    .map((message) => {
      const content = escapeEmailHtml(message.message).replace(/\n/g, "<br>");

      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0;margin:0 0 12px;">
        <tr>
          <td style="border:1px solid ${THEME.softBorder};border-radius:12px;background:${THEME.panel};padding:16px 18px;">
            <div style="margin:0 0 8px;color:${THEME.brandStrong};font-size:12px;font-weight:800;letter-spacing:0;text-transform:uppercase;">${escapeEmailHtml(message.role)}</div>
            <div style="color:${THEME.text};font-size:15px;line-height:1.55;">${content}</div>
          </td>
        </tr>
      </table>`;
    })
    .join("");
}

export function renderBrandedEmail({
  body = "",
  ctaHref = "",
  ctaLabel = "",
  preheader = "",
  subtitle = "",
  title,
}) {
  const safeTitle = escapeEmailHtml(title || "ilysa");
  const logoSrc = getLogoSrc();
  const logo = logoSrc
    ? `<img src="${escapeEmailHtml(logoSrc)}" width="42" height="42" alt="ilysa" style="display:block;width:42px;height:42px;border:0;border-radius:999px;background:#ffffff;">`
    : `<span style="display:inline-block;width:42px;height:42px;border-radius:999px;background:#ffffff;color:${THEME.brandStrong};font-size:15px;font-weight:800;line-height:42px;text-align:center;">i</span>`;
  const cta = ctaHref
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;">
        <tr>
          <td bgcolor="${THEME.brand}" style="border-radius:10px;background:${THEME.brand};">
            <a href="${escapeEmailHtml(ctaHref)}" style="display:inline-block;padding:13px 18px;color:#ffffff;font-size:15px;font-weight:800;line-height:1;text-decoration:none;">${escapeEmailHtml(ctaLabel || "Open")}</a>
          </td>
        </tr>
      </table>`
    : "";
  const subtitleHtml = subtitle ? paragraph(subtitle) : "";

  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: light; supported-color-schemes: light; }
      body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      table { border-collapse: collapse; }
      @media screen and (max-width: 640px) {
        .email-shell { width: 100% !important; }
        .email-pad { padding-left: 20px !important; padding-right: 20px !important; }
        .email-title { font-size: 25px !important; }
      }
    </style>
  </head>
  <body bgcolor="${THEME.background}" style="margin:0;padding:0;background-color:${THEME.background};color:${THEME.text};font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
    ${hiddenPreheader(preheader)}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${THEME.background}" style="background:${THEME.background};">
      <tr>
        <td align="center" style="padding:34px 16px;">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:680px;max-width:680px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td bgcolor="${THEME.brand}" class="email-pad" style="background:${THEME.brand};border-radius:18px 18px 0 0;padding:24px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td width="42" style="width:42px;vertical-align:middle;">${logo}</td>
                          <td style="padding-left:13px;color:#ffffff;font-size:18px;font-weight:800;line-height:1;vertical-align:middle;">ilysa</td>
                        </tr>
                      </table>
                    </td>
                    <td align="right">
                      <span style="display:inline-block;border:1px solid rgba(255,255,255,0.34);border-radius:999px;padding:7px 11px;color:#ffffff;font-size:12px;font-weight:800;line-height:1;background:${THEME.brandStrong};">Notification</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td bgcolor="${THEME.surface}" class="email-pad" style="background:${THEME.surface};border-right:1px solid ${THEME.border};border-left:1px solid ${THEME.border};padding:32px;">
                <h1 class="email-title" style="margin:0 0 12px;color:${THEME.text};font-size:30px;font-weight:800;letter-spacing:0;line-height:1.18;">${safeTitle}</h1>
                ${subtitleHtml}
                ${cta}
              </td>
            </tr>
            ${body}
            <tr>
              <td bgcolor="${THEME.panel}" class="email-pad" style="background:${THEME.panel};border:1px solid ${THEME.border};border-top:0;border-radius:0 0 18px 18px;padding:20px 32px;">
                <p style="margin:0;color:${THEME.muted};font-size:13px;line-height:1.5;">This email was sent by your ilysa mail integration.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderSection({title, content}) {
  return `<tr>
    <td bgcolor="${THEME.surface}" class="email-pad" style="background:${THEME.surface};border-right:1px solid ${THEME.border};border-left:1px solid ${THEME.border};padding:0 32px 28px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0;">
        <tr>
          <td style="border:1px solid ${THEME.softBorder};border-radius:14px;background:${THEME.panel};padding:20px 22px;">
            <h2 style="margin:0 0 12px;color:${THEME.text};font-size:17px;font-weight:800;line-height:1.3;">${escapeEmailHtml(title)}</h2>
            ${content}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export function renderTestEmailHtml({requestedBy, sentAt}) {
  const details = renderDetailsTable([
    ["Status", "Email delivery verified"],
    ["Sent at", sentAt],
    ["Requested by", requestedBy],
  ]);
  const body = renderSection({
    title: "Delivery check",
    content: `${paragraph("Your mail settings can send email successfully.")}${details ? `<div style="height:14px;line-height:14px;">&nbsp;</div>${details}` : ""}`,
  });

  return renderBrandedEmail({
    body,
    preheader: "Your ilysa mail settings can send email successfully.",
    subtitle: "Your email integration is ready to send conversation notifications.",
    title: "Mail settings verified",
  });
}
