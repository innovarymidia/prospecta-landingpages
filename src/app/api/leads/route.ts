import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorized, unauthorized, sameOrigin } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { generatePreviewSlug, isValidExternalHttpUrl } from "@/lib/sniper";

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8),
  company: z.string().optional(),
  website: z.string().optional(),
  category: z.string().optional(),
  address: z.string().optional(),
  rating: z.number().min(0).max(5).optional().nullable(),
  reviewsCount: z.number().int().min(0).optional().nullable(),
  previewUrl: z.string().trim().optional().nullable(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  if (!await authorized()) return unauthorized();
  const requestedLimit = Number(req.nextUrl.searchParams.get("limit") || 500);
  const take = Number.isFinite(requestedLimit) ? Math.min(1000, Math.max(50, Math.round(requestedLimit))) : 500;
  const leads = await db.lead.findMany({
    orderBy: { updatedAt: "desc" },
    take,
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  if (!await authorized()) return unauthorized();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const data = parsed.data;
  if (data.previewUrl && !isValidExternalHttpUrl(data.previewUrl)) {
    return NextResponse.json({ error: "URL da prévia deve iniciar com http:// ou https://" }, { status: 400 });
  }

  const phone = normalizePhone(data.phone);
  if (await db.suppression.findUnique({ where: { phone } })) {
    return NextResponse.json({ error: "Contato está na lista de supressão" }, { status: 409 });
  }

  const cleanPreviewUrl = data.previewUrl?.trim() || null;
  const slug = cleanPreviewUrl ? generatePreviewSlug(data.company || data.name, phone.slice(-4)) : null;
  const status = cleanPreviewUrl ? "DEMO_READY" : "READY";

  const lead = await db.lead.upsert({
    where: { phone },
    create: { ...data, previewUrl: cleanPreviewUrl, previewSlug: slug, phone, status },
    update: { ...data, previewUrl: cleanPreviewUrl, ...(slug ? { previewSlug: slug } : {}), status },
  });
  return NextResponse.json(lead, { status: 201 });
}
