import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isBotOrPreviewUserAgent, isValidExternalHttpUrl } from "@/lib/sniper";

/**
 * Rota pública rastreada (/v/[slug]): contabiliza cliques reais humanos do prospect
 * e redireciona imediatamente (HTTP 307, sem cache) para a URL externa da prévia manual.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug || !/^[a-z0-9-]{2,80}$/i.test(slug)) {
    return new NextResponse("Prévia não encontrada.", { status: 404 });
  }

  const lead = await db.lead.findUnique({
    where: { previewSlug: slug.toLowerCase() },
    select: { id: true, previewUrl: true },
  });

  if (!lead || !lead.previewUrl || !isValidExternalHttpUrl(lead.previewUrl)) {
    return new NextResponse("Esta prévia expirou ou ainda não foi publicada.", { status: 404 });
  }

  const isAdminSession = Boolean(req.cookies.get("prospecta_session")?.value);
  const isCrawler = isBotOrPreviewUserAgent(req.headers.get("user-agent"));

  if (!isAdminSession && !isCrawler) {
    try {
      await db.lead.update({
        where: { id: lead.id },
        data: {
          previewViews: { increment: 1 },
          lastViewedAt: new Date(),
        },
      });
    } catch {
      // Nunca impede o prospect de abrir o site caso ocorra falha transitória na contagem
    }
  }

  return NextResponse.redirect(lead.previewUrl, {
    status: 307,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
