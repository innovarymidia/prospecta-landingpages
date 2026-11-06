import test from "node:test";
import assert from "node:assert/strict";
import { buildFallbackApproach } from "./ai.ts";

test("buildFallbackApproach crafts a customized respectful pitch", () => {
  const pitch = buildFallbackApproach({
    name: "Carlos Ferreira",
    company: "Ferreira Advocacia",
    category: "Advogados",
  });

  assert.ok(pitch.includes("Carlos"), "Deve conter o primeiro nome");
  assert.ok(pitch.includes("Ferreira Advocacia"), "Deve conter o nome da empresa");
  assert.ok(pitch.includes("trocarmos uma ideia rápida?"), "Deve conter CTA cordial");
});

