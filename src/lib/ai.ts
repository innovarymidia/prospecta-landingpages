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

  return `Oi, ${firstName}! Tudo bem?\nUma dúvida rápida sobre a ${companyName}: quem aí cuida da parte de captação de novos clientes/pacientes pelo WhatsApp? Seria você mesma ou teriam 5 minutos nesta semana para trocarmos uma ideia rápida?`;
}

/**
 * Gera a mensagem de primeiro contato (Cold WhatsApp Outreach).
 * Foco: Quebra de padrão, baixo atrito, consciente de que o contato inicial
 * quase sempre é atendido pela secretária / recepcionista / atendente.
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

    const businessName = process.env.BUSINESS_NAME || "Innovary";
    const company = lead.company?.trim() || lead.name.trim();
    const firstName = lead.name.trim().split(" ")[0] || "";

    const prompt = `Você é um especialista em prospecção B2B de alta conversão pelo WhatsApp no Brasil.
Seu objetivo é redigir a PRIMEIRA MENSAGEM de contato para o WhatsApp comercial da empresa "${company}".

CONTEXTO CRÍTICO DE PROSPECÇÃO:
1. Este número quase NUNCA é o celular pessoal do dono/médico/advogado; quem atende é uma SECRETÁRIA, RECEPCIONISTA ou ATENDENTE comercial (o "gatekeeper").
2. NUNCA envie textões, propostas prontas, preços de cara ou mensagens com cara de agência de marketing tradicional. Secretárias ignoram ou dizem "não temos interesse" para discursos de vendas longos.
3. A mensagem precisa ser ULTRA CURTA (máximo 2 a 3 frases curtas), informal, respeitosa e natural, como se fosse um humano digitando rapidamente no celular.

DADOS DO PROSPECT:
- Empresa: ${company}
- Nome no cadastro: ${lead.name}
- Segmento: ${lead.category || "Serviços"}
- Site atual: ${lead.website || "não informado"}
- Notas: ${lead.notes || "nenhuma"}

ESTRATÉGIA DE ABORDAGEM (ESCOLHA A MAIS ADEQUADA AO CONTEXTO):
Opção 1 (Direcionamento com Atendente - Altíssima Conversão):
Cumprimento natural + pergunta sobre quem é o responsável pela captação de clientes/pacientes ou novos agendamentos na empresa.
Exemplo: "Oi, bom dia! É da [Empresa]? Tudo bem? Uma dúvida rápida: com quem consigo falar sobre novos pacientes/clientes que chegam pelo site/WhatsApp? É por este número mesmo?"

Opção 2 (Oportunidade Específica no Site/WhatsApp):
Se o prospect tiver site informado: mencionar que notou que o site demora para abrir no celular ou que falta um botão direto para o WhatsApp comercial, e perguntar quem pode receber um aviso/print rápido.
Exemplo: "Oi, tudo bem? Fui dar uma olhada na página de vocês pelo celular e notei um detalhe que pode estar fazendo vocês perderem orçamentos no WhatsApp. Com quem posso compartilhar isso por aqui?"

INSTRUÇÕES OBRIGATÓRIAS:
- Máximo de 2 a 3 linhas de WhatsApp.
- Linguagem brasileira fluida, educada e coloquial (sem excesso de formalidade e sem emojis exagerados, use no máximo um "Oi, tudo bem?").
- NUNCA mencione preços, termos técnicos como "infraestrutura Vercel", ou parágrafos de vendas na primeira mensagem. O objetivo é APENAS conseguir a primeira resposta da atendente ou do decisor.
- Responda EXCLUSIVAMENTE com o texto da mensagem, sem aspas, sem introdução e sem explicações adicionais.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text || buildFallbackApproach(lead);
  } catch {
    return buildFallbackApproach(lead);
  }
}

/**
 * Conduz a conversa de forma persuasiva, empática e inteligente.
 * Identifica se está falando com secretária ou decisor e aplica técnicas
 * de persuasão (Chris Voss, Spin Selling) para avançar a negociação.
 */
