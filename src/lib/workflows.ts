import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { generateReply, transcribeAudio } from "@/lib/ai";
import { getMediaBase64, sendMedia, sendText } from "@/lib/evolution";
import { importLeadCandidates } from "@/lib/lead-import";
import { importSearchResults, pollSearch, submitSearch } from "@/lib/outscraper";
import {
  getDirectBufferSeconds,
  isLeadBlocked,
  isOptOutMessage,
  shouldAiAutoReply,
  shouldUseInngest,
} from "@/lib/safety";
import { getActiveSearchProvider } from "@/lib/search-provider";
import { searchApifyCampaign } from "@/lib/apify";
import { searchSerperCampaign } from "@/lib/serper";
import { getMessagingEnabled } from "@/lib/settings";
import { buildTrackedPreviewUrl, pickNextQueueCampaignId, resolveAppBaseUrl } from "@/lib/sniper";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Tenta enviar evento para o Inngest apenas quando configurado. Em desenvolvimento local,
 * faz fallback para execução direta caso o Dev Server (porta 8288) esteja desligado.
 */
export async function trySendInngestEvent(payload: {
  id: string;
  name: "prospecta/audio.transcribe" | "prospecta/message.received" | "prospecta/message.send" | "prospecta/search.requested";
  data: Record<string, unknown>;
}): Promise<boolean> {
  if (!shouldUseInngest()) return false;
  try {
    await inngest.send(payload as Parameters<typeof inngest.send>[0]);
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Workflows] Inngest Dev indisponível, executando fluxo direto:", err instanceof Error ? err.message : err);
      return false;
    }
    throw err;
  }
}

export async function transcribeAudioMedia(input: {
  audioKey?: { id: string; remoteJid?: string };
  audioBase64?: string;
  audioMimeType?: string;
}): Promise<string | null> {
  let base64 = input.audioBase64 || "";
  let mime = input.audioMimeType || "audio/ogg";
  if (!base64 && input.audioKey?.id) {
    const downloaded = await getMediaBase64({
      id: input.audioKey.id,
      remoteJid: input.audioKey.remoteJid,
      fromMe: false,
    });
    if (downloaded) {
      base64 = downloaded.base64;
      mime = downloaded.mimetype;
    }
  }
  if (!base64) return null;
  return transcribeAudio(base64, mime);
}

export async function saveAudioTranscription(
  leadId: string,
  messageId: string,
  transcribed: string | null
): Promise<{ skipped?: boolean; unreadable?: boolean; optedOut?: boolean; queueReply?: boolean }> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { skipped: true };

  if (!transcribed) {
    await db.message.updateMany({
      where: { id: messageId },
      data: { body: "[Áudio recebido (transcrição indisponível)]" },
    });
    return { unreadable: true };
  }

  if (isOptOutMessage(transcribed)) {
    await db.$transaction([
      db.message.updateMany({
        where: { id: messageId },
        data: { body: `[Áudio transcrito]: ${transcribed}` },
      }),
      db.suppression.upsert({
        where: { phone: lead.phone },
        create: { phone: lead.phone, reason: "Pedido de opt-out em áudio" },
        update: { reason: "Pedido de opt-out em áudio" },
      }),
      db.lead.update({
        where: { id: lead.id },
        data: { status: "OPTED_OUT", optOutAt: new Date() },
      }),
    ]);
    return { optedOut: true };
  }

  await db.message.updateMany({
    where: { id: messageId },
    data: { body: `[Áudio transcrito]: ${transcribed}` },
  });

  return { queueReply: shouldAiAutoReply(lead) };
}

export async function loadInboundReplyContext(leadId: string, messageId: string) {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 16 } },
  });
  if (!lead || !shouldAiAutoReply(lead)) return null;
  if (await db.suppression.findUnique({ where: { phone: lead.phone } })) return null;

  const latestInbound = lead.messages.find(m => m.direction === "INBOUND");
  if (!latestInbound || latestInbound.id !== messageId) return null;
  if (latestInbound.body.startsWith("[Áudio recebido")) return null;

  const history = lead.messages
    .slice()
    .reverse()
    .map(m => `${m.direction === "INBOUND" ? "Cliente" : "Consultor"}: ${m.body}`);

  return {
    lead: {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      company: lead.company,
      website: lead.website,
      rating: lead.rating,
      reviewsCount: lead.reviewsCount,
      previewUrl: lead.previewUrl,
      previewSlug: lead.previewSlug,
      notes: lead.notes,
    },
    history,
  };
}

export async function generateContextualReplyText(
  context: NonNullable<Awaited<ReturnType<typeof loadInboundReplyContext>>>
): Promise<string> {
  const trackedLink = context.lead.previewUrl
    ? buildTrackedPreviewUrl(context.lead.previewSlug, resolveAppBaseUrl()) || context.lead.previewUrl
    : null;
  const contextParts = [
    context.lead.company,
    context.lead.website ? `Site atual: ${context.lead.website}` : "Sem site próprio",
    typeof context.lead.rating === "number"
      ? `Nota Google: ${context.lead.rating.toFixed(1)} (${context.lead.reviewsCount ?? 0} avaliações)`
      : null,
    trackedLink ? `Link da prévia já enviada: ${trackedLink}` : null,
    context.lead.notes,
  ]
    .filter(Boolean)
    .join(" | ");

  return generateReply(context.lead.name, contextParts, context.history);
}

