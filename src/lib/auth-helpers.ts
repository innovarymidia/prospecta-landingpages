export function sanitizeHash(hash: string | undefined | null): string {
  if (!hash) return "";
  return hash.trim().replace(/^["']|["']$/g, "").replace(/\\/g, "");
}

export function isSameOrigin(
  origin: string | null,
  host: string | null,
  appUrl?: string,
  isDev: boolean = false
): boolean {
  if (!origin) return isDev;
  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host;

    if (host && originHost === host) return true;
    if (appUrl && originHost === new URL(appUrl).host) return true;

    if (isDev) {
      if (originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1") return true;
    }
    return false;
  } catch {
    return false;
  }
}
