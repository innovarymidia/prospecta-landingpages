import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorized, unauthorized, sameOrigin } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";

const schema = z.object({
  phone: z.string().min(8).max(25),
  reason: z.string().trim().min(1).max(250).default("Bloqueio manual"),
});

export async function GET() {
  if (!await authorized()) return unauthorized();
  const suppressions = await db.suppression.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(suppressions);
}

export async function POST(req: NextRequest) {
  if (!await authorized()) return unauthorized();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const phone = normalizePhone(parsed.data.phone);
  const suppression = await db.suppression.upsert({
    where: { phone },
    create: { phone, reason: parsed.data.reason },
    update: { reason: parsed.data.reason },
  });

  // Se o lead existir, marca como OPTED_OUT
  await db.lead.updateMany({
    where: { phone },
    data: { status: "OPTED_OUT", optOutAt: new Date() },
  });

  return NextResponse.json(suppression, { status: 201 });
}
