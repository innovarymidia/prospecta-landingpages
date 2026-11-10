import { NextRequest, NextResponse } from "next/server";
import { authorized, unauthorized } from "@/lib/auth";
import { checkEvolutionConnection } from "@/lib/evolution";

export async function GET(req: NextRequest) {
  if (!await authorized()) return unauthorized();

  const whatsapp = await checkEvolutionConnection();
  const publicAppUrl = (process.env.APP_URL || req.nextUrl.origin || "").trim().replace(/\/+$/, "");
  const isLocalhostUrl = /localhost|127\.0\.0\.1/i.test(publicAppUrl);

  return NextResponse.json({
    automationEnabled: process.env.AUTOMATION_ENABLED === "true",
    businessName: process.env.BUSINESS_NAME || "Sua empresa",
    businessOffer: process.env.BUSINESS_OFFER || "Serviços profissionais",
    whatsapp,
    publicAppUrl,
    isLocalhostUrl,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_WHATSAPP_API_KEY),
    searchConfigured: Boolean(process.env.OUTSCRAPER_API_KEY),
  });
}
