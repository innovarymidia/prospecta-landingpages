import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorized, sameOrigin, unauthorized } from "@/lib/auth";
import { inngest } from "@/inngest/client";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorized()) return unauthorized();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  if (!process.env.OUTSCRAPER_API_KEY) return NextResponse.json({ error: "Configure OUTSCRAPER_API_KEY" }, { status: 503 });
  const { id } = await params; const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Busca não encontrada" }, { status: 404 });
  const cutoff = new Date(Date.now() - 5 * 60 * 1000); const now = new Date();
  const claim = await db.campaign.updateMany({ where: { id, OR: [{ lastSearchRequestedAt: null }, { lastSearchRequestedAt: { lt: cutoff } }], AND: [{ OR: [{ lastSearchStatus: null }, { lastSearchStatus: { notIn: ["QUEUED", "RUNNING"] } }] }] }, data: { lastSearchRequestedAt: now, lastSearchStatus: "QUEUED", lastSearchError: null } });
  if (!claim.count) return NextResponse.json({ error: "Esta busca já está na fila, em execução ou foi iniciada há menos de 5 minutos" }, { status: 429 });
  const eventId = `search-${campaign.id}-${Date.now()}`;
  try { await inngest.send({ id: eventId, name: "prospecta/search.requested", data: { campaignId: campaign.id, force: true } }); }
  catch (error) { await db.campaign.update({ where: { id }, data: { lastSearchStatus: "FAILED", lastSearchError: error instanceof Error ? error.message.slice(0, 300) : "Falha ao enviar busca à fila" } }); throw error; }
  return NextResponse.json({ queued: true, eventId }, { status: 202 });
}
