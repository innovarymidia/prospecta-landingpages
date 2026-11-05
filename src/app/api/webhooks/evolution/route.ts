import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { isLeadBlocked, isOptOutMessage } from "@/lib/safety";
import { inngest } from "@/inngest/client";
const eventSchema = z.object({ event: z.string().optional(), data: z.object({ key: z.object({ remoteJid: z.string(), fromMe: z.boolean().optional(), id: z.string().optional() }), message: z.record(z.string(), z.unknown()).optional(), messageType: z.string().optional(), pushName: z.string().optional(), messageTimestamp: z.union([z.string(), z.number()]).optional() }) });
export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") || 0) > 512_000) return NextResponse.json({ error: "Evento muito grande" }, { status: 413 });
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  const supplied = req.headers.get("x-webhook-secret") || "";
  if (!secret && process.env.NODE_ENV === "production") return NextResponse.json({ error: "Webhook sem segredo configurado" }, { status: 503 });
  if (secret && (Buffer.byteLength(supplied) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret)))) return NextResponse.json({ error: "Webhook não autorizado" }, { status: 401 });
  const parsed = eventSchema.safeParse(await req.json()); if (!parsed.success) return NextResponse.json({ ok: true, ignored: true });
  const { data } = parsed.data; if (data.key.fromMe) return NextResponse.json({ ok: true, ignored: true });
  const jid = data.key.remoteJid; if (jid.endsWith("@g.us") || jid.endsWith("@broadcast")) return NextResponse.json({ ok: true, ignored: true });
  const phone = normalizePhone(jid.split("@")[0]); const lead = await db.lead.findUnique({ where: { phone } });
  // Strict gate: no lead record + confirmed initial outreach = no AI processing.
  if (!lead || isLeadBlocked(lead)) return NextResponse.json({ ok: true, ignored: true });
  const msg = data.message || {}; const body = String((msg as Record<string, unknown>).conversation || (msg as Record<string, unknown>).extendedTextMessage && ((msg as Record<string, { text?: string }>).extendedTextMessage?.text) || "").trim();
  if (!body) return NextResponse.json({ ok: true, ignored: true });
  if (isOptOutMessage(body)) {
    await db.$transaction([db.suppression.upsert({ where: { phone }, create: { phone, reason: "Pedido de opt-out" }, update: { reason: "Pedido de opt-out" } }), db.lead.update({ where: { id: lead.id }, data: { status: "OPTED_OUT", optOutAt: new Date() } })]);
    return NextResponse.json({ ok: true, optedOut: true });
  }
  if (data.key.id) {
    const duplicate = await db.message.findUnique({ where: { externalId: data.key.id } });
    if (duplicate) {
      if (duplicate.direction === "INBOUND" && duplicate.leadId === lead.id) await inngest.send({ id: `inbound-${duplicate.id}`, name: "prospecta/message.received", data: { leadId: lead.id, messageId: duplicate.id } });
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }
  const inbound = await db.message.create({ data: { leadId: lead.id, direction: "INBOUND", status: "DELIVERED", body, externalId: data.key.id || undefined } });
  await db.lead.update({ where: { id: lead.id }, data: { status: "REPLIED", lastMessageAt: new Date() } });
  await inngest.send({ id: `inbound-${inbound.id}`, name: "prospecta/message.received", data: { leadId: lead.id, messageId: inbound.id } });
  return NextResponse.json({ ok: true, queued: true });
}
