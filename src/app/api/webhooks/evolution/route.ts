import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { buildPhoneMatchVariants } from "@/lib/phone";
import {
  AI_STOPPED_STATUSES,
  isLeadBlocked,
  isOptOutMessage,
  isOutboundSystemEcho,
  shouldAiAutoReply,
} from "@/lib/safety";
import {
  runDirectAudioWaitAndReply,
  runDirectInboundWaitAndReply,
  trySendInngestEvent,
} from "@/lib/workflows";

export const maxDuration = 60;

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

  const variants = buildPhoneMatchVariants(jid.split("@")[0]);
  if (!variants.length) return NextResponse.json({ ok: true, ignored: true });

  const lead = await db.lead.findFirst({ where: { phone: { in: variants } } });
  if (!lead) return NextResponse.json({ ok: true, ignored: true });

  const msg = (data.message || {}) as Record<string, unknown>;
  const textBody = extractTextFromMessage(msg);

  // Mensagens enviadas manualmente pelo operador no WhatsApp pausam a IA sem travar ecos do proprio sistema.
  if (data.key.fromMe) {
    const twoMinutesAgo = new Date(Date.now() - 120_000);
    const recentOutbounds = await db.message.findMany({
      where: { leadId: lead.id, direction: "OUTBOUND", createdAt: { gte: twoMinutesAgo } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { externalId: true, body: true },
    });

    if (
      (data.key.id && (await db.message.findUnique({ where: { externalId: data.key.id }, select: { id: true } }))) ||
      isOutboundSystemEcho(textBody, data.key.id, recentOutbounds)
    ) {
      return NextResponse.json({ ok: true, ignored: true, systemEcho: true });
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

  if (!textBody && !isAudio) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (textBody && isOptOutMessage(textBody)) {
    await db.$transaction([
      db.suppression.upsert({
        where: { phone: lead.phone },
        create: { phone: lead.phone, reason: "Pedido de opt-out" },
        update: { reason: "Pedido de opt-out" },
      }),
      db.lead.update({
        where: { id: lead.id },
        data: { status: "OPTED_OUT", optOutAt: new Date() },
      }),
    ]);
    return NextResponse.json({ ok: true, optedOut: true });
  }

  if (data.key.id) {
    const duplicate = await db.message.findUnique({ where: { externalId: data.key.id } });
    if (duplicate) {
      if (shouldAiAutoReply(lead) && textBody && duplicate.direction === "INBOUND" && duplicate.leadId === lead.id) {
        const queued = await trySendInngestEvent({
          id: `inbound-${duplicate.id}`,
          name: "prospecta/message.received",
          data: { leadId: lead.id, messageId: duplicate.id },
        });
        if (!queued) {
          after(() =>
            runDirectInboundWaitAndReply(lead.id, duplicate.id).catch(err =>
              console.error("[Webhook] Falha resposta direta:", err)
            )
          );
        }
      }
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  const isPendingAudio = !textBody && isAudio;
  const inbound = await db.message.create({
    data: {
      leadId: lead.id,
      direction: "INBOUND",
      status: "DELIVERED",
      body: isPendingAudio ? "[Áudio recebido, transcrevendo...]" : textBody,
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

  if (isPendingAudio) {
    const rawBase64 =
      (typeof msg.base64 === "string" && msg.base64) ||
      (typeof data.base64 === "string" && data.base64) ||
      (typeof audioInfo?.base64 === "string" && audioInfo.base64) ||
      "";
    const inlineAudio = rawBase64.length > 0 && rawBase64.length <= 250_000 ? rawBase64 : undefined;

    const audioPayload = {
      leadId: lead.id,
      messageId: inbound.id,
      audioKey: data.key.id ? { id: data.key.id, remoteJid: data.key.remoteJid } : undefined,
      audioBase64: inlineAudio,
      audioMimeType: audioInfo?.mimetype || "audio/ogg",
    };

    const queued = await trySendInngestEvent({
      id: `audio-${inbound.id}`,
      name: "prospecta/audio.transcribe",
      data: audioPayload,
    });
    if (!queued) {
      after(() =>
        runDirectAudioWaitAndReply(audioPayload).catch(err =>
          console.error("[Webhook] Falha transcrição direta:", err)
        )
      );
    }
    return NextResponse.json({ ok: true, audioQueued: true });
  }

  const autoReplyAllowed = shouldAiAutoReply(lead);
  if (autoReplyAllowed) {
    const queued = await trySendInngestEvent({
      id: `inbound-${inbound.id}`,
      name: "prospecta/message.received",
      data: { leadId: lead.id, messageId: inbound.id },
    });
    if (!queued) {
      after(() =>
        runDirectInboundWaitAndReply(lead.id, inbound.id).catch(err =>
          console.error("[Webhook] Falha resposta direta:", err)
        )
      );
    }
  }

  return NextResponse.json({
    ok: true,
    queued: autoReplyAllowed,
    aiPaused: !autoReplyAllowed,
  });
}
