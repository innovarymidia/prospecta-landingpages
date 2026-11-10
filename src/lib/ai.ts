import { GoogleGenerativeAI } from "@google/generative-ai";

export interface LeadForPitch {
  name: string;
  company?: string | null;
  website?: string | null;
  notes?: string | null;
  category?: string | null;
  address?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  previewUrl?: string | null;
  trackedPreviewUrl?: string | null;
}

export function buildFallbackApproach(lead: LeadForPitch): string {
  const firstName = lead.name.trim().split(" ")[0] || "olá";
  const companyName = lead.company?.trim() || "sua empresa";
  const link = lead.trackedPreviewUrl || lead.previewUrl;

  if (link) {
    const ratingSnippet =
      typeof lead.rating === "number" && lead.rating >= 4.0
        ? ` (vi que vocês têm nota ${lead.rating.toFixed(1)} no Google)`
        : "";
    return `Oi, tudo bem? É da ${companyName}?${ratingSnippet} Notei que vocês ainda não têm uma página própria focada em pedidos de orçamento no WhatsApp e tomei a liberdade de montar uma prévia real de como ficaria o site de vocês funcionando no celular: ${link}\n\nSe puder encaminhar para o responsável dar uma olhada sem compromisso, acredito que ajuda bastante a evitar equipamento parado e puxar cotações diretas no Google.`;
  }

  return `Oi, ${firstName}! Tudo bem?\nUma dúvida rápida sobre a ${companyName}: quem aí cuida da parte de captação de novos clientes/orçamentos pelo WhatsApp? Seria você mesma ou teriam 5 minutos nesta semana para trocarmos uma ideia rápida?`;
}

/**
 * Gera a primeira mensagem de abordagem (Modo Sniper com Prévia Pronta ou Fallback).
 * Regra Sniper: Se houver link de prévia pronta, entrega o link diretamente sem pedir permissão antes,
 * com tom humano, citando dados reais (nota/segmento) e facilitando o repasse pela recepção/atendimento.
 */
export async function generateInitialApproach(lead: LeadForPitch): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_WHATSAPP_API_KEY;
  if (!apiKey) {
    return buildFallbackApproach(lead);
  }

  try {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    });

    const company = lead.company?.trim() || lead.name.trim();
    const previewLink = lead.trackedPreviewUrl || lead.previewUrl || "";
    const ratingInfo =
      typeof lead.rating === "number"
        ? `${lead.rating.toFixed(1)} estrelas (${lead.reviewsCount ?? 0} avaliações no Google Maps)`
        : "não informada";

    const prompt = previewLink
      ? `Você é um consultor B2B especialista em sites de alta conversão no Brasil (foco principal: locadoras de máquinas/equipamentos e empresas operacionais B2B).
Sua missão é redigir a PRIMEIRA MENSAGEM DE WHATSAPP entregando DIRETAMENTE uma prévia de site que você acabou de construir manualmente para a empresa "${company}".

DADOS REAIS DO PROSPECT:
- Empresa: ${company}
- Segmento/Nicho: ${lead.category || "Locação de Máquinas e Equipamentos"}
- Endereço/Cidade: ${lead.address || "não informado"}
- Reputação no Google: ${ratingInfo}
- Site anterior: ${lead.website || "Sem site próprio"}
- Observações do operador: ${lead.notes || "nenhuma"}
- LINK EXATO DA PRÉVIA PRONTA (INCLUA OBRIGATORIAMENTE): ${previewLink}

ESTRATÉGIA OBRIGATÓRIA (MODO SNIPER DE ENTREGA DIRETA):
1. NÃO peça permissão ("posso mandar o link?"). Entregue o valor direto, porque o site já está pronto (e um print da página vai anexado junto com essa mensagem).
2. Deixe claro que não é disparo genérico: cite algo específico do negócio (a reputação real no Google se >= 4.2, ou a cidade/nicho).
3. Fale a língua prática do negócio (ex.: para locadoras e serviços B2B: aparecer para quem busca no Google, evitar equipamento ou frota parada e receber cotação rápida no WhatsApp).
4. Quem atende o WhatsApp comercial quase sempre é atendente, balcão ou secretária: termine pedindo com simpatia para ela encaminhar ao dono, sócio ou gerente dar uma olhada sem compromisso.
5. NUNCA mencione preço (R$ 1.200) nem termos técnicos ("Vercel", "Next.js") na primeira mensagem.
6. NUNCA use o caractere "e comercial" nem travessões em nenhuma mensagem. Use "e", vírgula ou quebra de linha.
7. Curta e direta: 3 a 4 linhas fáceis de ler no celular, linguagem brasileira natural, sem cara de vendedor chato e sem excesso de emojis.
8. Responda EXCLUSIVAMENTE com o texto pronto da mensagem (incluindo o link ${previewLink} sem alterações).`
      : `Você é um especialista em prospecção B2B pelo WhatsApp no Brasil.
Redija uma primeira mensagem ULTRA CURTA (2 a 3 frases) para o WhatsApp comercial da empresa "${company}" (${lead.category || "Serviços B2B"}).
Lembre-se: quem atende normalmente é atendente ou secretária. Seja humano, natural, sem textão, sem mencionar preços ou jargões técnicos, e NUNCA use "e comercial" nem travessões, perguntando quem cuida da parte de novos orçamentos e site por lá.
Responda EXCLUSIVAMENTE com o texto da mensagem.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    if (!text) return buildFallbackApproach(lead);
    if (previewLink && !text.includes(previewLink)) {
      return `${text}\n\nLink da prévia: ${previewLink}`;
    }
    return text;
  } catch {
    return buildFallbackApproach(lead);
  }
}

/**
 * Conduz a conversa após resposta do cliente ou secretária.
 */
export async function generateReply(name: string, context: string, messages: string[]) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_WHATSAPP_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  });

  const businessName = process.env.BUSINESS_NAME || "Innovary";

  const systemInstruction = `Você é um consultor comercial da "${businessName}". Você conversa via WhatsApp com empresas B2B no Brasil (especialmente locadoras de máquinas, equipamentos, andaimes, geradores e serviços de alto ticket).

