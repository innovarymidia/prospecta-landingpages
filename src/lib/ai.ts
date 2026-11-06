import { GoogleGenerativeAI } from "@google/generative-ai";

export interface LeadForPitch {
  name: string;
  company?: string | null;
  website?: string | null;
  notes?: string | null;
  category?: string | null;
}

export function buildFallbackApproach(lead: LeadForPitch): string {
  const firstName = lead.name.trim().split(" ")[0] || "olá";
  const companyName = lead.company?.trim() || "sua empresa";
  const businessName = process.env.BUSINESS_NAME || "nossa equipe";
  const businessOffer = process.env.BUSINESS_OFFER || "soluções digitais e captação de clientes";

  return `Olá, ${firstName}! Tudo bem?\nVi a presença da ${companyName} e achei muito interessante a atuação de vocês no mercado. Sou da ${businessName} e ajudamos negócios como o seu com ${businessOffer}.\n\nVocê teria 5 minutos nesta semana para trocarmos uma ideia rápida?`;
}

export async function generateInitialApproach(lead: LeadForPitch): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_WHATSAPP_API_KEY;
  if (!apiKey) {
    return buildFallbackApproach(lead);
  }

  try {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    });

    const businessName = process.env.BUSINESS_NAME || "nossa empresa";
    const businessOffer = process.env.BUSINESS_OFFER || "soluções digitais";
    const knowledge = process.env.BUSINESS_KNOWLEDGE || "";

    const prompt = `Você é um consultor comercial sênior e cordial representando a empresa "${businessName}".
Oferecemos: "${businessOffer}".
Diferenciais e contexto da nossa empresa: "${knowledge}".

Dados do prospect (lead):
- Nome do contato: ${lead.name}
- Empresa: ${lead.company || "não informada"}
- Segmento/Categoria: ${lead.category || "não informada"}
- Site: ${lead.website || "não informado"}
- Notas contextuais: ${lead.notes || "nenhuma"}

Instruções:
- Crie uma primeira mensagem de abordagem fria para WhatsApp (cold outreach) de no máximo 3 a 4 parágrafos curtos.
- Seja simpático, profissional, natural e direto ao ponto.
- Não soe como robô, spammer nem marqueteiro agressivo.
- Mencione a empresa do contato e como nossa oferta (${businessOffer}) pode agregar valor para ela.
- Termine com uma pergunta amigável e de baixo atrito convidando para uma conversa rápida de 5 minutos.
- Responda apenas com o texto da mensagem, sem aspas e sem explicações antes ou depois.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text || buildFallbackApproach(lead);
  } catch {
    return buildFallbackApproach(lead);
  }
}

export async function generateReply(name: string, context: string, messages: string[]) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_WHATSAPP_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  });
  const result = await model.generateContent(
    `Você atende em nome de ${process.env.BUSINESS_NAME || "nossa empresa"}, que oferece: ${process.env.BUSINESS_OFFER || "landing pages"}. Use apenas os fatos deste contexto: ${process.env.BUSINESS_KNOWLEDGE || ""}. Contexto do lead: ${context || "sem dados adicionais"}. Responda em português brasileiro, de forma cordial, concisa e natural. Não invente preços, prazos, garantias ou fatos sobre o lead. Não alegue ser humano. Se não souber, diga que vai encaminhar para uma pessoa. Faça no máximo uma pergunta por vez. Nome: ${name}. Mensagens recentes do lead: ${messages.join("\n")}`
  );
  return result.response.text().trim();
}
