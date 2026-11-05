import { normalizePhone } from "@/lib/phone";
type Place = Record<string, unknown>;
type SearchCampaign = { searchTerms: string[]; location: string; regionCode: string | null; language: string; maxResults: number; websiteTarget: string };
export type OutscraperRequest = { taskId: string; ready: boolean; failure: boolean };

function flattenPlaces(input: unknown): Place[] {
  if (Array.isArray(input)) return input.flatMap(flattenPlaces);
  if (!input || typeof input !== "object") return [];
  const value = input as Record<string, unknown>;
  if (typeof value.name === "string" && (value.phone || value.place_id || value.google_id)) return [value];
  if ("data" in value) return flattenPlaces(value.data);
  return [];
}
function stringField(item: Place, ...keys: string[]) {
  for (const key of keys) if (typeof item[key] === "string" && item[key]) return (item[key] as string).trim();
  return "";
}
function readResponse(body: unknown): { ready: boolean; failure: boolean; taskId: string; data: Place[] } {
  const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const taskId = String(value.id || "");
  const status = String(value.status || "").toLowerCase();
  return { ready: status === "success" || (Array.isArray(value.data) && status !== "pending"), failure: status === "failure", taskId, data: flattenPlaces(value.data) };
}
async function readJson(url: string, apiKey: string) {
  const response = await fetch(url, { headers: { "X-API-KEY": apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(45_000) });
  if (!response.ok && response.status !== 202 && response.status !== 204) throw new Error(`Outscraper respondeu HTTP ${response.status}`);
  if (response.status === 204) return { status: "Failure" };
  return response.json();
}
export async function submitSearch(campaign: SearchCampaign): Promise<OutscraperRequest> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) throw new Error("OUTSCRAPER_API_KEY não configurada");
  const url = new URL("https://api.outscraper.com/google-maps-search");
  for (const term of campaign.searchTerms) url.searchParams.append("query", `${term}, ${campaign.location}`);
  url.searchParams.set("limit", String(campaign.maxResults));
  url.searchParams.set("totalLimit", String(Math.min(200, campaign.maxResults * campaign.searchTerms.length)));
  url.searchParams.set("dropDuplicates", "true");
  url.searchParams.set("async", "true");
  url.searchParams.set("fields", "query,name,place_id,google_id,full_address,site,phone,type,category,business_status");
  if (campaign.regionCode) url.searchParams.set("region", campaign.regionCode.toLowerCase());
  if (campaign.language) url.searchParams.set("language", campaign.language);
  const result = readResponse(await readJson(url.toString(), apiKey));
  if (!result.taskId) throw new Error("Outscraper não retornou o ID da busca");
  return { taskId: result.taskId, ready: result.ready, failure: result.failure };
}
export async function pollSearch(taskId: string) {
  if (!/^[a-zA-Z0-9_-]{4,160}$/.test(taskId)) throw new Error("ID de tarefa Outscraper inválido");
  const body = await readJson(`https://api.outscraper.cloud/requests/${encodeURIComponent(taskId)}`, process.env.OUTSCRAPER_API_KEY || "");
  const result = readResponse(body);
  return { ready: result.ready, failure: result.failure };
}

export async function importSearchResults(taskId: string, campaignId: string) {
  const body = await readJson(`https://api.outscraper.cloud/requests/${encodeURIComponent(taskId)}`, process.env.OUTSCRAPER_API_KEY || "");
  const result = readResponse(body);
  if (result.failure) throw new Error("A busca Outscraper terminou com falha");
  if (!result.ready) throw new Error("A busca Outscraper ainda não terminou");
  const { db } = await import("@/lib/db");
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Busca removida antes da importação");
  const candidates = result.data.flatMap(item => {
    const name = stringField(item, "name"); const phone = normalizePhone(stringField(item, "phone"));
    const website = stringField(item, "site", "website"); const placeId = stringField(item, "place_id", "google_id");
    const status = stringField(item, "business_status").toUpperCase();
    if (!name || phone.length < 9 || (status && status !== "OPERATIONAL")) return [];
    if (campaign.websiteTarget === "missing" && website) return [];
    if (campaign.websiteTarget === "present" && !website) return [];
    return [{ name: name.slice(0, 180), phone, company: name.slice(0, 180), website: website || null, address: stringField(item, "full_address").slice(0, 300) || null, category: stringField(item, "type", "category").slice(0, 120) || null, providerId: placeId ? `outscraper:${placeId}`.slice(0, 190) : null, source: `Outscraper: ${stringField(item, "query")}`.slice(0, 190), status: "READY" as const }];
  });
  const uniqueCandidates = Array.from(new Map(candidates.map(item => [item.phone, item])).values());
  if (!uniqueCandidates.length) return { found: 0, added: 0 };
  const suppressed = await db.suppression.findMany({ where: { phone: { in: uniqueCandidates.map(item => item.phone) } }, select: { phone: true } });
  const blockedPhones = new Set(suppressed.map(item => item.phone));
  const eligible = uniqueCandidates.filter(item => !blockedPhones.has(item.phone));
  const created = eligible.length ? await db.lead.createMany({ data: eligible, skipDuplicates: true }) : { count: 0 };
  return { found: uniqueCandidates.length, added: created.count };
}
