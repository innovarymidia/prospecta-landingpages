import { inngest } from "./client";
import { importLeadCandidates } from "@/lib/lead-import";
import { importSearchResults, pollSearch, submitSearch } from "@/lib/outscraper";
import { getInboundBufferSeconds } from "@/lib/safety";
import { getActiveSearchProvider } from "@/lib/search-provider";
import { searchSerperCampaign } from "@/lib/serper";
import { getMessagingEnabled } from "@/lib/settings";
import {
  claimNextDailyCampaign,
  deliverOutboundMessage,
  failSearchRunRecord,
  finishSearchRunRecord,
  generateContextualReplyText,
  loadInboundReplyContext,
  saveAiReplyDraft,
  saveAudioTranscription,
  startSearchRunRecord,
  transcribeAudioMedia,
} from "@/lib/workflows";

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

    const transcribed = await step.run("transcribe-whatsapp-audio", () =>
      transcribeAudioMedia({ audioKey, audioBase64, audioMimeType })
    );
    const outcome = await step.run("save-audio-transcription", () =>
      saveAudioTranscription(leadId, messageId, transcribed)
    );

    if (outcome.queueReply) {
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
    const context = await step.run("load-authorized-conversation", () =>
      loadInboundReplyContext(leadId, messageId)
    );
    const messagingActive = context
      ? await step.run("check-messaging-enabled", () => getMessagingEnabled())
      : false;
    if (!context || !messagingActive) return { skipped: true };

    const answer = await step.run("draft-contextual-reply", () =>
      generateContextualReplyText(context)
    );
    const message = await step.run("save-reply-draft", () =>
      saveAiReplyDraft(leadId, context.lead.phone, messageId, answer)
    );
    if (!message) return { skipped: true };

    await step.sendEvent("queue-reply-for-send", {
      id: `send-${message.id}`,
      name: "prospecta/message.send",
      data: { leadId, messageId: message.id },
    });
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
    return step.run("deliver-outbound-message", () => deliverOutboundMessage(leadId, messageId));
  }
);

export const queueDueSearches = inngest.createFunction(
  { id: "prospecta-schedule-searches", retries: 2 },
  { cron: "15 * * * *" },
  async ({ step }) => {
    const nextCampaignId = await step.run("claim-next-daily-campaign", () => claimNextDailyCampaign());
    if (!nextCampaignId) return { queued: 0 };

    const daySlot = Math.floor(Date.now() / (23 * 3_600_000));
    await step.sendEvent(`schedule-${nextCampaignId}`, {
      id: `search-${nextCampaignId}-${daySlot}`,
      name: "prospecta/search.requested",
      data: { campaignId: nextCampaignId, force: false },
    });
    return { queued: 1, campaignId: nextCampaignId };
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
    const run = await step.run("start-search-run", () => startSearchRunRecord(campaignId, Boolean(force)));
    if (!run) return { skipped: true };

    try {
      const provider = getActiveSearchProvider();
      if (!provider) throw new Error("Configure SERPER_API_KEY (grátis) ou OUTSCRAPER_API_KEY");

      let imported: { found: number; added: number };
      if (provider === "serper") {
        const result = await step.run("search-and-import-serper", async () => {
          const candidates = await searchSerperCampaign(run.campaign);
          return importLeadCandidates(candidates, {
            websiteTarget: run.campaign.websiteTarget,
            requireMapsScore: true,
            defaultSource: "Serper Maps",
          });
        });
        imported = { found: result.qualified, added: result.added };
      } else {
        const submitted = await step.run("submit-outscraper-task", () => submitSearch(run.campaign));
        if (submitted.failure) throw new Error("Outscraper recusou a solicitação de busca");
        let ready = submitted.ready;
        for (let poll = 0; !ready && poll < 24; poll++) {
          await step.sleep(`wait-outscraper-${attempt}-${poll}`, "20s");
          const state = await step.run(`poll-outscraper-${attempt}-${poll}`, () => pollSearch(submitted.taskId));
          if (state.failure) throw new Error("Outscraper terminou a busca com falha");
          ready = state.ready;
        }
        if (!ready) throw new Error("Outscraper excedeu o tempo de espera de 8 minutos");
        imported = await step.run("import-search-results", () => importSearchResults(submitted.taskId, campaignId));
      }

      await step.run("finish-search-run", () => finishSearchRunRecord(run.runId, campaignId, imported));
      return { ...imported, status: "SUCCESS" };
    } catch (error) {
      await step.run("record-search-failure", () => failSearchRunRecord(run.runId, campaignId, error));
      throw error;
    }
  }
);

export const functions = [transcribeInboundAudio, processInbound, sendOutbound, queueDueSearches, searchCampaign];
