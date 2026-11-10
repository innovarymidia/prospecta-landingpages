import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorized, sameOrigin, unauthorized } from "@/lib/auth";
import { getActiveSearchProvider } from "@/lib/search-provider";
import { executeDirectCampaignSearch, trySendInngestEvent } from "@/lib/workflows";

export const maxDuration = 60;

const inputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  searchTerms: z.array(z.string().trim().min(2).max(80)).min(1).max(8),
  location: z.string().trim().min(2).max(120),
  regionCode: z.string().trim().length(2).optional().or(z.literal("")),
  language: z.string().trim().min(2).max(8).default("pt"),
  maxResults: z.number().int().min(1).max(100).default(25),
  websiteTarget: z.enum(["any", "missing", "present"]).default("missing"),
  intervalHours: z.number().int().min(6).max(720).default(720),
  enabled: z.boolean().default(true),
});
export async function GET() {
  if (!await authorized()) return unauthorized();
  return NextResponse.json(await db.campaign.findMany({ orderBy: { updatedAt: "desc" }, include: { searchRuns: { orderBy: { startedAt: "desc" }, take: 5 } } }));
}
export async function POST(req: NextRequest) {
  if (!await authorized()) return unauthorized();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  if (!getActiveSearchProvider()) return NextResponse.json({ error: "Configure SERPER_API_KEY (grátis) ou OUTSCRAPER_API_KEY antes de criar buscas" }, { status: 503 });
  const data = parsed.data;
  const now = new Date();
  const campaign = await db.campaign.create({ data: { ...data, regionCode: data.regionCode?.toUpperCase() || null, criteria: data.searchTerms.join(", "), lastSearchRequestedAt: data.enabled ? now : null, lastSearchStatus: data.enabled ? "QUEUED" : null } });
  if (campaign.enabled) {
    const queued = await trySendInngestEvent({
      id: `search-${campaign.id}-${now.getTime()}`,
      name: "prospecta/search.requested",
      data: { campaignId: campaign.id, force: false },
    });
    if (!queued) {
      after(() =>
        executeDirectCampaignSearch(campaign.id, false).catch(err =>
          console.error("[Campaigns] Falha na busca direta:", err)
        )
      );
    }
  }
  return NextResponse.json(campaign, { status: 201 });
}
