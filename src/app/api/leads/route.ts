import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorized, unauthorized, sameOrigin } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
const schema = z.object({ name: z.string().min(1), phone: z.string().min(8), company: z.string().optional(), website: z.string().optional(), source: z.string().optional(), notes: z.string().optional() });
export async function GET(req: NextRequest) {
  if (!await authorized()) return unauthorized();
  const leads = await db.lead.findMany({ orderBy: { updatedAt: "desc" }, take: 200, include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } });
  return NextResponse.json(leads);
}
export async function POST(req: NextRequest) {
  if (!await authorized()) return unauthorized();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const data = parsed.data; const phone = normalizePhone(data.phone);
  if (await db.suppression.findUnique({ where: { phone } })) return NextResponse.json({ error: "Contato está na lista de supressão" }, { status: 409 });
  const lead = await db.lead.upsert({ where: { phone }, create: { ...data, phone, status: "READY" }, update: { ...data, status: "READY" } });
  return NextResponse.json(lead, { status: 201 });
}
