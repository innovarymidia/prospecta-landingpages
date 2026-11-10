import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { AI_STOPPED_STATUSES, isLeadBlocked, isOptOutMessage, shouldAiAutoReply } from "@/lib/safety";
import { getMediaBase64 } from "@/lib/evolution";
import { transcribeAudio } from "@/lib/ai";
import { inngest } from "@/inngest/client";

const eventSchema = z.object({
  event: z.string().optional(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),
      fromMe: z.boolean().optional(),
      id: z.string().optional(),
    }),
    message: z.record(z.string(), z.unknown()).optional(),
    messageType: z.string().optional(),
    pushName: z.string().optional(),
    messageTimestamp: z.union([z.string(), z.number()]).optional(),
    base64: z.string().optional(),
  }),
});

function extractTextFromMessage(msg: Record<string, unknown>): string {
  const extended = msg.extendedTextMessage as { text?: string } | undefined;
  const imageMsg = msg.imageMessage as { caption?: string } | undefined;
  const videoMsg = msg.videoMessage as { caption?: string } | undefined;
  const documentMsg = msg.documentMessage as { caption?: string } | undefined;
  return String(
    msg.conversation ||
      extended?.text ||
      imageMsg?.caption ||
      videoMsg?.caption ||
      documentMsg?.caption ||
      ""
  ).trim();
}

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") || 0) > 4_000_000) {
    return NextResponse.json({ error: "Evento muito grande" }, { status: 413 });
  }

  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  const supplied = req.headers.get("x-webhook-secret") || "";
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Webhook sem segredo configurado" }, { status: 503 });
  }
  if (
    secret &&
    (Buffer.byteLength(supplied) !== Buffer.byteLength(secret) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret)))
  ) {
    return NextResponse.json({ error: "Webhook não autorizado" }, { status: 401 });
  }

  const parsed = eventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true, ignored: true });

  const { data } = parsed.data;
  const jid = data.key.remoteJid;
  if (jid.endsWith("@g.us") || jid.endsWith("@broadcast")) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const phone = normalizePhone(jid.split("@")[0]);
  const lead = await db.lead.findUnique({ where: { phone } });
  if (!lead) return NextResponse.json({ ok: true, ignored: true });

  const msg = (data.message || {}) as Record<string, unknown>;
  const textBody = extractTextFromMessage(msg);

  // Mensagens enviadas pelo proprio WhatsApp do operador (celular ou Web):
  // se nao forem eco do sistema, registram no historico e pausam a IA.
  if (data.key.fromMe) {
    if (data.key.id) {
      const existingById = await db.message.findUnique({ where: { externalId: data.key.id } });
      if (existingById) return NextResponse.json({ ok: true, ignored: true, systemEcho: true });
    }

    if (textBody) {
      const twoMinutesAgo = new Date(Date.now() - 120_000);
      const recentOutbound = await db.message.findMany({
        where: { leadId: lead.id, direction: "OUTBOUND", createdAt: { gte: twoMinutesAgo } },
        orderBy: { createdAt: "desc" },
        take: 6,
      });
      const normalizedBody = textBody.trim();
      if (recentOutbound.some(m => m.body.trim() === normalizedBody)) {
        return NextResponse.json({ ok: true, ignored: true, systemEcho: true });
      }
    }

    const humanBody = textBody || "[Mensagem ou áudio enviado pelo atendente no WhatsApp]";
    await db.$transaction([
      db.message.create({
        data: {
          leadId: lead.id,
          direction: "OUTBOUND",
          purpose: "REPLY",
          status: "SENT",
          body: humanBody,
          externalId: data.key.id || undefined,
        },
      }),
      db.lead.update({
        where: { id: lead.id },
        data: {
          aiPausedAt: lead.aiPausedAt || new Date(),
          lastMessageAt: new Date(),
        },
      }),
    ]);
    return NextResponse.json({ ok: true, humanTakeover: true });
  }

  // Bloqueio rigoroso na entrada: exige abordagem inicial registrada e sem opt-out ou bloqueio.
  if (isLeadBlocked(lead)) return NextResponse.json({ ok: true, ignored: true });

  const audioInfo = (msg.audioMessage || msg.pttMessage) as
    | { mimetype?: string; base64?: string }
    | undefined;
  const isAudio = Boolean(audioInfo) || data.messageType === "audioMessage";

  let body = textBody;
  let optOutSource = textBody;
  let audioUnreadable = false;

  if (!body && isAudio) {
    let base64Audio =
      (typeof msg.base64 === "string" && msg.base64) ||
      (typeof data.base64 === "string" && data.base64) ||
      (typeof audioInfo?.base64 === "string" && audioInfo.base64) ||
      "";
    let mimeType = audioInfo?.mimetype || "audio/ogg";

    if (!base64Audio && data.key.id) {
      const downloaded = await getMediaBase64({
        id: data.key.id,
        remoteJid: data.key.remoteJid,
        fromMe: false,
      });
      if (downloaded) {
        base64Audio = downloaded.base64;
        mimeType = downloaded.mimetype;
      }
    }

    const transcribed = base64Audio ? await transcribeAudio(base64Audio, mimeType) : null;
    if (transcribed) {
      body = `[Áudio transcrito]: ${transcribed}`;
      optOutSource = transcribed;
    } else {
      body = "[Áudio recebido (não foi possível transcrever)]";
      audioUnreadable = true;
    }
  }

  if (!body) return NextResponse.json({ ok: true, ignored: true });

  if (!audioUnreadable && isOptOutMessage(optOutSource)) {
    await db.$transaction([
      db.suppression.upsert({
        where: { phone },
        create: { phone, reason: "Pedido de opt-out" },
        update: { reason: "Pedido de opt-out" },
      }),
      db.lead.update({
        where: { id: lead.id },
        data: { status: "OPTED_OUT", optOutAt: new Date() },
      }),
    ]);
    return NextResponse.json({ ok: true, optedOut: true });
  }

  const autoReplyAllowed = !audioUnreadable && shouldAiAutoReply(lead);

  if (data.key.id) {
    const duplicate = await db.message.findUnique({ where: { externalId: data.key.id } });
    if (duplicate) {
      if (autoReplyAllowed && duplicate.direction === "INBOUND" && duplicate.leadId === lead.id) {
        await inngest.send({
          id: `inbound-${duplicate.id}`,
          name: "prospecta/message.received",
          data: { leadId: lead.id, messageId: duplicate.id },
        });
      }
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  const inbound = await db.message.create({
    data: {
      leadId: lead.id,
      direction: "INBOUND",
      status: "DELIVERED",
      body,
      externalId: data.key.id || undefined,
    },
  });

  await db.lead.update({
    where: { id: lead.id },
    data: {
      status: AI_STOPPED_STATUSES.has(lead.status) ? lead.status : "REPLIED",
      lastMessageAt: new Date(),
    },
  });

  if (autoReplyAllowed) {
    await inngest.send({
      id: `inbound-${inbound.id}`,
      name: "prospecta/message.received",
      data: { leadId: lead.id, messageId: inbound.id },
    });
  }

  return NextResponse.json({
    ok: true,
    queued: autoReplyAllowed,
    aiPaused: !autoReplyAllowed,
    audioUnreadable,
  });
}
