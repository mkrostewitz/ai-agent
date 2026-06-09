import {randomUUID} from "crypto";

import {
  escapeEmailHtml,
  formatEmailDate,
  renderBrandedEmail,
  renderDetailsTable,
  renderMessageCards,
  renderSection,
} from "./emailTemplates";
import {sendMail} from "./mail";
import {getDb, hasMongoConfig} from "./mongo";

const CONVERSATIONS_COLLECTION =
  process.env.MONGODB_CONVERSATIONS_COLLECTION || "conversations";
const MAX_PREVIEW_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 1200;

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeForMatch(value) {
  return cleanString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss");
}

function truncate(value, maxLength = MAX_MESSAGE_LENGTH) {
  const text = cleanString(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function isEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanString(value));
}

function isPublicUrl(value) {
  try {
    const url = new URL(cleanString(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function emailLink(email) {
  const address = cleanString(email).toLowerCase();
  return isEmail(address) ? `[${address}](mailto:${address})` : "";
}

function contactUrlLink(url, label) {
  const href = cleanString(url);
  return isPublicUrl(href) ? `[${label}](${href})` : "";
}

export function normalizeContactUser(user = {}) {
  const source = user && typeof user === "object" ? user : {};
  const firstName = cleanString(source.first_name || source.firstName);
  const lastName = cleanString(source.last_name || source.lastName);
  const name =
    cleanString(source.name) || [firstName, lastName].filter(Boolean).join(" ");
  const email = cleanString(source.email).toLowerCase();
  const phone = cleanString(source.phone);
  const company = cleanString(source.company);
  const addressLine1 = cleanString(source.address_line1 || source.addressLine1);
  const addressLine2 = cleanString(source.address_line2 || source.addressLine2);
  const city = cleanString(source.city);
  const region = cleanString(source.region);
  const postalCode = cleanString(source.postal_code || source.postalCode);
  const country = cleanString(source.country);
  const postalCity = [postalCode, city].filter(Boolean).join(" ");
  const address =
    cleanString(source.address) ||
    [addressLine1, addressLine2, postalCity, region, country]
      .filter(Boolean)
      .join(", ");

  return {
    name: name || email || phone || company || "Unknown visitor",
    firstName,
    lastName,
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

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      message: truncate(message?.message || message?.content || ""),
    }))
    .filter((message) => message.message)
    .slice(-MAX_PREVIEW_MESSAGES);
}

function contactLine(user = {}) {
  const source = user && typeof user === "object" ? user : {};
  return [source.email, source.phone]
    .map(cleanString)
    .filter(Boolean)
    .join(" / ");
}

export function hasVisitorContactMethod(user = {}) {
  const normalized = normalizeContactUser(user);
  return Boolean(normalized.email || normalized.phone);
}

function ownerName(owner = {}) {
  const source = owner && typeof owner === "object" ? owner : {};
  return (
    cleanString(source.fullName) ||
    cleanString(source.name) ||
    cleanString(source.companyName) ||
    cleanString(source.company_name) ||
    [cleanString(source.firstName), cleanString(source.lastName)]
      .filter(Boolean)
      .join(" ") ||
    "the configured person"
  );
}

export function ownerContactFromProfile(profile = {}) {
  const source = profile && typeof profile === "object" ? profile : {};
  return {
    contactUrl: cleanString(source.contactUrl || source.contact_url),
    email: cleanString(source.email).toLowerCase(),
    name: ownerName(source),
  };
}

function getAdminUrl() {
  const baseUrl = cleanString(
    process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""),
  ).replace(/\/+$/, "");

  return baseUrl ? `${baseUrl}/admin` : "";
}

function buildTextEmail({
  conversationId,
  createdAt,
  messages,
  owner,
  requestText,
  source,
  user,
}) {
  const lines = [
    "Contact request",
    "",
    `Visitor: ${user.name}`,
    `Email: ${user.email || "Not provided"}`,
    `Phone: ${user.phone || "Not provided"}`,
    `Company: ${user.company || "Not provided"}`,
    `Address: ${user.address || "Not provided"}`,
    `City: ${user.city || "Not provided"}`,
    `Region: ${user.region || "Not provided"}`,
    `Postal code: ${user.postalCode || "Not provided"}`,
    `Country: ${user.country || "Not provided"}`,
    `Requested contact with: ${owner.name}`,
    `Owner email: ${owner.email || "Not configured"}`,
    `Source: ${source || "widget"}`,
    `Conversation ID: ${conversationId || "Not available yet"}`,
    `Requested: ${createdAt.toISOString()}`,
  ];
  const adminUrl = getAdminUrl();

  if (requestText) {
    lines.push("", "Request:", requestText);
  }

  if (adminUrl) {
    lines.push("", `Admin: ${adminUrl}`);
  }

  lines.push("", "Messages:");

  if (messages.length) {
    messages.forEach((message) => {
      lines.push("", `${message.role.toUpperCase()}:`, message.message);
    });
  } else {
    lines.push("", "No message content was provided.");
  }

  return lines.join("\n");
}

function buildHtmlEmail({
  conversationId,
  createdAt,
  messages,
  owner,
  requestText,
  source,
  user,
}) {
  const adminUrl = getAdminUrl();
  const detailRows = [
    ["Visitor", user.name],
    ["Email", user.email || "Not provided"],
    ["Phone", user.phone || "Not provided"],
    ["Company", user.company || "Not provided"],
    ["Address", user.address || "Not provided"],
    ["City", user.city || "Not provided"],
    ["Region", user.region || "Not provided"],
    ["Postal code", user.postalCode || "Not provided"],
    ["Country", user.country || "Not provided"],
    ["Requested contact with", owner.name],
    ["Owner email", owner.email || "Not configured"],
    ["Source", source || "widget"],
    ["Conversation ID", conversationId || "Not available yet"],
    ["Requested", formatEmailDate(createdAt)],
  ];
  const sections = [
    renderSection({
      title: "Contact request details",
      content: renderDetailsTable(detailRows),
    }),
  ];

  if (requestText) {
    const safeRequestText = escapeEmailHtml(requestText).replace(/\n/g, "<br>");
    sections.push(
      renderSection({
        title: "Visitor request",
        content: `<p style="margin:0;color:#4b5563;font-size:16px;line-height:1.55;">${safeRequestText}</p>`,
      }),
    );
  }

  sections.push(
    renderSection({
      title: "Messages",
      content: renderMessageCards(messages),
    }),
  );

  return renderBrandedEmail({
    body: sections.join(""),
    ctaHref: adminUrl,
    ctaLabel: "Open admin dashboard",
    preheader: `Contact request from ${user.name}`,
    subtitle: `${user.name} asked to be contacted.`,
    title: "Contact request",
  });
}

async function logContactRequestAction({conversationId, requestText, user}) {
  const id = cleanString(conversationId);
  if (!id || !hasMongoConfig()) return;

  try {
    const now = new Date();
    const db = await getDb();
    const textParts = [
      "Visitor requested contact through the assistant.",
      contactLine(user) ? `Reachable at: ${contactLine(user)}.` : "",
      requestText ? `Request: ${truncate(requestText, 500)}` : "",
    ].filter(Boolean);

    await db.collection(CONVERSATIONS_COLLECTION).updateOne(
      {conversation_id: id},
      {
        $set: {
          status: "reviewing",
          updated_at: now,
        },
        $push: {
          actions: {
            $each: [
              {
                id: randomUUID(),
                type: "follow_up",
                text: textParts.join(" "),
                createdAt: now,
                createdBy: "assistant",
              },
            ],
            $position: 0,
          },
        },
      },
    );
  } catch (error) {
    console.warn("Contact request action log failed:", error);
  }
}

function latestAssistantText(messages = []) {
  if (!Array.isArray(messages)) return "";

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    const content = cleanString(message.content || message.message);
    if (content) return content;
  }

  return "";
}

