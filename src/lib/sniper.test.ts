import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFollowUpSuggestion,
  buildTrackedPreviewUrl,
  extractRegionLabel,
  formatRelativeTimeBr,
  generatePreviewSlug,
  getFollowUpStage,
  getLeadGoldScore,
  hasRealWebsite,
  isBotOrPreviewUserAgent,
  isQualifiedLeadPhone,
  isQualifiedMapsLead,
  isValidExternalHttpUrl,
  isValidPreviewImage,
  pickNextQueueCampaignId,
  resolveAppBaseUrl,
  sortHotLeads,
} from "./sniper.ts";

test("isValidExternalHttpUrl allows http/https and blocks dangerous schemes", () => {
  assert.equal(isValidExternalHttpUrl("https://locadora-alpha.com.br"), true);
  assert.equal(isValidExternalHttpUrl("http://preview.local:3001/demo"), true);
  assert.equal(isValidExternalHttpUrl("javascript:alert(1)"), false);
  assert.equal(isValidExternalHttpUrl("data:text/html,<h1>x</h1>"), false);
  assert.equal(isValidExternalHttpUrl(""), false);
});

test("isValidPreviewImage validates base64 image URIs and http URLs", () => {
  assert.equal(isValidPreviewImage("data:image/jpeg;base64,ABC123=="), true);
  assert.equal(isValidPreviewImage("https://cdn.example.com/print.png"), true);
  assert.equal(isValidPreviewImage("data:text/html;base64,PGgxPg=="), false);
});

test("generatePreviewSlug normalizes Portuguese accents and appends suffix", () => {
  assert.equal(
    generatePreviewSlug("Locação de Máquinas, São Paulo Ltda!", "clx12345abc"),
    "locacao-de-maquinas-sao-paulo-ltda-45abc"
  );
  assert.equal(buildTrackedPreviewUrl("teste-slug", "https://app.site.com/"), "https://app.site.com/v/teste-slug");
});

test("hasRealWebsite treats Instagram and Linktree as no dedicated website", () => {
  assert.equal(hasRealWebsite(null), false);
  assert.equal(hasRealWebsite("https://www.instagram.com/locadorax/"), false);
  assert.equal(hasRealWebsite("https://linktr.ee/locadorax"), false);
  assert.equal(hasRealWebsite("https://locadoracampinas.com.br"), true);
});

test("getLeadGoldScore flags businesses without real website and strong Maps traction", () => {
  assert.equal(
    getLeadGoldScore({ website: null, rating: 4.7, reviewsCount: 34 }).isGold,
    true
  );
  assert.equal(
    getLeadGoldScore({ website: "https://instagram.com/x", rating: 4.5, reviewsCount: 12 }).isGold,
    true
  );
  assert.equal(
    getLeadGoldScore({ website: "https://siteproprio.com.br", rating: 4.9, reviewsCount: 80 }).isGold,
    false
  );
  assert.equal(
    getLeadGoldScore({ website: null, rating: 4.1, reviewsCount: 25 }).isGold,
    false
  );
});

test("getFollowUpStage detects DAY_2 and DAY_5 only for SENT leads", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  assert.equal(
    getFollowUpStage({ status: "SENT", initialSentAt: "2026-11-08T10:00:00Z" }, now).due,
    "DAY_2"
  );
  assert.equal(
    getFollowUpStage({ status: "SENT", initialSentAt: "2026-11-05T10:00:00Z" }, now).due,
    "DAY_5"
  );
  assert.equal(
    getFollowUpStage({ status: "REPLIED", initialSentAt: "2026-11-01T10:00:00Z" }, now).due,
    false
  );
  const day5 = buildFollowUpSuggestion("Locadora Beta", "DAY_5");
  assert.match(day5, /tirar o link de demonstração do ar/i);
  assert.doesNotMatch(day5, /homologação|servidor de testes/i);
});

test("extractRegionLabel derives city and state cleanly without inventing data", () => {
  assert.equal(extractRegionLabel("Av. Brasil 400, Campinas, SP, 13000"), "Campinas, SP");
  assert.equal(extractRegionLabel(null, "Outscraper: locadora, Curitiba PR"), "Curitiba PR");
  assert.equal(extractRegionLabel(null, null), "Outras regiões");
});

