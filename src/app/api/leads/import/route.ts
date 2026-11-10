import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorized, sameOrigin, unauthorized } from "@/lib/auth";
import { parseLeadsFromCsv } from "@/lib/csv";
import { importLeadCandidates } from "@/lib/lead-import";

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;

const optionsSchema = z.object({
  websiteTarget: z.enum(["any", "missing", "present"]).default("missing"),
  requireMapsScore: z.boolean().default(false),
  source: z.string().trim().min(1).max(120).default("Importação CSV"),
});

export async function POST(req: NextRequest) {
  if (!await authorized()) return unauthorized();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });

  const contentType = req.headers.get("content-type") || "";
  let csvText = "";
  let rawOptions: Record<string, unknown> = {};

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData().catch(() => null);
    if (!formData) return NextResponse.json({ error: "Formulário de arquivo inválido" }, { status: 400 });

    const file = formData.get("file");
    if (file instanceof File) {
      if (file.size > MAX_CSV_BYTES) {
        return NextResponse.json({ error: "Arquivo CSV deve ter no máximo 2 MB" }, { status: 413 });
      }
      csvText = await file.text();
    } else if (typeof formData.get("csvText") === "string") {
      csvText = String(formData.get("csvText"));
    }

    rawOptions = {
      websiteTarget: formData.get("websiteTarget") ?? undefined,
      requireMapsScore: formData.get("requireMapsScore") === "true",
      source: formData.get("source") || undefined,
    };
  } else {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }
    csvText = typeof body.csvText === "string" ? body.csvText : "";
    rawOptions = {
      websiteTarget: body.websiteTarget,
      requireMapsScore: Boolean(body.requireMapsScore),
      source: body.source,
    };
  }

  if (Buffer.byteLength(csvText, "utf8") > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "Conteúdo CSV excede 2 MB" }, { status: 413 });
  }

  const parsedOptions = optionsSchema.safeParse(rawOptions);
  if (!parsedOptions.success) {
    return NextResponse.json({ error: parsedOptions.error.issues }, { status: 400 });
  }

  const { candidates, parsedRows } = parseLeadsFromCsv(csvText, parsedOptions.data.source);
  if (!parsedRows || !candidates.length) {
    return NextResponse.json(
      { error: "Nenhuma empresa identificada no CSV. Confira se há colunas de empresa e telefone ou WhatsApp." },
      { status: 400 }
    );
  }
  if (parsedRows > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      { error: `Envie no máximo ${MAX_IMPORT_ROWS} empresas por importação.` },
      { status: 400 }
    );
  }

  const summary = await importLeadCandidates(candidates, {
    websiteTarget: parsedOptions.data.websiteTarget,
    requireMapsScore: parsedOptions.data.requireMapsScore,
    defaultSource: parsedOptions.data.source,
  });

  return NextResponse.json({ parsedRows, ...summary });
}
