import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFollowUpSuggestion,
  buildTrackedPreviewUrl,
  generatePreviewSlug,
  getFollowUpStage,
  getLeadGoldScore,
  hasRealWebsite,
  isBotOrPreviewUserAgent,
  isValidExternalHttpUrl,
  isValidPreviewImage,
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
    generatePreviewSlug("Locação & Máquinas São Paulo Ltda!", "clx12345abc"),
    "locacao-maquinas-sao-paulo-ltda-45abc"
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
  assert.match(buildFollowUpSuggestion("Locadora Beta", "DAY_5"), /arquivar/i);
});

test("isBotOrPreviewUserAgent detects WhatsApp link preview crawlers", () => {
  assert.equal(isBotOrPreviewUserAgent("WhatsApp/2.23.20.0 A"), true);
  assert.equal(isBotOrPreviewUserAgent("facebookexternalhit/1.1"), true);
  assert.equal(
    isBotOrPreviewUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"),
    false
  );
});
