export interface SafetyLead {
  initialSentAt: Date | null;
  optOutAt: Date | null;
  status: string;
}

export function isLeadBlocked(lead: SafetyLead | null | undefined): boolean {
  if (!lead) return true;
  if (!lead.initialSentAt) return true;
  if (lead.optOutAt) return true;
  return lead.status === "OPTED_OUT" || lead.status === "BLOCKED";
}

const OPT_OUT_REGEX = /\b(pare|parar|stop|remover|não me contate|nao me contate|sair da lista)\b/i;

export function isOptOutMessage(text: string): boolean {
  if (!text) return false;
  return OPT_OUT_REGEX.test(text);
}

