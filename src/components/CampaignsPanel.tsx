"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Clock3, MapPin, Play, Plus, Search, ShieldCheck, Target, ToggleLeft, ToggleRight, Trash2, X } from "lucide-react";

type Run = {
  id: string;
  status: string;
  found: number;
  added: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

type Campaign = {
  id: string;
  name: string;
  enabled: boolean;
  searchTerms: string[];
  location: string;
  regionCode: string | null;
  maxResults: number;
  websiteTarget: string;
  intervalHours: number;
  lastSearchedAt: string | null;
  lastSearchStatus: string | null;
  lastSearchCount: number;
  lastSearchAdded: number;
  lastSearchError: string | null;
  searchRuns: Run[];
};

const empty = {
  name: "",
  terms: "",
  location: "",
  regionCode: "BR",
  maxResults: 25,
  websiteTarget: "missing",
  intervalHours: 720,
};

const statusLabel: Record<string, string> = {
  SUCCESS: "Concluída",
  RUNNING: "Em andamento",
  FAILED: "Falhou",
  QUEUED: "Na fila",
  PAUSED: "Pausada",
};

function formatIntervalLabel(hours: number): string {
  if (hours >= 720) return "A cada 30 dias";
  if (hours >= 48) return `A cada ${Math.round(hours / 24)} dias`;
  if (hours === 24) return "Diária";
  return `A cada ${hours}h`;
}

interface CampaignsPanelProps {
  onNotify?: (msg: string) => void;
  searchConfigured?: boolean;
  searchProvider?: "serper" | "outscraper" | null;
  onOpenCsvImport?: () => void;
}

export default function CampaignsPanel({
  onNotify,
  searchConfigured,
  searchProvider,
  onOpenCsvImport,
}: CampaignsPanelProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState(empty);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filterTab, setFilterTab] = useState<"ALL" | "QUEUE" | "DONE" | "PAUSED">("ALL");
  const [searchText, setSearchText] = useState("");

  async function load() {
    const r = await fetch("/api/campaigns");
    if (r.status === 401) {
      location.assign("/login");
      return;
    }
    if (r.ok) setCampaigns(await r.json());
  }

  useEffect(() => {
    load().catch(() => setError("Não foi possível carregar as buscas"));
    const timer = setInterval(() => {
      load().catch(() => {});
    }, 15_000);
    return () => clearInterval(timer);
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          searchTerms: form.terms
            .split("\n")
            .map(t => t.trim())
            .filter(Boolean),
          maxResults: Number(form.maxResults),
          intervalHours: Number(form.intervalHours),
          enabled: true,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        throw Error(
          typeof data.error === "string"
            ? data.error
            : "Verifique os campos da busca e a chave do serviço de busca no Maps"
        );
      }
      setShow(false);
      setForm(empty);
      const msg = "Busca criada e primeira execução enviada para a fila";
      setNotice(msg);
      onNotify?.(msg);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar busca");
    } finally {
      setLoading(false);
    }
  }

  async function run(id: string) {
    setError("");
    const r = await fetch(`/api/campaigns/${id}/run`, { method: "POST" });
    const data = await r.json();
    if (!r.ok) {
      setError(typeof data.error === "string" ? data.error : "Não foi possível iniciar a busca");
    } else {
      const msg = "Busca enviada para processamento";
      setNotice(msg);
      onNotify?.(msg);
    }
    await load();
  }

  async function toggle(c: Campaign) {
    const r = await fetch(`/api/campaigns/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !c.enabled }),
    });
    if (r.ok) {
      const msg = c.enabled ? "Agendamento pausado" : "Agendamento ativado";
      setNotice(msg);
      onNotify?.(msg);
      await load();
    } else {
      setError("Não foi possível alterar o agendamento");
    }
  }

  async function remove(c: Campaign) {
    setError("");
    const r = await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
    if (r.ok) {
      const msg = `Campanha "${c.name}" removida`;
      setNotice(msg);
      onNotify?.(msg);
      await load();
    } else {
      setError("Não foi possível remover esta campanha");
    }
  }

  const queueCount = campaigns.filter(c => c.enabled && !c.lastSearchedAt).length;
  const doneCount = campaigns.filter(c => Boolean(c.lastSearchedAt)).length;
  const pausedCount = campaigns.filter(c => !c.enabled).length;

  const filteredCampaigns = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return campaigns.filter(c => {
      if (filterTab === "QUEUE" && (!c.enabled || Boolean(c.lastSearchedAt))) return false;
      if (filterTab === "DONE" && !c.lastSearchedAt) return false;
      if (filterTab === "PAUSED" && c.enabled) return false;
      if (!q) return true;
      return `${c.name} ${c.location} ${c.searchTerms.join(" ")}`.toLowerCase().includes(q);
    });
  }, [campaigns, filterTab, searchText]);

  return (
    <div>
      {/* Notice Banner + Nova Busca Action */}
      <div
        className="fd-card"
        style={{
          borderLeft: "4px solid var(--fd-primary)",
          padding: "16px 20px",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 240px" }}>
          <ShieldCheck size={20} style={{ color: "var(--fd-primary)", flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: "var(--fd-gray-700)", lineHeight: 1.45 }}>
            <strong style={{ color: "var(--fd-dark)" }}>Esteira diária inteligente (1 cidade nova por dia):</strong> a captura roda independente dos envios de WhatsApp, filtrando empresas com nota 4,0 ou mais, mínimo 5 avaliações e sem site próprio (incluindo Instagram).{" "}
            {searchConfigured === false
              ? "Para ativar grátis sem cartão, configure SERPER_API_KEY (2.500 buscas gratuitas no Maps) ou importe uma planilha pelo botão Importar CSV."
              : `Provedor ativo: ${searchProvider === "serper" ? "Serper Maps (gratuito)" : "Google Maps API"}. Você pode usar Buscar agora a qualquer momento.`}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {onOpenCsvImport && (
            <button type="button" className="fd-btn fd-btn-rounded" onClick={onOpenCsvImport}>
              Importar CSV
            </button>
          )}
          <button
            className="fd-btn fd-btn-primary fd-btn-rounded"
            onClick={() => {
              setError("");
              setShow(true);
            }}
          >
            <Plus size={15} />
            <span>Nova Busca</span>
          </button>
        </div>
      </div>

      {/* Filtros da Esteira */}
      {campaigns.length > 0 && (
        <div
          className="fd-card"
          style={{
            padding: "14px 18px",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { id: "ALL", label: `Todas (${campaigns.length})` },
              { id: "QUEUE", label: `Na esteira (${queueCount})` },
              { id: "DONE", label: `Executadas (${doneCount})` },
              { id: "PAUSED", label: `Pausadas (${pausedCount})` },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id as "ALL" | "QUEUE" | "DONE" | "PAUSED")}
                className={`fd-btn fd-btn-sm fd-btn-rounded ${filterTab === tab.id ? "fd-btn-primary" : ""}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
            <input
              className="fd-input"
              type="search"
              style={{ height: 34, fontSize: 13, paddingRight: 30 }}
              placeholder="Filtrar por cidade ou nome..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <Search
              size={14}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fd-body-color)" }}
            />
          </div>
        </div>
      )}

      {notice && (
        <div
          className="fd-card"
          style={{
            background: "rgba(34, 202, 128, 0.14)",
            color: "#22ca80",
            padding: "12px 18px",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <span>{notice}</span>
          <button
            onClick={() => setNotice("")}
            style={{ border: 0, background: "transparent", color: "#22ca80", cursor: "pointer", fontWeight: 600 }}
          >
            Fechar
          </button>
        </div>
      )}

      {error && (
        <div
          className="fd-card"
          style={{
            background: "rgba(255, 79, 112, 0.14)",
            color: "#ff4f70",
            padding: "12px 18px",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}

      {filteredCampaigns.length === 0 ? (
        <div className="fd-card" style={{ padding: "54px 20px", textAlign: "center", alignItems: "center" }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: "rgba(95, 118, 232, 0.12)",
              color: "var(--fd-primary)",
              display: "grid",
              placeItems: "center",
              marginBottom: 14,
            }}
          >
            <Search size={22} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 500, color: "var(--fd-dark)", margin: "0 0 6px" }}>
            {campaigns.length === 0 ? "Nenhuma busca configurada" : "Nenhuma cidade encontrada neste filtro"}
          </h3>
          <p style={{ fontSize: 14, color: "var(--fd-body-color)", margin: "0 0 20px", maxWidth: 460 }}>
            {campaigns.length === 0
              ? "Crie uma busca com termos comerciais do nicho de locadoras e selecione a cidade desejada."
              : "Limpe o filtro ou digite outra cidade para visualizar."}
          </p>
          {campaigns.length === 0 && (
            <button className="fd-btn fd-btn-primary fd-btn-rounded" onClick={() => setShow(true)}>
              <Plus size={15} />
              <span>Criar Primeira Busca</span>
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))", gap: 18 }}>
          {filteredCampaigns.map(c => (
            <article key={c.id} className="fd-card" style={{ marginBottom: 0 }}>
              <div className="fd-card-body" style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: "var(--fd-dark)" }}>{c.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fd-body-color)", marginTop: 6, flexWrap: "wrap" }}>
                      <MapPin size={13} />
                      <span>
                        {c.location}
                        {c.regionCode ? `, ${c.regionCode}` : ""}
                      </span>
                      <span>·</span>
                      <Clock3 size={13} />
                      <span>{formatIntervalLabel(c.intervalHours)}</span>
                      <span>·</span>
                      <span>
                        {c.websiteTarget === "missing"
                          ? "Apenas sem site"
                          : c.websiteTarget === "present"
                            ? "Apenas com site"
                            : "Todas as empresas"}
                      </span>
                    </div>
                  </div>
                  <span className={`fd-badge-pill ${c.enabled ? (c.lastSearchedAt ? "primary" : "success") : "warning"}`}>
                    {!c.enabled ? "Pausada" : c.lastSearchedAt ? "Ativa" : "Na esteira"}
                  </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {c.searchTerms.map(t => (
                    <span
                      key={t}
                      style={{
                        background: "rgba(95, 118, 232, 0.14)",
                        color: "var(--fd-primary)",
                        fontSize: 12,
                        fontWeight: 500,
                        padding: "4px 10px",
                        borderRadius: 999,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 10,
                    padding: "12px 0",
                    borderTop: "1px solid var(--fd-border-color)",
                    borderBottom: "1px solid var(--fd-border-color)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: "var(--fd-body-color)" }}>Qualificados</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: "var(--fd-dark)", marginTop: 2 }}>{c.lastSearchAdded}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--fd-body-color)" }}>Execução</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fd-dark)", marginTop: 4 }}>
                      {c.lastSearchedAt
                        ? new Date(c.lastSearchedAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Na fila"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--fd-body-color)" }}>Estado</div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: c.lastSearchStatus === "FAILED" ? "#ff4f70" : "var(--fd-dark)",
                        marginTop: 4,
                      }}
                    >
                      {c.lastSearchStatus ? statusLabel[c.lastSearchStatus] || c.lastSearchStatus : "Pronta"}
                    </div>
                  </div>
                </div>

                {c.lastSearchError && (
                  <div style={{ fontSize: 12, color: "#ff4f70", background: "rgba(255, 79, 112, 0.12)", padding: "8px 10px", borderRadius: 4 }}>
                    {c.lastSearchError}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="fd-btn fd-btn-sm fd-btn-rounded" onClick={() => toggle(c)}>
                      {c.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      <span>{c.enabled ? "Pausar" : "Ativar"}</span>
                    </button>
                    <button
                      className="fd-btn fd-btn-sm fd-btn-rounded"
                      style={{ color: "#ff4f70", borderColor: "rgba(255, 79, 112, 0.35)" }}
                      onClick={() => remove(c)}
                      title="Excluir campanha"
                    >
                      <Trash2 size={13} />
                      <span>Excluir</span>
                    </button>
                  </div>

                  <button className="fd-btn fd-btn-sm fd-btn-primary fd-btn-rounded" onClick={() => run(c.id)}>
                    <Play size={13} />
                    <span>Buscar agora</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div style={{ marginTop: 22, textAlign: "center", fontSize: 13, color: "var(--fd-body-color)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Target size={14} />
        <span>Busca automática no Google Maps com filtro mínimo de qualidade (nota 4,0 e 5 avaliações).</span>
      </div>

      {/* Modal Nova Busca */}
      {show && (
        <div className="fd-modal-backdrop" onClick={() => setShow(false)}>
          <form className="fd-modal" style={{ padding: 24 }} onSubmit={create} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 500, color: "var(--fd-dark)", margin: "0 0 4px" }}>
                  Configurar busca automática
                </h2>
                <p style={{ fontSize: 13, color: "var(--fd-body-color)", margin: 0 }}>
                  Uma busca inicial será enviada ao salvar.
                </p>
              </div>
              <button className="fd-btn fd-btn-sm" type="button" style={{ padding: "0 8px" }} onClick={() => setShow(false)}>
                <X size={15} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>
                  Nome da busca
                </label>
                <input
                  className="fd-input"
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Locadoras de Equipamentos em Campinas"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>
                  Termos de busca (um por linha, até 8)
                </label>
                <textarea
                  className="fd-textarea"
                  required
                  rows={3}
                  value={form.terms}
                  onChange={e => setForm({ ...form, terms: e.target.value })}
                  placeholder={"locadora de equipamentos para construção\naluguel de andaimes e betoneiras"}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>
                  Cidade, região ou estado
                </label>
                <input
                  className="fd-input"
                  required
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="Campinas, SP"
                />
              </div>

              <div className="fd-form-grid-2">
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>
                    Código do país
                  </label>
                  <input
                    className="fd-input"
                    maxLength={2}
                    value={form.regionCode}
                    onChange={e => setForm({ ...form, regionCode: e.target.value.toUpperCase() })}
                    placeholder="BR"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>
                    Máximo por termo
                  </label>
                  <input
                    className="fd-input"
                    type="number"
                    min={1}
                    max={100}
                    value={form.maxResults}
                    onChange={e => setForm({ ...form, maxResults: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="fd-form-grid-2">
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>
                    Presença de site
                  </label>
                  <select className="fd-input" value={form.websiteTarget} onChange={e => setForm({ ...form, websiteTarget: e.target.value })}>
                    <option value="missing">Somente sem site próprio</option>
                    <option value="any">Qualquer empresa</option>
                    <option value="present">Somente com site</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>
                    Frequência automática
                  </label>
                  <select className="fd-input" value={form.intervalHours} onChange={e => setForm({ ...form, intervalHours: Number(e.target.value) })}>
                    <option value={720}>Uma vez por mês (30 dias)</option>
                    <option value={168}>Uma vez por semana</option>
                    <option value={24}>Uma vez ao dia</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" className="fd-btn fd-btn-rounded" onClick={() => setShow(false)}>
                  Cancelar
                </button>
                <button className="fd-btn fd-btn-primary fd-btn-rounded" disabled={loading}>
                  {loading ? "Criando..." : "Salvar e buscar"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
