import test from "node:test";
import assert from "node:assert/strict";
import { buildFallbackApproach, normalizeAudioMimeType } from "./ai.ts";

test("normalizeAudioMimeType strips codec suffixes and falls back to audio/ogg", () => {
  assert.equal(normalizeAudioMimeType("audio/ogg; codecs=opus"), "audio/ogg");
  assert.equal(normalizeAudioMimeType("audio/mpeg"), "audio/mpeg");
  assert.equal(normalizeAudioMimeType(""), "audio/ogg");
  assert.equal(normalizeAudioMimeType(null), "audio/ogg");
});

test("buildFallbackApproach crafts a customized respectful pitch when no preview exists", () => {
  const pitch = buildFallbackApproach({
    name: "Carlos Ferreira",
    company: "Ferreira Advocacia",
    category: "Advogados",
  });

  assert.ok(pitch.includes("Carlos"), "Deve conter o primeiro nome");
  assert.ok(pitch.includes("Ferreira Advocacia"), "Deve conter o nome da empresa");
  assert.ok(pitch.includes("trocarmos uma ideia rápida?"), "Deve conter CTA cordial");
});

test("buildFallbackApproach delivers direct preview link and rating when preview exists", () => {
  const pitch = buildFallbackApproach({
    name: "Locadora Forte",
    company: "Locadora Forte Equipamentos",
    rating: 4.8,
    trackedPreviewUrl: "https://app.example.com/v/locadora-forte",
  });

  assert.ok(pitch.includes("https://app.example.com/v/locadora-forte"), "Deve conter o link rastreado direto");
  assert.ok(pitch.includes("4.8"), "Deve citar a nota real do Google");
  assert.ok(!/posso mandar/i.test(pitch), "Não deve pedir permissão para enviar link quando a prévia está pronta");
});
