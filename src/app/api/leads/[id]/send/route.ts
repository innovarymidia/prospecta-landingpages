import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorized, unauthorized, sameOrigin } from "@/lib/auth";
import { inngest } from "@/inngest/client";
import { isValidPreviewImage } from "@/lib/sniper";
import { getMessagingEnabled } from "@/lib/settings";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorized()) return unauthorized();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });

  const { id } = await params;
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead || lead.optOutAt || lead.status === "OPTED_OUT" || lead.status === "BLOCKED") {
    return NextResponse.json({ error: "Lead inexistente ou com contato bloqueado" }, { status: 409 });
  }

  const suppressed = await db.suppression.findUnique({ where: { phone: lead.phone } });
  if (suppressed) {
    return NextResponse.json({ error: "Contato presente na lista de supressão" }, { status: 409 });
  }

  if (!(await getMessagingEnabled())) {
    return NextResponse.json(
      { error: "Envios de mensagens estão pausados no painel. Retome os envios para disparar." },
      { status: 423 }
    );
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 1200) {
    return NextResponse.json({ error: "Texto da mensagem deve ter entre 1 e 1200 caracteres" }, { status: 400 });
  }

  const includePreviewImage = Boolean(body?.includePreviewImage);
  const candidateMedia = typeof body?.mediaUrl === "string" && body.mediaUrl.trim()
    ? body.mediaUrl.trim()
    : (includePreviewImage ? lead.previewImage : null);

  if (candidateMedia && !isValidPreviewImage(candidateMedia)) {
    return NextResponse.json({ error: "Imagem anexada inválida ou excede o tamanho suportado" }, { status: 400 });
  }

  const purpose = lead.initialSentAt ? "REPLY" : "INITIAL";
  const msg = await db.message.create({
    data: {
      leadId: id,
      direction: "OUTBOUND",
      purpose,
      body: text,
      mediaUrl: candidateMedia || null,
      status: "QUEUED",
    },
  });

  if (purpose === "REPLY") {
    await db.lead.update({
      where: { id },
      data: { aiPausedAt: lead.aiPausedAt || new Date() },
    });
  }

  await inngest.send({
    id: `send-${msg.id}`,
    name: "prospecta/message.send",
    data: { leadId: id, messageId: msg.id },
  });

  return NextResponse.json(
    { queued: true, messageId: msg.id, purpose, hasMedia: Boolean(candidateMedia), aiPaused: purpose === "REPLY" },
    { status: 202 }
  );
}
