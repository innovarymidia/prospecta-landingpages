import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorized, sameOrigin, unauthorized } from "@/lib/auth";
import { checkEvolutionConnection } from "@/lib/evolution";
import { getMessagingEnabled, setMessagingEnabled } from "@/lib/settings";
import { resolveAppBaseUrl } from "@/lib/sniper";

export async function GET(req: NextRequest) {
  if (!await authorized()) return unauthorized();

  const [whatsapp, messagingEnabled] = await Promise.all([
    checkEvolutionConnection(),
    getMessagingEnabled(),
  ]);
  const publicAppUrl = resolveAppBaseUrl(req.nextUrl.origin);
  const isLocalhostUrl = /localhost|127\.0\.0\.1/i.test(publicAppUrl);

  return NextResponse.json({
    automationEnabled: messagingEnabled,
    businessName: process.env.BUSINESS_NAME || "Sua empresa",
    whatsapp,
    publicAppUrl,
    isLocalhostUrl,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_WHATSAPP_API_KEY),
    searchConfigured: Boolean(process.env.OUTSCRAPER_API_KEY),
  });
}

const patchSchema = z.object({
  messagingEnabled: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  if (!await authorized()) return unauthorized();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const messagingEnabled = await setMessagingEnabled(parsed.data.messagingEnabled);
  return NextResponse.json({ automationEnabled: messagingEnabled });
}
