import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorized, sameOrigin, unauthorized } from "@/lib/auth";

const updateSchema = z.object({
  status: z.enum([
    "NEW",
    "READY",
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
  notes: z.string().trim().max(2000).optional().nullable(),
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

  const data = parsed.data;
  if (data.status === "OPTED_OUT") {
    await db.suppression.upsert({
      where: { phone: lead.phone },
      create: { phone: lead.phone, reason: "Opt-out manual no painel" },
      update: { reason: "Opt-out manual no painel" },
    });
  }

  const updated = await db.lead.update({
    where: { id },
    data: {
      ...data,
      optOutAt: data.status === "OPTED_OUT" ? (lead.optOutAt || new Date()) : lead.optOutAt,
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