export async function saveAiReplyDraft(
  leadId: string,
  phone: string,
  expectedMessageId: string,
  answer: string
) {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead || !shouldAiAutoReply(lead)) return null;
  if (await db.suppression.findUnique({ where: { phone } })) return null;
  const latest = await db.message.findFirst({
    where: { leadId, direction: "INBOUND" },
    orderBy: { createdAt: "desc" },
  });
  if (!latest || latest.id !== expectedMessageId) return null;
  return db.message.create({
    data: { leadId, direction: "OUTBOUND", purpose: "AI_REPLY", status: "QUEUED", body: answer },
  });
}

export async function loadValidOutboundPayload(leadId: string, messageId: string) {
  const [lead, message, messagingActive] = await Promise.all([
    db.lead.findUnique({ where: { id: leadId } }),
    db.message.findUnique({ where: { id: messageId } }),
    getMessagingEnabled(),
  ]);
  if (!messagingActive) return null;
  if (!lead || !message || message.direction !== "OUTBOUND" || message.status === "SENT") return null;
  if (
    lead.optOutAt ||
    ["OPTED_OUT", "BLOCKED"].includes(lead.status) ||
    (await db.suppression.findUnique({ where: { phone: lead.phone } }))
  ) {
    return null;
  }
  if (message.purpose === "AI_REPLY" && !shouldAiAutoReply(lead)) return null;
  if (message.purpose === "REPLY" && isLeadBlocked(lead)) return null;

  return {
    phone: lead.phone,
    body: message.body,
    mediaUrl: message.mediaUrl,
    purpose: message.purpose,
    status: message.status,
  };
}

export async function recordConfirmedSend(
  leadId: string,
  messageId: string,
  purpose: string | null,
  externalId?: string
) {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.optOutAt || ["OPTED_OUT", "BLOCKED"].includes(lead.status)) return;
  const shouldAdvanceToSent =
    purpose === "INITIAL" && ["NEW", "READY", "BUILDING", "DEMO_READY"].includes(lead.status);
  await db.$transaction([
    db.message.update({ where: { id: messageId }, data: { status: "SENT", externalId } }),
    db.lead.update({
      where: { id: leadId },
      data: {
        initialSentAt: purpose === "INITIAL" ? lead.initialSentAt || new Date() : lead.initialSentAt,
        lastMessageAt: new Date(),
        status: shouldAdvanceToSent ? "SENT" : lead.status,
      },
    }),
  ]);
}

export async function deliverOutboundMessage(
  leadId: string,
  messageId: string,
  options: { markFailedOnError?: boolean } = {}
): Promise<{ sent?: boolean; skipped?: boolean }> {
  const payload = await loadValidOutboundPayload(leadId, messageId);
  if (!payload) return { skipped: true };

  try {
    const sent = payload.mediaUrl
      ? await sendMedia(payload.phone, payload.body, payload.mediaUrl)
      : await sendText(payload.phone, payload.body);
    await recordConfirmedSend(leadId, messageId, payload.purpose, sent.key?.id ?? undefined);
    return { sent: true };
  } catch (error) {
    if (options.markFailedOnError) {
      await db.message.updateMany({ where: { id: messageId }, data: { status: "FAILED" } }).catch(() => {});
    }
    throw error;
  }
}

export async function runDirectInboundWaitAndReply(
  leadId: string,
  messageId: string,
  maxWaitSeconds = 45
) {
  const waitSeconds = Math.min(getDirectBufferSeconds(process.env.INBOUND_BUFFER_SECONDS), maxWaitSeconds);
  await sleep(waitSeconds * 1000);

  const context = await loadInboundReplyContext(leadId, messageId);
  if (!context || !(await getMessagingEnabled())) return { skipped: true };

  const answer = await generateContextualReplyText(context);
  const message = await saveAiReplyDraft(leadId, context.lead.phone, messageId, answer);
  if (!message) return { skipped: true };

  return deliverOutboundMessage(leadId, message.id, { markFailedOnError: true });
}

export async function runDirectAudioWaitAndReply(input: {
  leadId: string;
  messageId: string;
  audioKey?: { id: string; remoteJid?: string };
  audioBase64?: string;
  audioMimeType?: string;
}) {
  const transcribed = await transcribeAudioMedia(input);
  const outcome = await saveAudioTranscription(input.leadId, input.messageId, transcribed);
  if (!outcome.queueReply) return outcome;
  return runDirectInboundWaitAndReply(input.leadId, input.messageId, 40);
}

