import { inngest } from "./client";
import { db } from "@/lib/db";
import { generateReply, transcribeAudio } from "@/lib/ai";
import { getMediaBase64, sendMedia, sendText } from "@/lib/evolution";
import { buildTrackedPreviewUrl, pickNextQueueCampaignId } from "@/lib/sniper";
import { importSearchResults, pollSearch, submitSearch } from "@/lib/outscraper";
import { getInboundBufferSeconds, isLeadBlocked, isOptOutMessage, shouldAiAutoReply } from "@/lib/safety";
import { getMessagingEnabled } from "@/lib/settings";

const inboundBufferSeconds = getInboundBufferSeconds(process.env.INBOUND_BUFFER_SECONDS);

export const transcribeInboundAudio = inngest.createFunction(
  {
    id: "prospecta-transcribe-audio",
    concurrency: { limit: 1, key: "event.data.leadId" },
    retries: 3,
  },
  { event: "prospecta/audio.transcribe" },
  async ({ event, step }) => {
    const { leadId, messageId, audioKey, audioBase64, audioMimeType } = event.data as {
      leadId: string;
      messageId: string;
      audioKey?: { id: string; remoteJid?: string };
      audioBase64?: string;
      audioMimeType?: string;
    };

    const transcribed = await step.run("transcribe-whatsapp-audio", async () => {
      let base64 = audioBase64 || "";
      let mime = audioMimeType || "audio/ogg";
      if (!base64 && audioKey?.id) {
        const downloaded = await getMediaBase64({ id: audioKey.id, remoteJid: audioKey.remoteJid, fromMe: false });
        if (downloaded) {
          base64 = downloaded.base64;
          mime = downloaded.mimetype;
        }
      }
      if (!base64) return null;
      return transcribeAudio(base64, mime);
    });

    const outcome = await step.run("save-audio-transcription", async () => {
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
    });

    if ("queueReply" in outcome && outcome.queueReply) {
      await step.sendEvent("queue-transcribed-message", {
        id: `inbound-${messageId}`,
        name: "prospecta/message.received",
        data: { leadId, messageId },
      });
    }

    return outcome;
  }
);

export const processInbound = inngest.createFunction(
  {
    id: "prospecta-process-inbound",
    debounce: {
      period: `${inboundBufferSeconds}s`,
      key: "event.data.leadId",
      timeout: `${Math.max(90, inboundBufferSeconds * 2)}s`,
    },
    concurrency: { limit: 1, key: "event.data.leadId" },
    retries: 4,
  },
  { event: "prospecta/message.received" },
  async ({ event, step }) => {
    const { leadId, messageId } = event.data as { leadId: string; messageId: string };
    const context = await step.run("load-authorized-conversation", async () => {
      const lead = await db.lead.findUnique({
        where: { id: leadId },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 16 } },
      });
      if (!lead || !shouldAiAutoReply(lead)) return null;
      const suppression = await db.suppression.findUnique({ where: { phone: lead.phone } });
      if (suppression) return null;
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
    });
    const messagingActive = context
      ? await step.run("check-messaging-enabled", () => getMessagingEnabled())
      : false;
    if (!context || !messagingActive) return { skipped: true };

    const trackedLink = context.lead.previewUrl
      ? buildTrackedPreviewUrl(context.lead.previewSlug, process.env.APP_URL) || context.lead.previewUrl
      : null;
    const contextParts = [
      context.lead.company,
      context.lead.website ? `Site atual: ${context.lead.website}` : "Sem site próprio",
      typeof context.lead.rating === "number" ? `Nota Google: ${context.lead.rating.toFixed(1)} (${context.lead.reviewsCount ?? 0} avaliações)` : null,
      trackedLink ? `Link da prévia já enviada: ${trackedLink}` : null,
      context.lead.notes,
    ].filter(Boolean).join(" | ");

    const answer = await step.run("draft-contextual-reply", () =>
      generateReply(context.lead.name, contextParts, context.history)
    );
    const message = await step.run("save-reply-draft", async () => {
      const lead = await db.lead.findUnique({ where: { id: leadId } });
      if (!lead || !shouldAiAutoReply(lead)) return null;
      const suppression = await db.suppression.findUnique({ where: { phone: context.lead.phone } });
      if (suppression) return null;
      const latest = await db.message.findFirst({ where: { leadId, direction: "INBOUND" }, orderBy: { createdAt: "desc" } });
      if (!latest || latest.id !== messageId) return null;
      return db.message.create({ data: { leadId, direction: "OUTBOUND", purpose: "AI_REPLY", status: "QUEUED", body: answer } });
    });
    if (!message) return { skipped: true };
    await step.sendEvent("queue-reply-for-send", { id: `send-${message.id}`, name: "prospecta/message.send", data: { leadId, messageId: message.id } });
    return { queued: true };
  }
);

