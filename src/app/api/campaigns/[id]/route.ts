import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorized, sameOrigin, unauthorized } from "@/lib/auth";
const updateSchema = z.object({ enabled: z.boolean().optional(), name: z.string().trim().min(2).max(100).optional(), searchTerms: z.array(z.string().trim().min(2).max(80)).min(1).max(8).optional(), location: z.string().trim().min(2).max(120).optional(), regionCode: z.string().trim().length(2).optional().or(z.literal("")), language: z.string().trim().min(2).max(8).optional(), maxResults: z.number().int().min(1).max(100).optional(), websiteTarget: z.enum(["any", "missing", "present"]).optional(), intervalHours: z.number().int().min(6).max(720).optional() });
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorized()) return unauthorized();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { id } = await params; const data = parsed.data;
  const campaign = await db.campaign.update({ where: { id }, data: { ...data, regionCode: data.regionCode === "" ? null : data.regionCode, criteria: data.searchTerms?.join(", ") } }).catch(() => null);
  if (!campaign) return NextResponse.json({ error: "Busca não encontrada" }, { status: 404 });
  return NextResponse.json(campaign);
}
