import type { RawLeadCandidate } from "./lead-import.ts";

export const CSV_TEMPLATE_CONTENT =
  "\uFEFFempresa;whatsapp;site;cidade;categoria;nota;avaliacoes\r\n" +
  "Locadora Forte Equipamentos;5519999990001;;Campinas, SP;Locação de Equipamentos;4.8;42\r\n" +
  "Andaimes Brasil Locação;5511999990002;https://instagram.com/andaimesbr;São Paulo, SP;Aluguel de Andaimes;4.6;19\r\n";

const HEADER_ALIASES: Record<string, keyof RawLeadCandidate | "nameOnly"> = {
  empresa: "company",
  company: "company",
  razaosocial: "company",
  nomeempresa: "company",
  fantasia: "company",
  titulo: "company",
  title: "company",
  nome: "name",
  name: "name",
  contato: "name",
  responsavel: "name",
  whatsapp: "phone",
  telefone: "phone",
  phone: "phone",
  phonenumber: "phone",
  celular: "phone",
  fone: "phone",
  numero: "phone",
  site: "website",
  website: "website",
  url: "website",
  dominio: "website",
  endereco: "address",
  address: "address",
  fulladdress: "address",
  cidade: "address",
  city: "address",
  localizacao: "address",
  categoria: "category",
  category: "category",
  segmento: "category",
  tipo: "category",
  type: "category",
  nota: "rating",
  rating: "rating",
  estrelas: "rating",
  avaliacoes: "reviewsCount",
  reviews: "reviewsCount",
  reviewscount: "reviewsCount",
  ratingcount: "reviewsCount",
  previa: "previewUrl",
  preview: "previewUrl",
  previewurl: "previewUrl",
  linkprevia: "previewUrl",
  notas: "notes",
  notes: "notes",
  observacoes: "notes",
  status: "businessStatus",
  businessstatus: "businessStatus",
};

function normalizeHeaderKey(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function detectDelimiter(text: string): "," | ";" {
  let commas = 0;
  let semis = 0;
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    if (!inQuotes) {
      if (ch === ",") commas++;
      if (ch === ";") semis++;
    }
  }
  return semis > commas ? ";" : ",";
}

/**
 * Faz o parse de um CSV completo suportando separador vírgula ou ponto-e-vírgula,
 * aspas RFC-4180 e quebras de linha dentro de campos.
 */
export function parseCsvMatrix(rawText: string, maxRows = 1005): string[][] {
  const clean = rawText.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];

  const delimiter = detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(col => col.length > 0)) {
        rows.push(row);
        if (rows.length >= maxRows) return rows;
      }
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some(col => col.length > 0)) rows.push(row);
  return rows;
}

function parseOptionalNumber(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const parsed = Number(raw.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converte texto CSV em candidatos de empresa compatíveis com o importador único.
 */
export function parseLeadsFromCsv(
  rawText: string,
  sourceLabel = "Importação CSV"
): { candidates: RawLeadCandidate[]; parsedRows: number } {
  const matrix = parseCsvMatrix(rawText);
  if (matrix.length < 2) return { candidates: [], parsedRows: 0 };

  const headers = matrix[0].map(col => HEADER_ALIASES[normalizeHeaderKey(col)] || null);
  const dataRows = matrix.slice(1);
  const candidates: RawLeadCandidate[] = [];

  for (const cols of dataRows) {
    const record: Partial<RawLeadCandidate> = {};
    for (let idx = 0; idx < headers.length; idx++) {
      const field = headers[idx];
      const value = (cols[idx] || "").trim();
      if (!field || !value) continue;

      if (field === "rating") {
        record.rating = parseOptionalNumber(value);
      } else if (field === "reviewsCount") {
        const n = parseOptionalNumber(value);
        record.reviewsCount = n !== null ? Math.max(0, Math.round(n)) : null;
      } else if (field !== "nameOnly") {
        (record as Record<string, unknown>)[field] = value;
      }
    }

    const company = (record.company || record.name || "").trim();
    const name = (record.name || record.company || "").trim();
    const phone = (record.phone || "").trim();

    if (!name && !phone) continue;

    candidates.push({
      name,
      company,
      phone,
      website: record.website || null,
      address: record.address || null,
      category: record.category || null,
      rating: record.rating ?? null,
      reviewsCount: record.reviewsCount ?? null,
      previewUrl: record.previewUrl || null,
      notes: record.notes || null,
      businessStatus: record.businessStatus || null,
      source: sourceLabel,
    });
  }

  return { candidates, parsedRows: dataRows.length };
}

