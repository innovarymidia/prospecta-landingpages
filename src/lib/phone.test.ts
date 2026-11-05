import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "./phone.ts";

test("normalizePhone removes non-digit characters", () => {
  assert.equal(normalizePhone("+55 (11) 99999-8888"), "5511999998888");
  assert.equal(normalizePhone("55 11 91234-5678"), "5511912345678");
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone("abc-123.456"), "123456");
});
