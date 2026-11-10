import test from "node:test";
import assert from "node:assert/strict";
import { getInboundBufferSeconds, isLeadBlocked, isOptOutMessage, shouldAiAutoReply } from "./safety.ts";

test("isLeadBlocked returns true for invalid or blocked leads", () => {
  assert.equal(isLeadBlocked(null), true);
  assert.equal(isLeadBlocked(undefined), true);
  assert.equal(isLeadBlocked({ initialSentAt: null, optOutAt: null, status: "READY" }), true);
  assert.equal(isLeadBlocked({ initialSentAt: new Date(), optOutAt: new Date(), status: "REPLIED" }), true);
  assert.equal(isLeadBlocked({ initialSentAt: new Date(), optOutAt: null, status: "OPTED_OUT" }), true);
  assert.equal(isLeadBlocked({ initialSentAt: new Date(), optOutAt: null, status: "BLOCKED" }), true);
});

test("isLeadBlocked returns false for valid active contacted leads", () => {
  assert.equal(isLeadBlocked({ initialSentAt: new Date(), optOutAt: null, status: "SENT" }), false);
  assert.equal(isLeadBlocked({ initialSentAt: new Date(), optOutAt: null, status: "REPLIED" }), false);
  assert.equal(isLeadBlocked({ initialSentAt: new Date(), optOutAt: null, status: "QUALIFIED" }), false);
});

test("shouldAiAutoReply blocks paused leads and advanced or closed stages", () => {
  assert.equal(shouldAiAutoReply({ initialSentAt: new Date(), optOutAt: null, aiPausedAt: null, status: "SENT" }), true);
  assert.equal(shouldAiAutoReply({ initialSentAt: new Date(), optOutAt: null, aiPausedAt: null, status: "REPLIED" }), true);

  assert.equal(shouldAiAutoReply({ initialSentAt: new Date(), optOutAt: null, aiPausedAt: new Date(), status: "REPLIED" }), false);
  for (const stoppedStatus of ["QUALIFIED", "MEETING", "WON", "LOST", "OPTED_OUT", "BLOCKED"]) {
    assert.equal(
      shouldAiAutoReply({ initialSentAt: new Date(), optOutAt: null, aiPausedAt: null, status: stoppedStatus }),
      false
    );
  }
});

test("getInboundBufferSeconds enforces minimum 30s and defaults to 60s", () => {
  assert.equal(getInboundBufferSeconds(undefined), 60);
  assert.equal(getInboundBufferSeconds(""), 60);
  assert.equal(getInboundBufferSeconds("12"), 30);
  assert.equal(getInboundBufferSeconds("5"), 30);
  assert.equal(getInboundBufferSeconds("45"), 45);
  assert.equal(getInboundBufferSeconds("90"), 90);
});

test("isOptOutMessage detects opt-out keywords correctly", () => {
  assert.equal(isOptOutMessage("Por favor pare de mandar mensagem"), true);
  assert.equal(isOptOutMessage("Favor remover meu número"), true);
  assert.equal(isOptOutMessage("stop"), true);
  assert.equal(isOptOutMessage("Quero sair da lista agora"), true);
  assert.equal(isOptOutMessage("Não me contate mais"), true);
  assert.equal(isOptOutMessage("Nao me contate mais"), true);

  assert.equal(isOptOutMessage("Olá, como funciona o serviço?"), false);
  assert.equal(isOptOutMessage("Pode me ligar amanhã?"), false);
  assert.equal(isOptOutMessage(""), false);
});
