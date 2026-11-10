import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isSameOrigin } from "./auth-helpers.ts";
import { resolveAppBaseUrl } from "./sniper.ts";

export const SESSION_COOKIE = "prospecta_session";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET precisa ter pelo menos 32 caracteres");
  return new TextEncoder().encode(value);
}

export async function authorized() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "Sessão inválida ou expirada" }, { status: 401 });
}

export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return isSameOrigin(origin, host, resolveAppBaseUrl(), process.env.NODE_ENV !== "production");
}