function hasContactRequestOffer(text) {
  const normalized = normalizeForMatch(text);
  if (!normalized) return false;

  return [
    /\bforward\s+.*\bcontact request\b/,
    /\bcontact request\s+.*\b(using|with)\b/,
    /\bkontaktanfrage\s+.*\b(weiterleiten|weitergeleitet)\b/,
    /\b(inoltrare|inoltro)\s+.*\brichiesta\s+di\s+contatto\b/,
  ].some((pattern) => pattern.test(normalized));
}

function isAffirmativeContactRequest(text) {
  const normalized = normalizeForMatch(text);
  if (!normalized) return false;

  return [
    /^(yes|yeah|yep|ok|okay|sure|please|ja|gern|gerne|bitte|si|sì|certo|va bene)\b/,
    /\b(yes|yeah|yep|ok|okay|sure|please|ja|gern|gerne|bitte|si|sì|certo|va bene)\b.*\b(send|forward|submit|email|mail|message|sende|schick|schicke|leite|weiterleiten|invia|inoltra|manda)\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function detectContactIntent(text, context = {}) {
  const normalized = normalizeForMatch(text);
  if (!normalized) return null;

  const requestPatterns = [
    /\b(contact|call|email|message|reach)\s+(me|us)\b/,
    /\bplease\s+(contact|call|email|message|reach)\b/,
    /\b(can|could|would)\s+you\s+.*\b(send|forward|submit)\s+.*\b(e-?mail|mail|message|contact request)\b/,
    /\b(send|forward|submit|deliver)\s+.*\b(e-?mail|mail|message|contact request)\b/,
    /\b(e-?mail|mail|message)\s+(him|her|them)\b/,
    /\b(get|put)\s+.*\b(in touch|contact)\b/,
    /\b(request|arrange|schedule|book)\s+.*\b(call|callback|contact|meeting|appointment)\b/,
    /\b(i|we)\s+(want|would like|need)\s+.*\b(contact|call|callback|meeting|appointment)\b/,
    /\bspeak\s+(with|to)\b/,
    /\btalk\s+(with|to)\b/,
    /\bcallback\b/,
    /\bkontaktanfrage\b/,
    /\bkontaktiere?\s+(mich|uns)\b/,
    /\bbitte\s+(kontaktieren|anrufen|zuruckrufen|zurueckrufen)\b/,
    /\b(kannst|koenntest|konntest|wuerdest|wurdest)\s+du\s+.*\b(send|senden|sende|schick|schicke|verschick|verschicke|leite|weiterleiten)\b.*\b(e-?mail|email|mail|nachricht|kontaktanfrage)\b/,
    /\b(send|senden|sende|schick|schicke|verschick|verschicke|leite|weiterleiten)\s+.*\b(e-?mail|email|mail|nachricht|kontaktanfrage)\b/,
    /\b(e-?mail|email|mail|nachricht)\s+(an\s+)?(ihn|sie|Jon)\b/,
    /\b(ruf|rufen)\s+.*\b(an|zuruck|zurueck)\b/,
    /\bruckruf\b/,
    /\bzuruckrufen\b/,
    /\bzurueckrufen\b/,
    /\bcontattami\b/,
    /\brichiamami\b/,
    /\bmettermi\s+in\s+contatto\b/,
    /\b(puoi|potresti|per favore)\s+.*\b(invia|inoltra|manda)\b.*\b(email|e-mail|messaggio|richiesta)\b/,
    /\b(invia|inoltra|manda|spedisci)\s+.*\b(email|e-mail|messaggio|richiesta)\b/,
    /\bvorrei\s+.*\b(contatto|chiamata|appuntamento)\b/,
  ];

  if (requestPatterns.some((pattern) => pattern.test(normalized))) {
    return "request";
  }

  const previousAssistantText =
    cleanString(context.previousAssistantText) ||
    latestAssistantText(context.messages);
  if (
    previousAssistantText &&
    hasContactRequestOffer(previousAssistantText) &&
    isAffirmativeContactRequest(normalized)
  ) {
    return "request";
  }

  const infoPatterns = [
    /\b(contact details|contact information|contact info)\b/,
    /\b(email address|phone number)\b/,
    /\bhow\s+(can|do)\s+i\s+(contact|reach)\b/,
    /\bhow\s+to\s+(contact|reach)\b/,
    /\b(your|his|her)\s+(email|phone|contact)\b/,
    /\bget\s+in\s+touch\s+with\b/,
    /\bkontaktdaten\b/,
    /\bkontaktinformationen\b/,
    /\b(email|e-mail)\s*adresse\b/,
    /\btelefonnummer\b/,
    /\bwie\s+kann\s+ich\s+.*\b(kontakt|erreichen)\b/,
    /\bwie\s+erreiche\s+ich\b/,
    /\bdati\s+di\s+contatto\b/,
    /\bindirizzo\s+(email|e-mail)\b/,
    /\bnumero\s+di\s+telefono\b/,
    /\bcome\s+posso\s+contattare\b/,
  ];

  if (infoPatterns.some((pattern) => pattern.test(normalized))) {
    return "info";
  }

  return null;
}

export function contactInfoResponse({lang, owner, user}) {
  const base = cleanString(lang).slice(0, 2).toLowerCase();
  const visitorHasContact = hasVisitorContactMethod(user);
  const name = owner?.name || "the configured person";
  const email = cleanString(owner?.email);
  const mailLink = emailLink(email);
  const contactLink = contactUrlLink(
    owner?.contactUrl,
    base === "de"
      ? "Kontaktseite"
      : base === "it"
        ? "pagina contatti"
        : "contact page",
  );

  if (base === "de") {
    if (!email) {
      if (contactLink) {
        return visitorHasContact
          ? `Ich habe hier keine öffentliche E-Mail-Adresse konfiguriert. Du kannst die ${contactLink} öffnen, oder ich leite eine Kontaktanfrage mit den Kontaktdaten weiter, die du zu Beginn des Chats angegeben hast.`
          : `Ich habe hier keine öffentliche E-Mail-Adresse konfiguriert. Du kannst die ${contactLink} öffnen. Teile sonst bitte eine E-Mail-Adresse oder Telefonnummer, dann kann ich eine Kontaktanfrage weiterleiten.`;
      }

      return visitorHasContact
        ? "Ich habe hier keine öffentlichen Kontaktdaten konfiguriert. Ich kann aber eine Kontaktanfrage mit den Kontaktdaten weiterleiten, die du zu Beginn des Chats angegeben hast."
        : "Ich habe hier keine öffentlichen Kontaktdaten konfiguriert. Teile bitte eine E-Mail-Adresse oder Telefonnummer, dann kann ich eine Kontaktanfrage weiterleiten.";
    }

    return [
      `Du kannst ${name} per E-Mail unter ${mailLink || email} kontaktieren.`,
      contactLink
        ? `Weitere Kontaktdaten findest du auf der ${contactLink}.`
        : "",
      "Wenn du möchtest, kann ich auch eine Kontaktanfrage mit den Kontaktdaten weiterleiten, die du zu Beginn des Chats angegeben hast.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (base === "it") {
    if (!email) {
      if (contactLink) {
        return visitorHasContact
          ? `Non ho un indirizzo email pubblico configurato qui. Puoi aprire la ${contactLink}, oppure posso inoltrare una richiesta di contatto usando i dati che hai fornito all'inizio della chat.`
          : `Non ho un indirizzo email pubblico configurato qui. Puoi aprire la ${contactLink}. Altrimenti lascia un indirizzo email o un numero di telefono e potrò inoltrare una richiesta di contatto.`;
      }

      return visitorHasContact
        ? "Non ho dati di contatto pubblici configurati qui. Posso però inoltrare una richiesta di contatto usando i dati che hai fornito all'inizio della chat."
        : "Non ho dati di contatto pubblici configurati qui. Lascia un indirizzo email o un numero di telefono e potrò inoltrare una richiesta di contatto.";
    }

    return [
      `Puoi contattare ${name} via email a ${mailLink || email}.`,
      contactLink ? `Trovi altri dettagli sulla ${contactLink}.` : "",
      "Se preferisci, posso anche inoltrare una richiesta di contatto usando i dati che hai fornito all'inizio della chat.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (!email) {
    if (contactLink) {
      return visitorHasContact
        ? `I do not have a public email address configured here. You can open the ${contactLink}, or I can forward a contact request using the details you provided at the start of this chat.`
        : `I do not have a public email address configured here. You can open the ${contactLink}. Otherwise, share an email address or phone number and I can forward a contact request.`;
    }

    return visitorHasContact
      ? "I do not have public contact details configured here. I can still forward a contact request using the details you provided at the start of this chat."
      : "I do not have public contact details configured here. Share an email address or phone number and I can forward a contact request.";
  }

  return [
    `You can contact ${name} by email at ${mailLink || email}.`,
    contactLink ? `More contact details are on the ${contactLink}.` : "",
    "If you prefer, I can also forward a contact request using the details you provided at the start of this chat.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function contactRequestResponse({lang, owner, result, user}) {
  const base = cleanString(lang).slice(0, 2).toLowerCase();
  const line = contactLine(user);
  const ownerEmail = cleanString(owner?.email);
  const mailLink = emailLink(ownerEmail);
  const contactLink = contactUrlLink(
    owner?.contactUrl,
    base === "de"
      ? "Kontaktseite"
      : base === "it"
        ? "pagina contatti"
        : "contact page",
  );

  if (result?.reason === "missing_visitor_contact") {
    if (base === "de") {
      return contactLink
        ? `Ich brauche zuerst eine E-Mail-Adresse oder Telefonnummer, bevor ich eine Kontaktanfrage weiterleiten kann. Alternativ kannst du die ${contactLink} öffnen.`
        : "Ich brauche zuerst eine E-Mail-Adresse oder Telefonnummer, bevor ich eine Kontaktanfrage weiterleiten kann.";
    }
    if (base === "it") {
      return contactLink
        ? `Ho bisogno prima di un indirizzo email o di un numero di telefono per inoltrare una richiesta di contatto. In alternativa puoi aprire la ${contactLink}.`
        : "Ho bisogno prima di un indirizzo email o di un numero di telefono per inoltrare una richiesta di contatto.";
    }
    return contactLink
      ? `I need an email address or phone number before I can forward a contact request. Alternatively, you can open the ${contactLink}.`
      : "I need an email address or phone number before I can forward a contact request.";
  }

  if (result?.ok) {
    if (base === "de") {
      return line
        ? `Ich habe die Kontaktanfrage weitergeleitet. Die Antwort kann an ${line} erfolgen.`
        : "Ich habe die Kontaktanfrage weitergeleitet.";
    }
    if (base === "it") {
      return line
        ? `Ho inoltrato la richiesta di contatto. La risposta può arrivare a ${line}.`
        : "Ho inoltrato la richiesta di contatto.";
    }
    return line
      ? `I forwarded the contact request. The reply can go to ${line}.`
      : "I forwarded the contact request.";
  }

  if (base === "de") {
    if (ownerEmail) {
      return [
        `Ich kann die Kontaktanfrage gerade nicht per E-Mail senden. Du kannst ${owner?.name || "die konfigurierte Person"} direkt unter ${mailLink || ownerEmail} kontaktieren.`,
        contactLink ? `Oder öffne die ${contactLink}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    return contactLink
      ? `Ich kann die Kontaktanfrage gerade nicht per E-Mail senden, weil der E-Mail-Versand nicht vollständig konfiguriert ist. Du kannst die ${contactLink} öffnen.`
      : "Ich kann die Kontaktanfrage gerade nicht per E-Mail senden, weil der E-Mail-Versand nicht vollständig konfiguriert ist.";
  }

  if (base === "it") {
    if (ownerEmail) {
      return [
        `Al momento non posso inviare la richiesta via email. Puoi contattare ${owner?.name || "la persona configurata"} direttamente a ${mailLink || ownerEmail}.`,
        contactLink ? `Oppure apri la ${contactLink}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    return contactLink
      ? `Al momento non posso inviare la richiesta via email perché l'invio email non è configurato completamente. Puoi aprire la ${contactLink}.`
      : "Al momento non posso inviare la richiesta via email perché l'invio email non è configurato completamente.";
  }

  if (ownerEmail) {
    return [
      `I cannot send the contact request by email right now. You can contact ${owner?.name || "the configured person"} directly at ${mailLink || ownerEmail}.`,
      contactLink ? `Or open the ${contactLink}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return contactLink
    ? `I cannot send the contact request by email right now because email delivery is not fully configured. You can open the ${contactLink}.`
    : "I cannot send the contact request by email right now because email delivery is not fully configured.";
}

export async function sendContactRequestNotification({
  conversationId,
  messages,
  ownerProfile,
  question,
  source,
  user,
}) {
  const normalizedUser = normalizeContactUser(user);
  const owner = ownerContactFromProfile(ownerProfile);
  const visitorContact = contactLine(normalizedUser);

  if (!visitorContact) {
    return {
      ok: false,
      owner,
      reason: "missing_visitor_contact",
      user: normalizedUser,
    };
  }

  const createdAt = new Date();
  const normalizedMessages = normalizeMessages(messages);
  const payload = {
    conversationId: cleanString(conversationId),
    createdAt,
    messages: normalizedMessages,
    owner,
    requestText: truncate(question, 800),
    source,
    user: normalizedUser,
  };
  const result = await sendMail({
    subject: `Contact request from ${normalizedUser.name}`,
    replyTo: isEmail(normalizedUser.email) ? normalizedUser.email : undefined,
    text: buildTextEmail(payload),
    html: buildHtmlEmail(payload),
  });

  if (result.ok) {
    await logContactRequestAction({
      conversationId,
      requestText: question,
      user: normalizedUser,
    });
  }

  return {
    ...result,
    owner,
    user: normalizedUser,
  };
}
