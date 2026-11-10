export type SearchProvider = "apify" | "serper" | "outscraper";

/**
 * Seleciona o provedor de busca ativo priorizando Apify (US$ 5/mês grátis sem cartão),
 * depois Serper.dev (2.500 buscas grátis) e Outscraper como legado compatível.
 */
export function getActiveSearchProvider(
  env: Record<string, string | undefined> = process.env
): SearchProvider | null {
  if (env.APIFY_TOKEN?.trim()) return "apify";
  if (env.SERPER_API_KEY?.trim()) return "serper";
  if (env.OUTSCRAPER_API_KEY?.trim()) return "outscraper";
  return null;
}
