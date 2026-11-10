import type { RawLeadCandidate } from "./lead-import.ts";

export interface ApifySearchCampaign {
  searchTerms: string[];
  location: string;
  regionCode: string | null;
  language: string;
  maxResults: number;
  websiteTarget?: string;
}

function readStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function readNum(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const parsed = Number(v.replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * Monta o payload de entrada econômico para o ator compass/crawler-google-places
 * sem extras pagos (maxReviews: 0, maxImages: 0) para caber no plano grátis de US$ 5/mês.
 */
export function buildApifyRunInput(campaign: ApifySearchCampaign) {
  const termsCount = Math.max(1, campaign.searchTerms.length);
  const perTerm = Math.max(5, Math.min(25, Math.ceil(campaign.maxResults / termsCount)));
  const lang = campaign.language?.toLowerCase().startsWith("pt") ? "pt-BR" : campaign.language || "pt-BR";

  const websiteFilter =
    campaign.websiteTarget === "missing"
      ? "withoutWebsite"
      : campaign.websiteTarget === "present"
        ? "withWebsite"
        : "allPlaces";

  return {
    searchStringsArray: campaign.searchTerms,
    locationQuery: campaign.location,
    maxCrawledPlacesPerSearch: perTerm,
    language: lang,
    website: websiteFilter,
    skipClosedPlaces: true,
    maxReviews: 0,
    maxImages: 0,
  };
}

function formatApifyHours(rawHours: unknown): string | null {
  if (typeof rawHours === "string") return rawHours.trim().slice(0, 200) || null;
  if (!Array.isArray(rawHours)) return null;
  const parts: string[] = [];
  for (const row of rawHours.slice(0, 3)) {
    if (!row || typeof row !== "object") continue;
    const day = readStr(row as Record<string, unknown>, "day");
    const hours = readStr(row as Record<string, unknown>, "hours").replace(/\bto\b/gi, "às");
    if (day && hours) parts.push(`${day}: ${hours}`);
  }
  return parts.length ? parts.join(" · ").slice(0, 200) : null;
}

/**
 * Converte registros do dataset da Apify para o formato único do importador.
 * Importante: não usa item.url (que é o link do Google Maps) como site próprio da empresa.
 */
export function parseApifyPlaces(items: unknown, locationLabel: string): RawLeadCandidate[] {
  if (!Array.isArray(items)) return [];

  const candidates: RawLeadCandidate[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const name = readStr(item, "title", "name");
    const phone = readStr(item, "phoneUnformatted", "phone");
    if (!name || !phone) continue;

    const categories = Array.isArray(item.categories) ? item.categories : [];
    const firstCategory = typeof categories[0] === "string" ? categories[0].trim() : "";
    const closed = Boolean(item.permanentlyClosed) || Boolean(item.temporarilyClosed);
    const placeId = readStr(item, "placeId", "cid");
    const queryTerm = readStr(item, "searchString") || locationLabel;
    const description = readStr(item, "ownerDescription", "description");

    candidates.push({
      name,
      company: name,
      phone,
      website: readStr(item, "website") || null,
      address: readStr(item, "address", "street") || null,
      category: readStr(item, "categoryName", "category") || firstCategory || null,
      businessStatus: closed ? "CLOSED" : "OPERATIONAL",
      rating: readNum(item, "totalScore", "rating"),
      reviewsCount: readNum(item, "reviewsCount"),
      hours: formatApifyHours(item.openingHours),
      notes: description || null,
      providerId: placeId ? `apify:${placeId}` : null,
      source: `Apify: ${queryTerm}`,
    });
  }

  return candidates;
}

async function callApifyJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(55_000),
  });

  if (response.status === 401) {
    throw new Error("APIFY_TOKEN inválido ou expirado");
  }
  if (response.status === 402 || response.status === 429) {
    throw new Error("Limite gratuito mensal da Apify atingido");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (/usage|limit|credit|payment/i.test(detail)) {
      throw new Error("Limite gratuito mensal da Apify atingido");
    }
    throw new Error(`Apify respondeu HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Executa a busca no ator compass/crawler-google-places e retorna os candidatos padronizados.
 */
export async function searchApifyCampaign(campaign: ApifySearchCampaign): Promise<RawLeadCandidate[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) throw new Error("APIFY_TOKEN não configurado");

  const startRes = await callApifyJson<{
    data?: { id?: string; status?: string; defaultDatasetId?: string };
  }>("https://api.apify.com/v2/actors/compass~crawler-google-places/runs?waitForFinish=40", token, {
    method: "POST",
    body: JSON.stringify(buildApifyRunInput(campaign)),
  });

  let run = startRes.data;
  if (!run?.id) throw new Error("Apify não retornou o ID da execução");

  if (run.status === "READY" || run.status === "RUNNING") {
    const pollRes = await callApifyJson<{
      data?: { id?: string; status?: string; defaultDatasetId?: string };
    }>(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(run.id)}?waitForFinish=12`, token);
    run = pollRes.data;
  }

  if (run?.status !== "SUCCEEDED" || !run.defaultDatasetId) {
    throw new Error(`Apify finalizou com status ${run?.status || "desconhecido"}`);
  }

  const items = await callApifyJson<unknown>(
    `https://api.apify.com/v2/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&format=json`,
    token
  );

  return parseApifyPlaces(items, campaign.location);
}

