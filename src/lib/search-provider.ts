export type SearchProvider = "serper" | "outscraper";

/**
 * Seleciona o provedor de busca ativo priorizando Serper.dev (gratuito sem cartão)
 * e mantendo Outscraper como opção compatível caso configurado.
 */
export function getActiveSearchProvider(): SearchProvider | null {
  if (process.env.SERPER_API_KEY?.trim()) return "serper";
  if (process.env.OUTSCRAPER_API_KEY?.trim()) return "outscraper";
  return null;
}
