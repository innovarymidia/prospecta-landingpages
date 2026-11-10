"use client";

import { FormEvent, useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { CSV_TEMPLATE_CONTENT } from "@/lib/csv";

type ImportResult = {
  parsedRows: number;
  qualified: number;
  added: number;
  skippedUnqualified: number;
  skippedBlocked: number;
  skippedDuplicate: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  onNotify: (message: string) => void;
};

export default function ImportCsvModal({ open, onClose, onImported, onNotify }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [onlyMissingWebsite, setOnlyMissingWebsite] = useState(true);
  const [requireMapsScore, setRequireMapsScore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!open) return null;

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE_CONTENT], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo-empresas-prospecta.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!file && !csvText.trim()) {
      setError("Selecione um arquivo .csv ou cole os dados da planilha abaixo.");
      return;
    }

    setBusy(true);
    try {
      let response: Response;
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("websiteTarget", onlyMissingWebsite ? "missing" : "any");
        formData.append("requireMapsScore", String(requireMapsScore));
        response = await fetch("/api/leads/import", { method: "POST", body: formData });
      } else {
        response = await fetch("/api/leads/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            csvText,
            websiteTarget: onlyMissingWebsite ? "missing" : "any",
            requireMapsScore,
          }),
        });
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Falha ao importar o arquivo CSV.");
      }

      setResult(data as ImportResult);
      onImported();
      onNotify(`${data.added} empresa(s) importada(s) com sucesso.`);
      setFile(null);
      setCsvText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar CSV.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fd-modal-backdrop" onClick={onClose}>
      <div className="fd-modal" style={{ width: "min(560px, 100%)" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--fd-border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileSpreadsheet size={18} style={{ color: "var(--fd-primary)" }} />
            <h3 style={{ fontSize: 18, fontWeight: 500, color: "var(--fd-dark)", margin: 0 }}>Importar Empresas por CSV</h3>
          </div>
          <button type="button" onClick={onClose} className="fd-btn fd-btn-sm" style={{ padding: "0 8px" }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: "var(--fd-gray-100)", padding: "10px 14px", borderRadius: 6 }}>
            <span style={{ fontSize: 13, color: "var(--fd-gray-700)" }}>
              Aceita vírgula ou ponto e vírgula (Excel), com colunas como empresa, whatsapp, site e cidade.
            </span>
            <button type="button" onClick={downloadTemplate} className="fd-btn fd-btn-sm fd-btn-rounded">
              <Download size={13} />
              <span>Baixar modelo CSV</span>
            </button>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 6 }}>
              Arquivo .csv (até 1.000 empresas por envio)
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              className="fd-input"
              style={{ padding: "8px 10px", height: "auto" }}
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 6 }}>
              Ou cole o conteúdo CSV aqui
            </label>
            <textarea
              className="fd-input"
              rows={4}
              style={{ height: "auto", padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}
              placeholder={"empresa;whatsapp;site;cidade;nota;avaliacoes\nLocadora Exemplo;5519999990001;;Campinas, SP;4.8;35"}
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
            />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fd-dark)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={onlyMissingWebsite}
              onChange={e => setOnlyMissingWebsite(e.target.checked)}
            />
            <span>Ignorar empresas que já têm site próprio (mantém quem usa Instagram ou não tem site)</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fd-dark)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={requireMapsScore}
              onChange={e => setRequireMapsScore(e.target.checked)}
            />
            <span>Exigir nota 4,0 ou mais e mínimo 5 avaliações (se o CSV tiver essas colunas)</span>
          </label>

          {error && (
            <div style={{ background: "rgba(255, 79, 112, 0.12)", color: "#ff4f70", padding: "10px 12px", borderRadius: 6, fontSize: 13 }}>
              {error}
            </div>
          )}

          {result && (
            <div style={{ background: "rgba(34, 202, 128, 0.14)", color: "#15803d", padding: "10px 12px", borderRadius: 6, fontSize: 13, lineHeight: 1.45 }}>
              <strong>Importação concluída:</strong> {result.added} adicionada(s) de {result.parsedRows} linha(s)
              {` (${result.skippedUnqualified} filtrada(s), ${result.skippedDuplicate} duplicada(s), ${result.skippedBlocked} bloqueada(s)).`}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
            <button type="button" className="fd-btn fd-btn-rounded" onClick={onClose}>Fechar</button>
            <button type="submit" className="fd-btn fd-btn-primary fd-btn-rounded" disabled={busy}>
              <Upload size={14} />
              <span>{busy ? "Importando..." : "Importar Empresas"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