export const sendOutbound = inngest.createFunction(
  {
    id: "prospecta-send-outbound",
    concurrency: { limit: 1, key: "event.data.leadId" },
    throttle: { limit: Math.max(1, Number(process.env.SEND_RATE_PER_MINUTE || 8)), period: "1m", burst: 0 },
    retries: 5,
  },
  { event: "prospecta/message.send" },
  async ({ event, step }) => {
    const { leadId, messageId } = event.data as { leadId: string; messageId: string };
    const payload = await step.run("validate-before-send", async () => {
      const [lead, message, messagingActive] = await Promise.all([
        db.lead.findUnique({ where: { id: leadId } }),
        db.message.findUnique({ where: { id: messageId } }),
        getMessagingEnabled(),
      ]);
      if (!messagingActive) return null;
      if (!lead || !message || message.direction !== "OUTBOUND" || message.status === "SENT") return null;
      if (lead.optOutAt || ["OPTED_OUT", "BLOCKED"].includes(lead.status) || await db.suppression.findUnique({ where: { phone: lead.phone } })) return null;
      if (message.purpose === "AI_REPLY" && !shouldAiAutoReply(lead)) return null;
      if (message.purpose === "REPLY" && isLeadBlocked(lead)) return null;
      return { phone: lead.phone, body: message.body, mediaUrl: message.mediaUrl, purpose: message.purpose, status: message.status };
    });
    if (!payload) return { skipped: true };
    const sent = await step.run("send-through-evolution", () =>
      payload.mediaUrl ? sendMedia(payload.phone, payload.body, payload.mediaUrl) : sendText(payload.phone, payload.body)
    );
    await step.run("record-confirmed-send", async () => {
      const lead = await db.lead.findUnique({ where: { id: leadId } });
      if (!lead || lead.optOutAt || ["OPTED_OUT", "BLOCKED"].includes(lead.status)) return;
      const shouldAdvanceToSent = payload.purpose === "INITIAL" && ["NEW", "READY", "BUILDING", "DEMO_READY"].includes(lead.status);
      await db.$transaction([
        db.message.update({ where: { id: messageId }, data: { status: "SENT", externalId: sent.key?.id } }),
        db.lead.update({ where: { id: leadId }, data: { initialSentAt: payload.purpose === "INITIAL" ? (lead.initialSentAt || new Date()) : lead.initialSentAt, lastMessageAt: new Date(), status: shouldAdvanceToSent ? "SENT" : lead.status } }),
      ]);
    });
    return { sent: true };
  }
);

