export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const rawUrl = process.env.EVOLUTION_API_URL || "https://evolution-api-yweq.onrender.com";
    const targetUrl = rawUrl.endsWith("/") ? rawUrl : `${rawUrl}/`;

    console.log(`[KeepAlive] Ativando ping de 60s para manter Render ativo: ${targetUrl}`);

    // Dispara primeiro ping imediatamente
    fetch(targetUrl, { cache: "no-store" }).catch(() => {});

    // Loop recorrente a cada 60 segundos (1 minuto)
    setInterval(async () => {
      try {
        const response = await fetch(targetUrl, { cache: "no-store" });
        if (process.env.DEBUG_KEEPALIVE === "1") {
          console.log(`[KeepAlive] Ping Render HTTP ${response.status} em ${new Date().toISOString()}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[KeepAlive] Alerta no ping para Render: ${msg}`);
      }
    }, 60_000);
  }
}

