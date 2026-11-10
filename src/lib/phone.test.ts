import test from "node:test";
import assert from "node:assert/strict";
import { buildPhoneMatchVariants, normalizePhone } from "./phone.ts";

test("normalizePhone normalizes Brazilian numbers with DDI 55", () => {
  assert.equal(normalizePhone("+55 (11) 99999-8888"), "5511999998888");
  assert.equal(normalizePhone("55 11 91234-5678"), "5511912345678");
  assert.equal(normalizePhone("(19) 98765-4321"), "5519987654321");
  assert.equal(normalizePhone("1932324455"), "551932324455");
  assert.equal(normalizePhone("08001234567"), "08001234567");
  assert.equal(normalizePhone(""), "");
});

test("buildPhoneMatchVariants returns 55 and 9th digit equivalents", () => {
  const variants = buildPhoneMatchVariants("(19) 99888-7766");
  assert.ok(variants.includes("5519998887766"));
  assert.ok(variants.includes("551998887766"));
  assert.ok(variants.includes("19998887766"));
  assert.ok(variants.includes("1998887766"));

  const withoutNine = buildPhoneMatchVariants("551998887766");
  assert.ok(withoutNine.includes("5519998887766"));
});