export const queueDueSearches = inngest.createFunction(
  { id: "prospecta-schedule-searches", retries: 2 },
  { cron: "15 * * * *" },
  async ({ step }) => {
    const nextCampaignId = await step.run("find-next-daily-campaign", async () => {
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
      return pickNextQueueCampaignId(campaigns);
    });

    if (!nextCampaignId) return { queued: 0 };

    const daySlot = Math.floor(Date.now() / (23 * 3_600_000));
    const claimed = await step.run(`claim-${nextCampaignId}`, async () =>
      db.campaign.updateMany({
        where: {
          id: nextCampaignId,
          enabled: true,
          OR: [{ lastSearchRequestedAt: null }, { lastSearchRequestedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } }],
        },
        data: { lastSearchRequestedAt: new Date(), lastSearchStatus: "QUEUED", lastSearchError: null },
      })
    );
    if (claimed.count) {
      await step.sendEvent(`schedule-${nextCampaignId}`, {
        id: `search-${nextCampaignId}-${daySlot}`,
        name: "prospecta/search.requested",
        data: { campaignId: nextCampaignId, force: false },
      });
      return { queued: 1, campaignId: nextCampaignId };
    }
    return { queued: 0 };
  }
);

export const searchCampaign = inngest.createFunction(
  {
    id: "prospecta-search-companies",
    concurrency: { limit: 1, key: "event.data.campaignId" },
    throttle: { limit: 1, period: "5m", key: "event.data.campaignId" },
    retries: 3,
  },
  { event: "prospecta/search.requested" },
  async ({ event, step, attempt }) => {
    const { campaignId, force } = event.data as { campaignId: string; force?: boolean };
    const run = await step.run("start-search-run", async () => {
      const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) return null;
      if (!campaign.enabled && !force) { await db.campaign.update({ where: { id: campaignId }, data: { lastSearchStatus: "PAUSED" } }); return null; }
      const searchRun = await db.searchRun.create({ data: { campaignId, status: "RUNNING", termsCount: campaign.searchTerms.length } });
      await db.campaign.update({ where: { id: campaignId }, data: { lastSearchStatus: "RUNNING", lastSearchError: null } });
      return { runId: searchRun.id, campaign: { searchTerms: campaign.searchTerms, location: campaign.location, regionCode: campaign.regionCode, language: campaign.language, maxResults: campaign.maxResults, websiteTarget: campaign.websiteTarget } };
    });
    if (!run) return { skipped: true };
    try {
      if (!process.env.OUTSCRAPER_API_KEY) throw new Error("OUTSCRAPER_API_KEY não configurada");
      const submitted = await step.run("submit-outscreener-task", () => submitSearch(run.campaign));
      if (submitted.failure) throw new Error("Outscraper recusou a solicitação de busca");
      let ready = submitted.ready;
      for (let poll = 0; !ready && poll < 24; poll++) {
        await step.sleep(`wait-outscreener-${attempt}-${poll}`, "20s");
        const state = await step.run(`poll-outscreener-${attempt}-${poll}`, () => pollSearch(submitted.taskId));
        if (state.failure) throw new Error("Outscraper terminou a busca com falha");
        ready = state.ready;
      }
      if (!ready) throw new Error("Outscraper excedeu o tempo de espera de 8 minutos");
      const imported = await step.run("import-search-results", () => importSearchResults(submitted.taskId, campaignId));
      await step.run("finish-search-run", async () => {
        await db.$transaction([
          db.searchRun.update({ where: { id: run.runId }, data: { status: "SUCCESS", found: imported.found, added: imported.added, finishedAt: new Date() } }),
          db.campaign.update({ where: { id: campaignId }, data: { lastSearchedAt: new Date(), lastSearchStatus: "SUCCESS", lastSearchCount: imported.found, lastSearchAdded: imported.added, lastSearchError: null } }),
        ]);
      });
      return { ...imported, status: "SUCCESS" };
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Falha desconhecida").slice(0, 300);
      await step.run("record-search-failure", async () => {
        await db.$transaction([
          db.searchRun.update({ where: { id: run.runId }, data: { status: "FAILED", error: message, finishedAt: new Date() } }),
          db.campaign.update({ where: { id: campaignId }, data: { lastSearchStatus: "FAILED", lastSearchError: message } }),
        ]);
      });
      throw error;
    }
  }
);

export const functions = [transcribeInboundAudio, processInbound, sendOutbound, queueDueSearches, searchCampaign];
