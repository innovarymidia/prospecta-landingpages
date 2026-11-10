import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorized, sameOrigin, unauthorized } from "@/lib/auth";
import { generatePreviewSlug, isValidExternalHttpUrl, isValidPreviewImage } from "@/lib/sniper";

const updateSchema = z.object({
  status: z.enum([
    "NEW",
    "READY",
    "BUILDING",
    "DEMO_READY",
    "SENT",
    "REPLIED",
    "QUALIFIED",
    "MEETING",
    "WON",
    "LOST",
    "OPTED_OUT",
    "BLOCKED",
  ]).optional(),
  name: z.string().trim().min(1).max(180).optional(),
  company: z.string().trim().max(180).optional().nullable(),
  website: z.string().trim().max(300).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  category: z.string().trim().max(120).optional().nullable(),
  rating: z.number().min(0).max(5).optional().nullable(),
  reviewsCount: z.number().int().min(0).optional().nullable(),
  previewUrl: z.string().trim().max(500).optional().nullable(),
  previewImage: z.string().trim().max(2_600_000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  aiPaused: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorized()) return unauthorized();
  const { id } = await params;
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  return NextResponse.json(lead);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorized()) return unauthorized();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });

  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });

  const { aiPaused, ...leadFields } = parsed.data;
  if (leadFields.previewUrl !== undefined && leadFields.previewUrl !== null && leadFields.previewUrl !== "" && !isValidExternalHttpUrl(leadFields.previewUrl)) {
    return NextResponse.json({ error: "URL da prévia deve iniciar com http:// ou https://" }, { status: 400 });
  }
  if (leadFields.previewImage !== undefined && leadFields.previewImage !== null && leadFields.previewImage !== "" && !isValidPreviewImage(leadFields.previewImage)) {
    return NextResponse.json({ error: "Imagem da prévia inválida ou acima do limite (máx ~1.8MB)" }, { status: 400 });
  }

  if (leadFields.status === "OPTED_OUT" || leadFields.status === "BLOCKED") {
    const reason = leadFields.status === "OPTED_OUT" ? "Opt-out manual no painel" : "Bloqueio manual no painel";
    await db.suppression.upsert({
      where: { phone: lead.phone },
      create: { phone: lead.phone, reason },
      update: { reason },
    });
  }

  const nextPreviewUrl = leadFields.previewUrl !== undefined ? (leadFields.previewUrl || null) : lead.previewUrl;
  const nextPreviewSlug =
    nextPreviewUrl && !lead.previewSlug
      ? generatePreviewSlug(leadFields.company || lead.company || leadFields.name || lead.name, lead.id)
      : lead.previewSlug;

  let nextStatus = leadFields.status;
  if (!nextStatus && leadFields.previewUrl && ["NEW", "READY", "BUILDING"].includes(lead.status)) {
    nextStatus = "DEMO_READY";
  }

  const updated = await db.lead.update({
    where: { id },
    data: {
      ...leadFields,
      previewUrl: leadFields.previewUrl !== undefined ? nextPreviewUrl : undefined,
      previewSlug: nextPreviewSlug,
      previewImage: leadFields.previewImage !== undefined ? (leadFields.previewImage || null) : undefined,
      ...(nextStatus ? { status: nextStatus } : {}),
      optOutAt:
        (nextStatus || lead.status) === "OPTED_OUT" || (nextStatus || lead.status) === "BLOCKED"
          ? lead.optOutAt || new Date()
          : lead.optOutAt,
      ...(aiPaused !== undefined ? { aiPausedAt: aiPaused ? new Date() : null } : {}),
    },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json(updated);
}
