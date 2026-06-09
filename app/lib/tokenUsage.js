const TOKEN_USAGE_SOURCE = "estimated_text_v1";

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function messageText(message = {}) {
  if (typeof message.message === "string") return message.message;
  if (typeof message.content === "string") return message.content;
  return "";
}

export function normalizeMessageRole(role) {
  return role === "assistant" ? "assistant" : "user";
}

export function estimateTextTokens(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return 0;

  const words = text.split(" ").filter(Boolean).length;
  const characterEstimate = text.length / 4;
  const wordEstimate = words * 1.25;

  return Math.max(1, Math.ceil(Math.max(characterEstimate, wordEstimate)));
}

export function normalizeMessageTokenUsage(message = {}) {
  const role = normalizeMessageRole(message.role);
  const text = messageText(message);
  const usage = message.token_usage || message.usage || {};
  const providedTotal =
    finiteNumber(usage.total_tokens) ??
    finiteNumber(usage.totalTokens) ??
    finiteNumber(message.token_count) ??
    finiteNumber(message.tokenCount);
  const totalTokens = Math.round(
    providedTotal === null ? estimateTextTokens(text) : providedTotal
  );
  const estimated =
    providedTotal === null
      ? true
      : usage.estimated === undefined
      ? true
      : Boolean(usage.estimated);
  const inputTokens =
    finiteNumber(usage.input_tokens) ??
    finiteNumber(usage.prompt_tokens) ??
    finiteNumber(usage.inputTokens) ??
    (role === "user" ? totalTokens : 0);
  const outputTokens =
    finiteNumber(usage.output_tokens) ??
    finiteNumber(usage.completion_tokens) ??
    finiteNumber(usage.outputTokens) ??
    (role === "assistant" ? totalTokens : 0);

  return {
    estimated,
    input_tokens: Math.round(inputTokens),
    output_tokens: Math.round(outputTokens),
    source: usage.source || (estimated ? TOKEN_USAGE_SOURCE : "recorded"),
    total_tokens: totalTokens,
  };
}

export function createStoredConversationMessage(message = {}, createdAt = new Date()) {
  const role = normalizeMessageRole(message?.role);
  const storedMessage = {
    role,
    message: messageText(message),
    created_at: createdAt,
  };
  const tokenUsage = normalizeMessageTokenUsage(storedMessage);

  return {
    ...storedMessage,
    token_count: tokenUsage.total_tokens,
    token_usage: tokenUsage,
  };
}

export function summarizeMessageTokenUsage(messages = []) {
  return messages.reduce(
    (summary, message) => {
      const usage = normalizeMessageTokenUsage(message);
      const role = normalizeMessageRole(message?.role);

      summary.messageCount += 1;
      summary.totalTokens += usage.total_tokens;
      summary.inputTokens += usage.input_tokens;
      summary.outputTokens += usage.output_tokens;
      if (role === "assistant") {
        summary.assistantTokens += usage.total_tokens;
      } else {
        summary.userTokens += usage.total_tokens;
      }
      if (usage.estimated) {
        summary.estimatedTokens += usage.total_tokens;
      } else {
        summary.recordedTokens += usage.total_tokens;
      }

      return summary;
    },
    {
      assistantTokens: 0,
      estimatedTokens: 0,
      inputTokens: 0,
      messageCount: 0,
      outputTokens: 0,
      recordedTokens: 0,
      totalTokens: 0,
      userTokens: 0,
    }
  );
}
