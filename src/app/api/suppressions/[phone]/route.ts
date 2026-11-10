import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorized, unauthorized, sameOrigin } from "@/lib/auth";
import { buildPhoneMatchVariants } from "@/lib/phone";
import { reopenedLeadStatus } from "@/lib/safety";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  if (!await authorized()) return unauthorized();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });

  const { phone: rawPhone } = await params;
  const variants = buildPhoneMatchVariants(rawPhone);
  if (!variants.length) {
    return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
  }

  const affectedLeads = await db.lead.findMany({
    where: {
      phone: { in: variants },
      OR: [{ status: { in: ["OPTED_OUT", "BLOCKED"] } }, { optOutAt: { not: null } }],
    },
    select: { id: true, initialSentAt: true },
  });

  await db.$transaction([
    db.suppression.deleteMany({
      where: { phone: { in: variants } },
    }),
    ...affectedLeads.map(lead =>
      db.lead.update({
        where: { id: lead.id },
        data: {
          optOutAt: null,
          status: reopenedLeadStatus(lead.initialSentAt),
        },
      })
    ),
  ]);

  return NextResponse.json({ ok: true, unblocked: variants[0], restoredLeads: affectedLeads.length });
}
