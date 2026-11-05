import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorized, unauthorized, sameOrigin } from "@/lib/auth";
import { inngest } from "@/inngest/client";

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

  if (process.env.AUTOMATION_ENABLED !== "true") {
    return NextResponse.json({ error: "Automação e envios estão pausados no servidor" }, { status: 423 });
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 1200) {
    return NextResponse.json({ error: "Texto da mensagem deve ter entre 1 e 1200 caracteres" }, { status: 400 });
  }

  const purpose = lead.initialSentAt ? "REPLY" : "INITIAL";
  const msg = await db.message.create({
    data: {
      leadId: id,
      direction: "OUTBOUND",
      purpose,
      body: text,
      status: "QUEUED",
    },
  });

  await inngest.send({
    id: `send-${msg.id}`,
    name: "prospecta/message.send",
    data: { leadId: id, messageId: msg.id },
  });

  return NextResponse.json({ queued: true, messageId: msg.id, purpose }, { status: 202 });
}
