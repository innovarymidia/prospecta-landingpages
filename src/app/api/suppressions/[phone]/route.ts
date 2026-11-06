import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorized, unauthorized, sameOrigin } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  if (!await authorized()) return unauthorized();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });

  const { phone: rawPhone } = await params;
  const phone = normalizePhone(rawPhone);

  await db.suppression.deleteMany({
    where: { phone },
  });

  return NextResponse.json({ ok: true, unblocked: phone });
}