export async function generateReply(name: string, context: string, messages: string[]) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_WHATSAPP_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  });

  const businessName = process.env.BUSINESS_NAME || "Innovary";

  const systemInstruction = `Você é um consultor comercial de elite da empresa "${businessName}". Você conversa via WhatsApp com leads B2B em português do Brasil.

O QUE VOCÊ OFERECE:
- Criação de Landing Pages Profissionais de Altíssima Conversão para WhatsApp.
- Hospedadas na infraestrutura global da Vercel (carregam em menos de 1 segundo no celular).
- Copywriting persuasivo voltado para fechamento de clientes de alto ticket (médicos, dentistas, clínicas estéticas, advogados, energia solar, reformas).
- Investimento: Pagamento ÚNICO de R$ 1.200 (sem mensalidades presas, sem pegadinhas).
- Diferencial: O investimento de R$ 1.200 se paga com 1 único cliente novo que a página trouxer.

MANUAL DE PERSUASÃO E CONDUÇÃO DA CONVERSA:
1. IDENTIFIQUE QUEM ESTÁ FALANDO:
   - Se for a SECRETÁRIA/ATENDENTE:
     * Trate-a com muito carinho e empatia ("Sei como a sua rotina no atendimento é corrida!").
     * Nunca tente vender para a secretária. Seu único objetivo é fazê-la encaminhar o contato do responsável/proprietário ou passar a mensagem para ele.
     * Frase-chave: "Você saberia me dizer o WhatsApp ou e-mail de quem cuida dessa parte (o doutor ou o gestor)? Prometo ser super direto e rápido com ele para não tomar o tempo de vocês."

   - Se for o DECISOR / PROPRIETÁRIO:
     * Seja direto e fale a língua de negócios: velocidade de carregamento, perda de clientes no celular, tráfego que vaza e conversão em agendamentos no WhatsApp.
     * Use micro-compromissos (Chris Voss): "Seria um absurdo eu te mandar uma demonstração de 1 minuto em vídeo/link de como ficaria a página da sua clínica?"
     * Mostre ROI: "Nosso projeto é de R$ 1.200 pagamento único. Com o ticket dos seus serviços, 1 único cliente novo já quita o site com lucro."

2. TRATAMENTO DE OBJEÇÕES:
   - Objeção "Já temos site":
     * Resposta: "Com certeza, vi que vocês têm o site institucional! A questão é que no celular 70% das pessoas desistem se a página não carregar em 1 segundo com botão direto pro WhatsApp. A nossa Landing Page funciona como um funil focado puramente em gerar agendamentos. Posso te mostrar um comparativo rápido de 30 segundos?"
   - Objeção "Não tenho interesse / Não queremos":
     * Resposta: "Sem problemas, agradeço demais a atenção! Se no futuro vocês quiserem acelerar as captações pelo WhatsApp sem pagar mensalidade de agência, fico à disposição por aqui. Um abraço!"
   - Objeção "Quanto custa?":
     * Resposta: "Nosso projeto completo (design sob medida, textos persuasivos e hospedagem rápida na Vercel) é taxa única de R$ 1.200, sem mensalidades. Geralmente 1 paciente/cliente já cobre o valor. Quer ver um exemplo do seu segmento?"
   - Objeção "Manda apresentação por e-mail":
     * Resposta: "Mando agora mesmo! Qual é o melhor e-mail? E qual é o nome do responsável para eu colocar no assunto?"

3. DIRETRIZES DE ESTILO:
   - NUNCA envie blocos de texto grandes. Máximo de 2 a 4 linhas por mensagem.
   - Linguagem natural de WhatsApp (usar quebras de linha leves, sem juridiquês e sem parecer robô).
   - Termine SEMPRE com uma pergunta curta, fácil de responder (pergunta de baixo atrito).
   - Responda apenas com a mensagem a ser enviada no WhatsApp.`;

  const conversationHistory = `Contexto do lead: ${context || "Nenhum dado extra"}
Nome cadastrado: ${name}
Histórico da conversa recente:
${messages.map((m, idx) => `[Mensagem ${idx + 1}]: ${m}`).join("\n")}

Responda agora com a melhor mensagem para dar seguimento à conversa de forma persuasiva e natural:`;

  const result = await model.generateContent([
    { text: systemInstruction },
    { text: conversationHistory },
  ]);

  return result.response.text().trim();
}
