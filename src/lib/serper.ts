import type { RawLeadCandidate } from "./lead-import.ts";

export interface SerperSearchCampaign {
  searchTerms: string[];
  location: string;
  regionCode: string | null;
  language: string;
  maxResults: number;
}

function readString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function readNumber(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "number" && Number.isFinite(val)) return val;
    if (typeof val === "string" && val.trim()) {
      const parsed = Number(val.replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * Converte a resposta JSON do endpoint https://google.serper.dev/maps para candidatos padronizados.
 */
export function parseSerperPlaces(body: unknown, queryLabel: string): RawLeadCandidate[] {
  if (!body || typeof body !== "object") return [];
  const rawPlaces = (body as { places?: unknown }).places;
  if (!Array.isArray(rawPlaces)) return [];

  const candidates: RawLeadCandidate[] = [];
  for (const raw of rawPlaces) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const name = readString(item, "title", "name");
    const phone = readString(item, "phoneNumber", "phone");
    if (!name || !phone) continue;

    const id = readString(item, "cid", "placeId", "fid");
    candidates.push({
      name,
      company: name,
      phone,
      website: readString(item, "website", "site") || null,
      address: readString(item, "address", "fullAddress") || null,
      category: readString(item, "category", "type") || null,
      rating: readNumber(item, "rating"),
      reviewsCount: readNumber(item, "ratingCount", "reviewsCount", "reviews"),
      providerId: id ? `serper:${id}` : null,
      source: `Serper: ${queryLabel}`,
    });
  }
  return candidates;
}

/**
 * Executa buscas no endpoint Google Maps do Serper.dev (plano gratuito com 2.500 consultas sem cartão).
 */
export async function searchSerperCampaign(campaign: SerperSearchCampaign): Promise<RawLeadCandidate[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) throw new Error("SERPER_API_KEY não configurada");

  const maxPages = campaign.maxResults > 20 ? 2 : 1;
  const gl = (campaign.regionCode || "br").trim().toLowerCase() || "br";
  const hl = (campaign.language || "pt-br").trim().toLowerCase() === "pt" ? "pt-br" : campaign.language || "pt-br";
  const allCandidates: RawLeadCandidate[] = [];

  for (const term of campaign.searchTerms) {
    const query = `${term}, ${campaign.location}`;
    for (let page = 1; page <= maxPages; page++) {
      const payload: Record<string, unknown> = { q: query, gl, hl };
      if (page > 1) payload.page = page;

      const response = await fetch("https://google.serper.dev/maps", {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error("SERPER_API_KEY inválida ou sem permissão");
      }
      if (response.status === 402 || response.status === 429) {
        throw new Error("Limite ou créditos da Serper atingidos no momento");
      }
      if (!response.ok) {
        throw new Error(`Serper respondeu HTTP ${response.status}`);
      }

      const body = await response.json();
      const rawCount = Array.isArray((body as { places?: unknown }).places)
        ? ((body as { places: unknown[] }).places.length)
        : 0;
      allCandidates.push(...parseSerperPlaces(body, query));

      if (rawCount < 20) break;
    }
  }

  return allCandidates;
}
