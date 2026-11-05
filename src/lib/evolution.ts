export async function sendText(number: string, text: string) {
  const base = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!base || !instance || !process.env.EVOLUTION_API_KEY) throw new Error("Evolution não configurada");
  const response = await fetch(`${base}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.EVOLUTION_API_KEY },
    body: JSON.stringify({ number, text }), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Evolution ${response.status}: ${await response.text()}`);
  return response.json() as Promise<{ key?: { id?: string } }>;
}
