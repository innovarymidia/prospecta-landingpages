import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { db } from "@/lib/db";
import { sameOrigin, SESSION_COOKIE } from "@/lib/auth";
import { sanitizeHash } from "@/lib/auth-helpers";

const memoryAttempts = new Map<string, { count: number; expires: number }>();

const limiter = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Ratelimit({
      redis: new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      }),
      limiter: Ratelimit.slidingWindow(5, "10 m"),
      prefix: "prospecta:login",
    })
  : null;

async function checkAllowed(ip: string): Promise<boolean> {
  if (limiter) return (await limiter.limit(ip)).success;
  const now = Date.now();
  const record = memoryAttempts.get(ip);
  if (!record || record.expires < now) return true;
  return record.count < 10;
}

function recordFailure(ip: string) {
  if (limiter) return;
  const now = Date.now();
  const record = memoryAttempts.get(ip);
  if (!record || record.expires < now) {
    memoryAttempts.set(ip, { count: 1, expires: now + 600_000 });
  } else {
    record.count++;
  }
}

function clearAttempts(ip: string) {
  memoryAttempts.delete(ip);
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Origem da requisição inválida" }, { status: 403 });
  }

  if (Number(req.headers.get("content-length") || 0) > 8192) {
    return NextResponse.json({ error: "Requisição muito grande" }, { status: 413 });
  }

  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!await checkAllowed(ip)) {
    return NextResponse.json({ error: "Muitas tentativas incorretas. Aguarde alguns instantes." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { email, password } = body as { email?: unknown; password?: unknown };
  const suppliedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const suppliedPassword = typeof password === "string" ? password : "";

  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    return NextResponse.json({ error: "AUTH_SECRET não configurado corretamente no servidor" }, { status: 503 });
  }

  if (!suppliedEmail || suppliedPassword.length === 0 || suppliedPassword.length > 200) {
    recordFailure(ip);
    return NextResponse.json({ error: "E-mail ou senha incorretos" }, { status: 401 });
  }

  const dbUser = await db.adminUser.findUnique({ where: { email: suppliedEmail } }).catch(() => null);
  const envEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase().replace(/^["']|["']$/g, "");
  const envHash = sanitizeHash(process.env.ADMIN_PASSWORD_HASH);

  let authenticated = false;
  if (dbUser) {
    authenticated = await bcrypt.compare(suppliedPassword, dbUser.passwordHash).catch(() => false);
  } else if (envEmail && envHash && suppliedEmail === envEmail) {
    authenticated = await bcrypt.compare(suppliedPassword, envHash).catch(() => false);
  } else if (!envEmail || !envHash) {
    return NextResponse.json({ error: "Nenhum usuário administrador configurado no servidor" }, { status: 503 });
  }

  if (!authenticated) {
    recordFailure(ip);
    return NextResponse.json({ error: "E-mail ou senha incorretos" }, { status: 401 });
  }

  clearAttempts(ip);

  const token = await new SignJWT({ role: "admin", sub: suppliedEmail })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });

  return response;
}
