import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorized, unauthorized, sameOrigin } from "@/lib/auth";
import { buildPhoneMatchVariants, normalizePhone } from "@/lib/phone";
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
  const q = req.nextUrl.searchParams.get("q")?.trim();

  const leads = await db.lead.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { address: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      id: true,
      name: true,
      phone: true,
      company: true,
      website: true,
      address: true,
      category: true,
      rating: true,
      reviewsCount: true,
      hours: true,
      providerId: true,
      previewUrl: true,
      previewSlug: true,
      previewViews: true,
      lastViewedAt: true,
      source: true,
      status: true,
      notes: true,
      initialSentAt: true,
      lastMessageAt: true,
      aiPausedAt: true,
      createdAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true },
      },
    },
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
  const variants = buildPhoneMatchVariants(phone);

  if (await db.suppression.findFirst({ where: { phone: { in: variants } } })) {
    return NextResponse.json({ error: "Contato está na lista de bloqueio" }, { status: 409 });
  }

  const existing = await db.lead.findFirst({
    where: { phone: { in: variants } },
    select: { id: true, name: true, company: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: `Já existe uma empresa cadastrada com este WhatsApp (${existing.company || existing.name}).` },
      { status: 409 }
    );
  }

  const cleanPreviewUrl = data.previewUrl?.trim() || null;
  const slug = cleanPreviewUrl ? generatePreviewSlug(data.company || data.name, phone.slice(-4)) : null;
  const status = cleanPreviewUrl ? "DEMO_READY" : "READY";

  const lead = await db.lead.create({
    data: { ...data, previewUrl: cleanPreviewUrl, previewSlug: slug, phone, status },
  });
  return NextResponse.json(lead, { status: 201 });
}
