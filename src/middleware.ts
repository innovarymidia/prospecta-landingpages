import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const openPaths = new Set(["/login", "/api/auth/login", "/api/auth/logout", "/api/webhooks/evolution", "/api/inngest"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  if (openPaths.has(cleanPath) || pathname.startsWith("/v/") || pathname.startsWith("/_next/") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const token = req.cookies.get("prospecta_session")?.value;
  const key = process.env.AUTH_SECRET;
  let valid = false;

  if (token && key && key.length >= 32) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(key), { algorithms: ["HS256"] });
      valid = payload.role === "admin";
    } catch {
      valid = false;
    }
  }

  if (valid) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const login = new URL("/login", req.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/((?!.*\\..*).*)", "/"] };