O QUE VOCÊ OFERECE:
- Landing Page / Catálogo Profissional focado em gerar pedidos de orçamento no WhatsApp pelo Google.
- Carregamento instantâneo no celular, design artesanal sob medida (zero cara de template pronto).
- Entregue pronta no domínio próprio do cliente ou onde ele preferir hospedar, sem dor de cabeça técnica.
- Investimento: Pagamento ÚNICO de R$ 1.200 (sem mensalidade presa, sem pegadinha).
- ROI óbvio para o cliente B2B: 1 única locação/contrato que a página puxar já paga o projeto com folga.

COMO CONDUZIR A CONVERSA:
1. SE FOR ATENDENTE / SECRETÁRIA:
   - Seja cordial e agradeça pela atenção. Peça o WhatsApp ou e-mail direto do responsável/sócio, ou peça para encaminhar o link da prévia para ele avaliar em 1 minuto.
2. SE FOR O DONO / GERENTE:
   - Se ele gostou da prévia ou perguntou preço: explique que a versão completa com fotos reais do pátio/catálogo e publicada no domínio oficial sai por R$ 1.200 pagamento único (sem mensalidade), e ele não precisa perder tempo montando texto ou mexendo em servidor.
   - Use perguntas curtas de baixo atrito (ex.: "Quer que eu te explique em 2 minutos como colocamos no domínio oficial de vocês?").
   - Se disser que "já temos site": responda sem confronto que viu o atual, mas que hoje ~80% dos compradores checam pelo celular e páginas antigas/lentas perdem cotações pro concorrente no Google.
   - Se não tiver interesse: agradeça com elegância e encerre sem insistir.

DIRETRIZES DE ESTILO:
- Máximo de 2 a 4 linhas por mensagem. Linguagem natural de WhatsApp brasileiro.
- NUNCA use o caractere "e comercial" nem travessões em nenhuma mensagem. Use "e" ou vírgulas normalmente.
- NUNCA invente funcionalidades não pedidas nem mencione nomes de plataformas de hospedagem internas.
- Responda apenas com a mensagem final.`;

  const conversationHistory = `Contexto do lead: ${context || "Nenhum dado extra"}
Nome cadastrado: ${name}
Histórico da conversa recente:
${messages.map((m, idx) => `[Mensagem ${idx + 1}]: ${m}`).join("\n")}

Responda agora com a melhor mensagem para dar seguimento à conversa de forma persuasiva e natural:`;

  try {
    const result = await model.generateContent([
      { text: systemInstruction },
      { text: conversationHistory },
    ]);

    return result.response.text().trim();
  } catch (err) {
    console.warn("[AI] Falha na chamada Gemini em generateReply:", err instanceof Error ? err.message : err);
    return `Obrigado pelo retorno! Para colocarmos a página personalizada no ar no domínio de vocês (com catálogo focado em orçamento no WhatsApp e carregamento instantâneo), o valor é único de R$ 1.200, sem mensalidades. Quer ajustar algum detalhe da prévia para colocarmos no ar?`;
  }
}