export async function claimNextDailyCampaign(): Promise<string | null> {
  if (!getActiveSearchProvider()) return null;

  const dailyCutoff = new Date(Date.now() - 23 * 60 * 60 * 1000);
  const [recentRun, activeCampaign] = await Promise.all([
    db.searchRun.findFirst({
      where: { startedAt: { gte: dailyCutoff }, status: { in: ["RUNNING", "SUCCESS"] } },
      select: { id: true },
    }),
    db.campaign.findFirst({
      where: { lastSearchStatus: { in: ["QUEUED", "RUNNING"] } },
      select: { id: true },
    }),
  ]);
  if (recentRun || activeCampaign) return null;

  const campaigns = await db.campaign.findMany({
    where: { enabled: true },
    take: 250,
    orderBy: { createdAt: "asc" },
  });
  const nextCampaignId = pickNextQueueCampaignId(campaigns);
  if (!nextCampaignId) return null;

  const claimed = await db.campaign.updateMany({
    where: {
      id: nextCampaignId,
      enabled: true,
      OR: [{ lastSearchRequestedAt: null }, { lastSearchRequestedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } }],
    },
    data: { lastSearchRequestedAt: new Date(), lastSearchStatus: "QUEUED", lastSearchError: null },
  });

  return claimed.count ? nextCampaignId : null;
}

export async function startSearchRunRecord(campaignId: string, force = false) {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return null;
  if (!campaign.enabled && !force) {
    await db.campaign.update({ where: { id: campaignId }, data: { lastSearchStatus: "PAUSED" } });
    return null;
  }
  const searchRun = await db.searchRun.create({
    data: { campaignId, status: "RUNNING", termsCount: campaign.searchTerms.length },
  });
  await db.campaign.update({
    where: { id: campaignId },
    data: { lastSearchStatus: "RUNNING", lastSearchError: null },
  });
  return {
    runId: searchRun.id,
    campaign: {
      searchTerms: campaign.searchTerms,
      location: campaign.location,
      regionCode: campaign.regionCode,
      language: campaign.language,
      maxResults: campaign.maxResults,
      websiteTarget: campaign.websiteTarget,
    },
  };
}

export async function finishSearchRunRecord(runId: string, campaignId: string, imported: { found: number; added: number }) {
  await db.$transaction([
    db.searchRun.update({
      where: { id: runId },
      data: { status: "SUCCESS", found: imported.found, added: imported.added, finishedAt: new Date() },
    }),
    db.campaign.update({
      where: { id: campaignId },
      data: {
        lastSearchedAt: new Date(),
        lastSearchStatus: "SUCCESS",
        lastSearchCount: imported.found,
        lastSearchAdded: imported.added,
        lastSearchError: null,
      },
    }),
  ]);
}

export async function failSearchRunRecord(runId: string, campaignId: string, error: unknown) {
  const message = (error instanceof Error ? error.message : "Falha desconhecida").slice(0, 300);
  await db.$transaction([
    db.searchRun.update({ where: { id: runId }, data: { status: "FAILED", error: message, finishedAt: new Date() } }),
    db.campaign.update({ where: { id: campaignId }, data: { lastSearchStatus: "FAILED", lastSearchError: message } }),
  ]);
}

/**
 * Executa busca e importação em provedores síncronos/diretos (Apify ou Serper Maps).
 */
export async function runSyncMapsSearch(
  provider: "apify" | "serper",
  campaign: NonNullable<Awaited<ReturnType<typeof startSearchRunRecord>>>["campaign"]
): Promise<{ found: number; added: number }> {
  const candidates =
    provider === "apify" ? await searchApifyCampaign(campaign) : await searchSerperCampaign(campaign);
  const summary = await importLeadCandidates(candidates, {
    websiteTarget: campaign.websiteTarget,
    requireMapsScore: true,
    defaultSource: provider === "apify" ? "Apify Maps" : "Serper Maps",
  });
  return { found: summary.qualified, added: summary.added };
}

/**
 * Executa busca síncrona direta (Apify ou Serper Maps) fora do Inngest.
 */
export async function executeDirectCampaignSearch(campaignId: string, force = false) {
  const run = await startSearchRunRecord(campaignId, force);
  if (!run) return { skipped: true };

  try {
    const provider = getActiveSearchProvider();
    if (!provider) throw new Error("Configure APIFY_TOKEN (grátis mensal) ou SERPER_API_KEY para buscar no Maps");

    let imported: { found: number; added: number };
    if (provider === "apify" || provider === "serper") {
      imported = await runSyncMapsSearch(provider, run.campaign);
    } else {
      const submitted = await submitSearch(run.campaign);
      if (submitted.failure) throw new Error("Outscraper recusou a solicitação de busca");
      let ready = submitted.ready;
      for (let poll = 0; !ready && poll < 4; poll++) {
        await sleep(10_000);
        const state = await pollSearch(submitted.taskId);
        if (state.failure) throw new Error("Outscraper terminou com falha");
        ready = state.ready;
      }
      if (!ready) throw new Error("Outscraper demorou acima do limite sem Inngest; prefira APIFY_TOKEN");
      imported = await importSearchResults(submitted.taskId, campaignId);
    }

    await finishSearchRunRecord(run.runId, campaignId, imported);
    return { ...imported, status: "SUCCESS" };
  } catch (error) {
    await failSearchRunRecord(run.runId, campaignId, error);
    throw error;
  }
}
