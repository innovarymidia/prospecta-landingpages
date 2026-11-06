import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { isSameOrigin, sanitizeHash } from "./auth-helpers.ts";

test("sanitizeHash strips quotes, backslashes and whitespace from env hash", () => {
  const rawHash = "$2b$12$uooOmPHoY8x3EjQ.jFcKm.obKObDN6vmDj/Ag7wU.ALc0PV1tg34W";
  const escapedFromEnv = "\"\\$2b\\$12\\$uooOmPHoY8x3EjQ.jFcKm.obKObDN6vmDj/Ag7wU.ALc0PV1tg34W\"";

  const sanitized = sanitizeHash(escapedFromEnv);
  assert.equal(sanitized, rawHash);
  assert.equal(bcrypt.compareSync("admin123456", sanitized), true);
  assert.equal(bcrypt.compareSync("wrongPassword", sanitized), false);
});

test("isSameOrigin validates same host and development environments correctly", () => {
  // Matching host
  assert.equal(isSameOrigin("http://localhost:3000", "localhost:3000"), true);
  assert.equal(isSameOrigin("https://app.prospecta.com", "app.prospecta.com"), true);

  // Different host in production -> false
  assert.equal(isSameOrigin("https://evil.com", "app.prospecta.com", "https://app.prospecta.com", false), false);

  // Localhost in dev mode -> true
  assert.equal(isSameOrigin("http://localhost:3000", "localhost:3001", "http://localhost:3000", true), true);
  assert.equal(isSameOrigin("http://127.0.0.1:3000", "localhost:3000", "http://localhost:3000", true), true);

  // No origin (direct browser navigation) in dev mode -> true
  assert.equal(isSameOrigin(null, "localhost:3000", "http://localhost:3000", true), true);
  assert.equal(isSameOrigin(null, "app.prospecta.com", "https://app.prospecta.com", false), false);
});
