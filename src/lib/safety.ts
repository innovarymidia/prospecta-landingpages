export interface SafetyLead {
  initialSentAt: Date | null;
  optOutAt: Date | null;
  aiPausedAt?: Date | null;
  status: string;
}

export const AI_STOPPED_STATUSES = new Set([
  "OPTED_OUT",
  "BLOCKED",
  "QUALIFIED",
  "MEETING",
  "WON",
  "LOST",
]);

export function isLeadBlocked(lead: SafetyLead | null | undefined): boolean {
  if (!lead) return true;
  if (!lead.initialSentAt) return true;
  if (lead.optOutAt) return true;
  return lead.status === "OPTED_OUT" || lead.status === "BLOCKED";
}

export function shouldAiAutoReply(lead: SafetyLead | null | undefined): boolean {
  if (!lead || isLeadBlocked(lead)) return false;
  if (lead.aiPausedAt) return false;
  return !AI_STOPPED_STATUSES.has(lead.status);
}

export function getInboundBufferSeconds(rawValue?: string | null): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return 60;
  return Math.max(30, Math.round(parsed));
}

const OPT_OUT_REGEX = /\b(pare|parar|stop|remover|não me contate|nao me contate|sair da lista)\b/i;

export function isOptOutMessage(text: string): boolean {
  if (!text) return false;
  return OPT_OUT_REGEX.test(text);
}

export function reopenedLeadStatus(initialSentAt: Date | string | null | undefined): "REPLIED" | "READY" {
  return initialSentAt ? "REPLIED" : "READY";
}

export function isOutboundSystemEcho(
  incomingText: string,
  externalId: string | undefined,
  recentOutbounds: Array<{ externalId?: string | null; body: string }>
): boolean {
  if (externalId && recentOutbounds.some(item => item.externalId && item.externalId === externalId)) {
    return true;
  }
  const normalized = incomingText.trim();
  if (!normalized) return false;
  return recentOutbounds.some(item => item.body.trim() === normalized);
}

