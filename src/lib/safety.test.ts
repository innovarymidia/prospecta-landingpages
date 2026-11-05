import test from "node:test";
import assert from "node:assert/strict";
import { isLeadBlocked, isOptOutMessage } from "./safety.ts";

test("isLeadBlocked returns true for invalid or blocked leads", () => {
  assert.equal(isLeadBlocked(null), true);
  assert.equal(isLeadBlocked(undefined), true);
  // No initial message sent yet -> blocked from receiving automated inbound replies
  assert.equal(isLeadBlocked({ initialSentAt: null, optOutAt: null, status: "READY" }), true);
  // Has opt-out timestamp
  assert.equal(isLeadBlocked({ initialSentAt: new Date(), optOutAt: new Date(), status: "REPLIED" }), true);
  // Has OPTED_OUT status
  assert.equal(isLeadBlocked({ initialSentAt: new Date(), optOutAt: null, status: "OPTED_OUT" }), true);
  // Has BLOCKED status
  assert.equal(isLeadBlocked({ initialSentAt: new Date(), optOutAt: null, status: "BLOCKED" }), true);
});

test("isLeadBlocked returns false for valid active contacted leads", () => {
  assert.equal(isLeadBlocked({ initialSentAt: new Date(), optOutAt: null, status: "SENT" }), false);
  assert.equal(isLeadBlocked({ initialSentAt: new Date(), optOutAt: null, status: "REPLIED" }), false);
  assert.equal(isLeadBlocked({ initialSentAt: new Date(), optOutAt: null, status: "QUALIFIED" }), false);
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
