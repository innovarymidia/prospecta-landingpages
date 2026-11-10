/**
 * Utilitários puros da estratégia Sniper (Locadoras B2B / Prévia Manual + Link Rastreado).
 */

const SOCIAL_OR_LINK_BIO_HOSTS = [
  "instagram.com",
  "www.instagram.com",
  "facebook.com",
  "www.facebook.com",
  "fb.com",
  "linktr.ee",
  "bio.site",
  "wa.me",
  "api.whatsapp.com",
  "negocio.site",
  "business.site",
];

const CRAWLER_UA_REGEX = /(whatsapp|facebookexternalhit|facebot|slackbot|telegrambot|twitterbot|discordbot|linkedinbot|googlebot|bingbot|crawler|spider|preview)/i;

/**
 * Valida se uma URL externa de prévia usa protocolo HTTP/HTTPS seguro.
 */
export function isValidExternalHttpUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Valida se uma string é uma URL HTTP(S) válida ou Data URI de imagem permitida (PNG/JPEG/WEBP).
 */
export function isValidPreviewImage(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed.length <= 2_500_000;
  }
  return isValidExternalHttpUrl(trimmed);
}

/**
 * Gera um slug limpo e único para a rota rastreada /v/[slug].
 */
export function generatePreviewSlug(companyOrName: string, idSuffix = ""): string {
  const base = (companyOrName || "previa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);

  const cleanSuffix = idSuffix
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(-5);

  const core = base || "previa";
  return cleanSuffix ? `${core}-${cleanSuffix}` : core;
}

/**
 * Monta a URL completa de rastreio /v/[slug].
 */
export function buildTrackedPreviewUrl(slug: string | null | undefined, baseUrl?: string): string | null {
  if (!slug) return null;
  const cleanBase = (baseUrl || "").trim().replace(/\/+$/, "");
  return cleanBase ? `${cleanBase}/v/${encodeURIComponent(slug)}` : `/v/${encodeURIComponent(slug)}`;
}

/**
 * Verifica se a empresa possui site próprio real (redes sociais e agregadores não contam).
 */
export function hasRealWebsite(website: string | null | undefined): boolean {
  if (!website || !website.trim()) return false;
  const normalized = /^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`;
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    return !SOCIAL_OR_LINK_BIO_HOSTS.some(social => host === social || host.endsWith(`.${social}`));
  } catch {
    return false;
  }
}

export interface LeadScoreInput {
  website?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
}

/**
 * Avalia se o lead atende aos critérios de "Lead Ouro" (sem site próprio + tração comprovada no Maps).
 */
export function getLeadGoldScore(lead: LeadScoreInput): { isGold: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const noRealSite = !hasRealWebsite(lead.website);
  if (noRealSite) reasons.push("Sem site próprio");

  const ratingOk = typeof lead.rating === "number" && lead.rating >= 4.3;
  if (ratingOk) reasons.push(`Nota ${lead.rating?.toFixed(1)}`);

  const reviewsOk = typeof lead.reviewsCount === "number" && lead.reviewsCount >= 10;
  if (reviewsOk) reasons.push(`${lead.reviewsCount} avaliações`);

  return {
    isGold: noRealSite && ratingOk && reviewsOk,
    reasons,
  };
}

export interface FollowUpInput {
  status: string;
  initialSentAt?: string | Date | null;
  lastMessageAt?: string | Date | null;
}

/**
 * Indica se um lead aguardando resposta precisa de follow-up (Dia +2 ou Dia +5).
 */
export function getFollowUpStage(
  lead: FollowUpInput,
  now: Date = new Date()
): { due: false | "DAY_2" | "DAY_5"; daysSinceSent: number } {
  if (lead.status !== "SENT") {
    return { due: false, daysSinceSent: 0 };
  }
  const reference = lead.lastMessageAt || lead.initialSentAt;
  if (!reference) return { due: false, daysSinceSent: 0 };

  const refDate = reference instanceof Date ? reference : new Date(reference);
  if (Number.isNaN(refDate.getTime())) return { due: false, daysSinceSent: 0 };

  const diffDays = Math.floor((now.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays >= 5) return { due: "DAY_5", daysSinceSent: diffDays };
  if (diffDays >= 2) return { due: "DAY_2", daysSinceSent: diffDays };
  return { due: false, daysSinceSent: Math.max(0, diffDays) };
}

/**
 * Gera sugestão curta de retorno para Dia +2 (utilidade) ou Dia +5 (encerramento da prévia).
 */
export function buildFollowUpSuggestion(
  companyOrName: string,
  stage: "DAY_2" | "DAY_5",
  previewLink?: string | null
): string {
  const company = companyOrName.trim() || "sua empresa";
  if (stage === "DAY_5") {
    return `Oi pessoal da ${company}! Como monto poucos modelos exclusivos por semana e abro espaço para as próximas empresas, costumo tirar o link de demonstração do ar depois de alguns dias. Se quiserem que eu deixe mais um tempo para o responsável avaliar com calma, é só me responder por aqui!`;
  }
  const linkPart = previewLink ? ` (${previewLink})` : "";
  return `Oi! Só passando rapidinho para confirmar se o responsável da ${company} conseguiu abrir aquela prévia que montei${linkPart} sem travar no celular. Deixei os botões já direcionando o pedido de orçamento direto para o WhatsApp de vocês.`;
}

/**
 * Extrai um rótulo curto de cidade ou região a partir do endereço ou origem da empresa.
 */
export function extractRegionLabel(address?: string | null, source?: string | null): string {
  const cleanAddr = (address || "").trim();
  if (cleanAddr) {
    const cityState = cleanAddr.match(/([A-Za-zÀ-ÿ\s.'-]{2,35})\s*,\s*([A-Z]{2})\b/);
    if (cityState) {
      return `${cityState[1].trim()}, ${cityState[2]}`;
    }
    const firstChunk = cleanAddr.split(",")[0]?.trim();
    if (firstChunk && firstChunk.length <= 28) return firstChunk;
  }

  const cleanSource = (source || "").trim();
  if (cleanSource.toLowerCase().startsWith("outscraper:")) {
    const query = cleanSource.slice("outscraper:".length).trim();
    const parts = query.split(",");
    if (parts.length >= 2) {
      return parts.slice(1).join(",").trim().slice(0, 28);
    }
  }

  return "Outras regiões";
}

/**
 * Formata intervalo relativo legível em português simples.
 */
export function formatRelativeTimeBr(dateInput?: string | Date | null, now: Date = new Date()): string {
  if (!dateInput) return "";
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";

  const diffMin = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (diffMin < 2) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? "há 1 dia" : `há ${diffDays} dias`;
}

/**
 * Ordena empresas quentes que já clicaram na prévia, priorizando o clique mais recente.
 */
export function sortHotLeads<T extends { previewViews?: number | null; lastViewedAt?: string | Date | null }>(
  items: T[]
): T[] {
  return items
    .filter(item => (item.previewViews ?? 0) > 0)
    .slice()
    .sort((a, b) => {
      const timeA = a.lastViewedAt ? new Date(a.lastViewedAt).getTime() : 0;
      const timeB = b.lastViewedAt ? new Date(b.lastViewedAt).getTime() : 0;
      return timeB - timeA;
    });
}

/**
 * Detecta bots de preview de link (ex.: WhatsApp/Facebook) para evitar contagem falsa de cliques humanos.
 */
export function isBotOrPreviewUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return CRAWLER_UA_REGEX.test(userAgent);
}
