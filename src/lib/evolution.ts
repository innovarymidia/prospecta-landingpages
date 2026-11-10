async function postEvolution(endpoint: string, payload: Record<string, unknown>) {
  const base = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!base || !instance || !process.env.EVOLUTION_API_KEY) {
    throw new Error("Evolution não configurada");
  }

  const response = await fetch(`${base}/message/${endpoint}/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.EVOLUTION_API_KEY,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Evolution ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<{ key?: { id?: string } }>;
}

/**
 * Envia mensagem de texto simples via Evolution API.
 */
export async function sendText(number: string, text: string) {
  return postEvolution("sendText", { number, text });
}

/**
 * Envia imagem (print da prévia) com legenda via Evolution API v2.
 * Aceita Data URI (data:image/png;base64,...) ou URL HTTP(S) pública.
 */
export async function sendMedia(number: string, caption: string, mediaInput: string) {
  const dataUriMatch = mediaInput.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const mimetype = dataUriMatch ? dataUriMatch[1] : "image/jpeg";
  const media = dataUriMatch ? dataUriMatch[2] : mediaInput;
  const ext = mimetype.includes("png") ? "png" : mimetype.includes("webp") ? "webp" : "jpg";

  return postEvolution("sendMedia", {
    number,
    mediatype: "image",
    mimetype,
    caption,
    media,
    fileName: `previa-site.${ext}`,
  });
}
