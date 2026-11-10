import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActiveSearchProvider } from "@/lib/search-provider";
import { claimNextDailyCampaign, executeDirectCampaignSearch } from "@/lib/workflows";

export const maxDuration = 60;

function isAuthorizedCron(req: NextRequest): { ok: boolean; status: 401 | 503 } {
  const expected = (process.env.CRON_SECRET || process.env.AUTH_SECRET || "").trim();
  if (!expected) return { ok: false, status: 503 };

  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401 };

  if (Buffer.byteLength(token) !== Buffer.byteLength(expected)) {
    return { ok: false, status: 401 };
  }
  const match = timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  return match ? { ok: true, status: 401 } : { ok: false, status: 401 };
}

export async function GET(req: NextRequest) {
  const auth = isAuthorizedCron(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 503 ? "Segredo de cron não configurado" : "Não autorizado" },
      { status: auth.status }
    );
  }

  if (!getActiveSearchProvider()) {
    return NextResponse.json({ ok: true, skipped: "no-search-provider" });
  }

  const campaignId = await claimNextDailyCampaign();
  if (!campaignId) {
    return NextResponse.json({ ok: true, queued: 0 });
  }

  const result = await executeDirectCampaignSearch(campaignId, false);
  return NextResponse.json({ ok: true, campaignId, ...result });
}

