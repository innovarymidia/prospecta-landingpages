import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { sameOrigin, SESSION_COOKIE } from "@/lib/auth";

const memoryAttempts = new Map<string, { count: number; expires: number }>();
const limiter = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Ratelimit({ redis: new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN }), limiter: Ratelimit.slidingWindow(5, "10 m"), prefix: "prospecta:login" })
  : null;
async function allowed(ip: string) {
  if (limiter) return (await limiter.limit(ip)).success;
  if (process.env.NODE_ENV === "production") return false;
  const now = Date.now(); const record = memoryAttempts.get(ip);
  if (!record || record.expires < now) { memoryAttempts.set(ip, { count: 1, expires: now + 600_000 }); return true; }
  record.count++; return record.count <= 5;
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > 8192) return NextResponse.json({ error: "Requisição muito grande" }, { status: 413 });
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!await allowed(ip)) return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const { email, password } = body as { email?: unknown; password?: unknown };
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase(); const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!adminEmail || !passwordHash || !process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) return NextResponse.json({ error: "Login ainda não configurado no servidor" }, { status: 503 });
  const emailOk = typeof email === "string" && email.trim().toLowerCase() === adminEmail;
  const passwordOk = typeof password === "string" && password.length > 0 && password.length <= 200 && await bcrypt.compare(password, passwordHash).catch(() => false);
  if (!emailOk || !passwordOk) return NextResponse.json({ error: "E-mail ou senha incorretos" }, { status: 401 });
  const token = await new SignJWT({ role: "admin", sub: adminEmail }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 8 * 60 * 60 });
  return response;
}
