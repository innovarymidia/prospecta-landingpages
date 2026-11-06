import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorized, unauthorized } from "@/lib/auth";
import { generateInitialApproach } from "@/lib/ai";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorized()) return unauthorized();
  const { id } = await params;
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });

  const draft = await generateInitialApproach({
    name: lead.name,
    company: lead.company,
    website: lead.website,
    notes: lead.notes,
    category: lead.category,
  });

  return NextResponse.json({ draft });
}