test("formatRelativeTimeBr and sortHotLeads highlight recent preview viewers", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  assert.equal(formatRelativeTimeBr("2026-11-10T11:50:00Z", now), "há 10 min");
  assert.equal(formatRelativeTimeBr("2026-11-10T09:00:00Z", now), "há 3h");

  const sorted = sortHotLeads([
    { id: "none", previewViews: 0, lastViewedAt: null },
    { id: "older", previewViews: 3, lastViewedAt: "2026-11-09T10:00:00Z" },
    { id: "newest", previewViews: 1, lastViewedAt: "2026-11-10T11:55:00Z" },
  ]);
  assert.deepEqual(
    sorted.map(item => item.id),
    ["newest", "older"]
  );
});

test("isQualifiedMapsLead filters invalid phones and keeps Instagram-only strong businesses", () => {
  assert.equal(isQualifiedLeadPhone("5519999999999"), true);
  assert.equal(isQualifiedLeadPhone("08001234567"), false);
  assert.equal(isQualifiedLeadPhone("5508001234567"), false);
  assert.equal(isQualifiedLeadPhone("40031234"), false);
  assert.equal(isQualifiedLeadPhone("12345"), false);

  assert.equal(
    isQualifiedMapsLead({
      name: "Locadora Top",
      phone: "5519999991111",
      website: "https://instagram.com/locadoratop",
      businessStatus: "OPERATIONAL",
      rating: 4.8,
      reviewsCount: 18,
      websiteTarget: "missing",
    }),
    true
  );

  assert.equal(
    isQualifiedMapsLead({
      name: "Locadora Com Site",
      phone: "5519999992222",
      website: "https://locadoracomsite.com.br",
      businessStatus: "OPERATIONAL",
      rating: 4.9,
      reviewsCount: 50,
      websiteTarget: "missing",
    }),
    false
  );

  assert.equal(
    isQualifiedMapsLead({
      name: "Locadora Poucas Avaliacoes",
      phone: "5519999993333",
      website: null,
      businessStatus: "OPERATIONAL",
      rating: 4.5,
      reviewsCount: 2,
      websiteTarget: "missing",
    }),
    false
  );

  assert.equal(
    isQualifiedMapsLead({
      name: "Locadora Nota Baixa",
      phone: "5519999994444",
      website: null,
      businessStatus: "OPERATIONAL",
      rating: 3.4,
      reviewsCount: 22,
      websiteTarget: "missing",
    }),
    false
  );
});

test("pickNextQueueCampaignId prioritizes never-searched enabled campaigns", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const picked = pickNextQueueCampaignId(
    [
      {
        id: "paused",
        enabled: false,
        searchTerms: ["locadora"],
        location: "Campinas, SP",
        intervalHours: 720,
        lastSearchedAt: null,
        lastSearchRequestedAt: null,
        lastSearchStatus: null,
      },
      {
        id: "recent",
        enabled: true,
        searchTerms: ["locadora"],
        location: "Sao Paulo, SP",
        intervalHours: 720,
        lastSearchedAt: "2026-11-05T10:00:00Z",
        lastSearchRequestedAt: null,
        lastSearchStatus: "SUCCESS",
      },
      {
        id: "fresh",
        enabled: true,
        searchTerms: ["locadora"],
        location: "Curitiba, PR",
        intervalHours: 720,
        lastSearchedAt: null,
        lastSearchRequestedAt: null,
        lastSearchStatus: null,
      },
    ],
    now
  );
  assert.equal(picked, "fresh");
});

test("isBotOrPreviewUserAgent detects WhatsApp link preview crawlers", () => {
  assert.equal(isBotOrPreviewUserAgent("WhatsApp/2.23.20.0 A"), true);
  assert.equal(isBotOrPreviewUserAgent("facebookexternalhit/1.1"), true);
  assert.equal(
    isBotOrPreviewUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"),
    false
  );
});

test("resolveAppBaseUrl prefers APP_URL, falls back to VERCEL_PROJECT_PRODUCTION_URL, then requestOrigin", () => {
  assert.equal(
    resolveAppBaseUrl("http://localhost:3000", "https://prospecta-landingpages.vercel.app/", "other.vercel.app"),
    "https://prospecta-landingpages.vercel.app"
  );
  assert.equal(
    resolveAppBaseUrl("http://localhost:3000", "", "prospecta-landingpages.vercel.app"),
    "https://prospecta-landingpages.vercel.app"
  );
  assert.equal(
    resolveAppBaseUrl("https://preview.local:3000/login", "", ""),
    "https://preview.local:3000"
  );
  assert.equal(resolveAppBaseUrl("", "javascript:alert(1)", ""), "");
});
