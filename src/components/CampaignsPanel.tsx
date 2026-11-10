"use client";

import { FormEvent, useEffect, useState } from "react";
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
  maxResults: 20,
  websiteTarget: "missing",
  intervalHours: 168,
};

const statusLabel: Record<string, string> = {
  SUCCESS: "Concluída",
  RUNNING: "Em andamento",
  FAILED: "Falhou",
  QUEUED: "Na fila",
  PAUSED: "Pausada",
};

interface CampaignsPanelProps {
  onNotify?: (msg: string) => void;
}

export default function CampaignsPanel({ onNotify }: CampaignsPanelProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState(empty);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  return (
    <div>
      {/* Notice Banner + Nova Busca Action */}
      <div
        className="fd-card"
        style={{
          borderLeft: "4px solid #5f76e8",
          padding: "16px 22px",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 260 }}>
          <ShieldCheck size={20} style={{ color: "#5f76e8", flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: "#4f5467" }}>
            A busca apenas encontra e salva locadoras no Maps sem enviar mensagens automáticas. O envio da prévia continua sob seu controle.
          </span>
        </div>

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

      {notice && (
        <div
          className="fd-card"
          style={{
            background: "rgba(34, 202, 128, 0.12)",
            color: "#166534",
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
            style={{ border: 0, background: "transparent", color: "#166534", cursor: "pointer", fontWeight: 600 }}
          >
            Fechar
          </button>
        </div>
      )}

      {error && (
        <div
          className="fd-card"
          style={{
            background: "rgba(255, 79, 112, 0.12)",
            color: "#be123c",
            padding: "12px 18px",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="fd-card" style={{ padding: "54px 20px", textAlign: "center", alignItems: "center" }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: "rgba(95, 118, 232, 0.12)",
              color: "#5f76e8",
              display: "grid",
              placeItems: "center",
              marginBottom: 14,
            }}
          >
            <Search size={22} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 500, color: "#1c2d41", margin: "0 0 6px" }}>
            Nenhuma busca configurada
          </h3>
          <p style={{ fontSize: 14, color: "#7c8798", margin: "0 0 20px", maxWidth: 460 }}>
            Crie uma busca com termos comerciais do nicho de locadoras e selecione a cidade desejada.
          </p>
          <button className="fd-btn fd-btn-primary fd-btn-rounded" onClick={() => setShow(true)}>
            <Plus size={15} />
            <span>Criar Primeira Busca</span>
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 24 }}>
          {campaigns.map(c => (
            <article key={c.id} className="fd-card" style={{ marginBottom: 0 }}>
              <div className="fd-card-body" style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: "#1c2d41" }}>{c.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#7c8798", marginTop: 6, flexWrap: "wrap" }}>
                      <MapPin size={13} />
                      <span>
                        {c.location}
                        {c.regionCode ? `, ${c.regionCode}` : ""}
                      </span>
                      <span>·</span>
                      <Clock3 size={13} />
                      <span>
                        {c.intervalHours >= 168
                          ? "Semanal"
                          : c.intervalHours === 24
                            ? "Diária"
                            : `A cada ${c.intervalHours}h`}
                      </span>
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
                  <span className={`fd-badge-pill ${c.enabled ? "success" : "warning"}`}>
                    {c.enabled ? "Agendada" : "Pausada"}
                  </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {c.searchTerms.map(t => (
                    <span
                      key={t}
                      style={{
                        background: "rgba(95, 118, 232, 0.1)",
                        color: "#5f76e8",
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
                    padding: "14px 0",
                    borderTop: "1px solid #edf2f9",
                    borderBottom: "1px solid #edf2f9",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: "#7c8798" }}>Resultados novos</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: "#1c2d41", marginTop: 2 }}>{c.lastSearchAdded}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#7c8798" }}>Última execução</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1c2d41", marginTop: 4 }}>
                      {c.lastSearchedAt
                        ? new Date(c.lastSearchedAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Ainda não executada"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#7c8798" }}>Estado</div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: c.lastSearchStatus === "FAILED" ? "#ff4f70" : "#1c2d41",
                        marginTop: 4,
                      }}
                    >
                      {c.lastSearchStatus ? statusLabel[c.lastSearchStatus] || c.lastSearchStatus : "Aguardando"}
                    </div>
                  </div>
                </div>

                {c.lastSearchError && (
                  <div style={{ fontSize: 12, color: "#ff4f70", background: "rgba(255, 79, 112, 0.1)", padding: "8px 10px", borderRadius: 4 }}>
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

      <div style={{ marginTop: 22, textAlign: "center", fontSize: 13, color: "#7c8798", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Target size={14} />
        <span>Busca automática no Google Maps com limite de até 200 empresas por execução.</span>
      </div>

      {/* Modal Nova Busca */}
      {show && (
        <div className="fd-modal-backdrop" onClick={() => setShow(false)}>
          <form className="fd-modal" style={{ padding: 26 }} onSubmit={create} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 500, color: "#1c2d41", margin: "0 0 4px" }}>
                  Configurar busca automática
                </h2>
                <p style={{ fontSize: 13, color: "#7c8798", margin: 0 }}>
                  Uma busca inicial será enviada ao salvar.
                </p>
              </div>
              <button className="fd-btn fd-btn-sm" type="button" style={{ padding: "0 8px" }} onClick={() => setShow(false)}>
                <X size={15} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>
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
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>
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
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>
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
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>
                    Presença de site
                  </label>
                  <select className="fd-input" value={form.websiteTarget} onChange={e => setForm({ ...form, websiteTarget: e.target.value })}>
                    <option value="missing">Somente sem site informado</option>
                    <option value="any">Qualquer empresa</option>
                    <option value="present">Somente com site</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>
                    Frequência automática
                  </label>
                  <select className="fd-input" value={form.intervalHours} onChange={e => setForm({ ...form, intervalHours: Number(e.target.value) })}>
                    <option value={24}>Uma vez ao dia</option>
                    <option value={168}>Uma vez por semana</option>
                    <option value={12}>A cada 12 horas</option>
                    <option value={6}>A cada 6 horas</option>
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

