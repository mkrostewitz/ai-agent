import {sendMail} from "./mail";
import {
  formatEmailDate,
  renderBrandedEmail,
  renderDetailsTable,
  renderMessageCards,
  renderSection,
} from "./emailTemplates";

const MAX_PREVIEW_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 1200;

function cleanString(value) {
  return String(value || "").trim();
}

function truncate(value, maxLength = MAX_MESSAGE_LENGTH) {
  const text = cleanString(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function normalizeUser(user = {}) {
  const firstName = cleanString(user.first_name || user.firstName);
  const lastName = cleanString(user.last_name || user.lastName);
  const name = cleanString(user.name) || [firstName, lastName].filter(Boolean).join(" ");
  const email = cleanString(user.email).toLowerCase();
  const phone = cleanString(user.phone);
  const company = cleanString(user.company);
  const addressLine1 = cleanString(user.address_line1 || user.addressLine1);
  const addressLine2 = cleanString(user.address_line2 || user.addressLine2);
  const city = cleanString(user.city);
  const region = cleanString(user.region);
  const postalCode = cleanString(user.postal_code || user.postalCode);
  const country = cleanString(user.country);
  const postalCity = [postalCode, city].filter(Boolean).join(" ");
  const address =
    cleanString(user.address) ||
    [addressLine1, addressLine2, postalCity, region, country]
      .filter(Boolean)
      .join(", ");

  return {
    name: name || email || phone || company || "Unknown visitor",
    email,
    phone,
    company,
    address,
    addressLine1,
    addressLine2,
    city,
    region,
    postalCode,
    country,
  };
}

function isEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanString(value));
}

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      message: truncate(message?.message || message?.content || ""),
    }))
    .filter((message) => message.message)
    .slice(0, MAX_PREVIEW_MESSAGES);
}

function getAdminUrl() {
  const baseUrl = cleanString(
    process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  ).replace(/\/+$/, "");

  return baseUrl ? `${baseUrl}/admin` : "";
}

function getTrackingLine(tracking = {}) {
  const parts = [
    cleanString(tracking.city),
    cleanString(tracking.region),
    cleanString(tracking.country || tracking.countryCode),
  ].filter(Boolean);
  const location = parts.join(", ");
  const ip = cleanString(tracking.ip);

  if (location && ip) return `${location} (${ip})`;
  return location || ip || "Not available";
}

function buildTextEmail({conversationId, user, messages, tracking, source, createdAt}) {
  const lines = [
    "New conversation",
    "",
    `Conversation ID: ${conversationId}`,
    `Visitor: ${user.name}`,
    `Email: ${user.email || "Not provided"}`,
    `Phone: ${user.phone || "Not provided"}`,
    `Company: ${user.company || "Not provided"}`,
    `Address: ${user.address || "Not provided"}`,
    `City: ${user.city || "Not provided"}`,
    `Region: ${user.region || "Not provided"}`,
    `Postal code: ${user.postalCode || "Not provided"}`,
    `Country: ${user.country || "Not provided"}`,
    `Source: ${source || "widget"}`,
    `Location: ${getTrackingLine(tracking)}`,
    `Created: ${createdAt ? new Date(createdAt).toISOString() : new Date().toISOString()}`,
  ];
  const adminUrl = getAdminUrl();

  if (adminUrl) {
    lines.push(`Admin: ${adminUrl}`);
  }

  lines.push("", "Messages:");

  if (messages.length) {
    messages.forEach((message) => {
      lines.push("", `${message.role.toUpperCase()}:`, message.message);
    });
  } else {
    lines.push("", "No message content was stored yet.");
  }

  return lines.join("\n");
}

function buildHtmlEmail({conversationId, user, messages, tracking, source, createdAt}) {
  const adminUrl = getAdminUrl();
  const detailRows = [
    ["Conversation ID", conversationId],
    ["Visitor", user.name],
    ["Email", user.email || "Not provided"],
    ["Phone", user.phone || "Not provided"],
    ["Company", user.company || "Not provided"],
    ["Address", user.address || "Not provided"],
    ["City", user.city || "Not provided"],
    ["Region", user.region || "Not provided"],
    ["Postal code", user.postalCode || "Not provided"],
    ["Country", user.country || "Not provided"],
    ["Source", source || "widget"],
    ["Location", getTrackingLine(tracking)],
    [
      "Created",
      formatEmailDate(createdAt || new Date()),
    ],
  ];
  const body = [
    renderSection({
      title: "Conversation details",
      content: renderDetailsTable(detailRows),
    }),
    renderSection({
      title: "Messages",
      content: renderMessageCards(messages),
    }),
  ].join("");

  return renderBrandedEmail({
    body,
    ctaHref: adminUrl,
    ctaLabel: "Open admin dashboard",
    preheader: `New conversation from ${user.name}`,
    subtitle: `${user.name} started a new conversation with ilysa.`,
    title: "New conversation",
  });
}

export async function sendNewConversationNotification(conversation) {
  const user = normalizeUser(conversation?.user || {});
  const messages = normalizeMessages(conversation?.messages);
  const conversationId = cleanString(conversation?.conversation_id || conversation?._id);
  const subjectName = user.name === "Unknown visitor" ? "visitor" : user.name;
  const subject = `New conversation from ${subjectName}`;
  const replyTo = isEmail(user.email) ? user.email : undefined;
  const payload = {
    conversationId,
    user,
    messages,
    tracking: conversation?.tracking || conversation?.metadata?.tracking || {},
    source: conversation?.source,
    createdAt: conversation?.created_at || conversation?.createdAt,
  };

  return sendMail({
    subject,
    replyTo,
    text: buildTextEmail(payload),
    html: buildHtmlEmail(payload),
  });
}
