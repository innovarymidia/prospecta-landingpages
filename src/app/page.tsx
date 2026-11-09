"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  purpose?: string | null;
  status: "QUEUED" | "SENT" | "DELIVERED" | "FAILED";
  body: string;
  createdAt: string;
};

type Lead = {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  website: string | null;
  category?: string | null;
  source: string | null;
  status: string;
  notes?: string | null;
  initialSentAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  messages: Array<{ body: string; createdAt?: string }>;
};

type LeadDetail = Omit<Lead, "messages"> & {
  messages: Message[];
};

type Suppression = {
  phone: string;
  reason: string;
  createdAt: string;
};

type SystemStatus = {
  automationEnabled: boolean;
  businessName: string;
  businessOffer: string;
};

const statusConfig: Record<string, { label: string; chipClass: string; color: string }> = {
  NEW: { label: "Novo Lead", chipClass: "new", color: "#94A3B8" },
  READY: { label: "Pronto p/ Contato", chipClass: "ready", color: "#38BDF8" },
  SENT: { label: "Disparado", chipClass: "sent", color: "#F59E0B" },
  REPLIED: { label: "Em Conversa", chipClass: "replied", color: "#F472B6" },
  QUALIFIED: { label: "Qualificado", chipClass: "qualified", color: "#C084FC" },
  MEETING: { label: "Reunião Agendada", chipClass: "qualified", color: "#A855F7" },
  WON: { label: "Cliente Fechado", chipClass: "won", color: "#10B981" },
  LOST: { label: "Encerrado", chipClass: "new", color: "#64748B" },
  OPTED_OUT: { label: "Opt-out", chipClass: "blocked", color: "#F87171" },
  BLOCKED: { label: "Bloqueado", chipClass: "blocked", color: "#EF4444" },
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<"leads" | "suppressions">("leads");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [query, setQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddSuppressionModal, setShowAddSuppressionModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", company: "", website: "", category: "Serviços", source: "Cadastro manual", notes: "" });
  const [suppressionForm, setSuppressionForm] = useState({ phone: "", reason: "Solicitação manual de bloqueio" });
  const [toast, setToast] = useState("");
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // System status
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  // Conversation slide-over drawer
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<LeadDetail | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  function notify(s: string) {
    setToast(s);
    setTimeout(() => setToast(""), 4500);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedPhone(text);
    notify("Telefone copiado para a área de transferência!");
    setTimeout(() => setCopiedPhone(null), 2500);
  }

  // Keyboard shortcut: Escape to close drawer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (selectedLeadId) setSelectedLeadId(null);
        if (showAddModal) setShowAddModal(false);
        if (showAddSuppressionModal) setShowAddSuppressionModal(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLeadId, showAddModal, showAddSuppressionModal]);

  async function loadLeads() {
    try {
      const r = await fetch("/api/leads");
      if (r.status === 401) {
        location.assign("/login");
        return;
      }
      if (!r.ok) throw new Error("Erro ao carregar leads");
      const rows: Lead[] = await r.json();
      setLeads(rows);
    } catch {
      // Ignora erro passageiro de rede
    }
  }

  async function loadSuppressions() {
    try {
      const r = await fetch("/api/suppressions");
      if (r.ok) {
        const rows: Suppression[] = await r.json();
        setSuppressions(rows);
      }
    } catch {}
  }

  async function loadStatus() {
    try {
      const r = await fetch("/api/system/status");
      if (r.ok) {
        const data: SystemStatus = await r.json();
        setSystemStatus(data);
      }
    } catch {}
  }

  useEffect(() => {
    loadStatus();
    loadLeads();
    loadSuppressions();
    const timer = setInterval(() => {
      loadLeads();
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  async function openConversation(leadId: string) {
    setSelectedLeadId(leadId);
    setLoadingChat(true);
    setComposerText("");
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      if (!res.ok) throw new Error("Não foi possível carregar o histórico");
      const data: LeadDetail = await res.json();
      setActiveLead(data);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erro ao abrir conversa");
      setSelectedLeadId(null);
    } finally {
      setLoadingChat(false);
    }
  }

  async function updateStatus(newStatus: string) {
    if (!activeLead) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/leads/${activeLead.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao alterar status");
      }
      const updated = await res.json();
      setActiveLead(prev => prev ? { ...prev, status: updated.status } : null);
      setLeads(prev => prev.map(l => l.id === activeLead.id ? { ...l, status: updated.status } : l));
      notify(`Status atualizado para "${statusConfig[newStatus]?.label || newStatus}"`);
      if (newStatus === "OPTED_OUT") loadSuppressions();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha ao atualizar status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function requestAiDraft() {
    if (!activeLead) return;
    setGeneratingDraft(true);
    try {
      const res = await fetch(`/api/leads/${activeLead.id}/draft`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.draft) {
          setComposerText(data.draft);
          notify("Sugestão de abordagem persuasiva gerada pela IA!");
          return;
        }
      }
      applyApproachTemplate();
    } catch {
      applyApproachTemplate();
    } finally {
      setGeneratingDraft(false);
    }
  }

  function applyApproachTemplate() {
    if (!activeLead) return;
    const company = activeLead.company?.trim() || activeLead.name.trim();
    const template = `Oi, tudo bem? É da ${company}? Uma dúvida rápida: com quem consigo falar sobre novos pacientes/clientes que chegam pelo site e WhatsApp? É por este número mesmo?`;
    setComposerText(template);
    notify("Abordagem rápida carregada!");
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!activeLead || !composerText.trim()) return;

    setSendingMsg(true);
    try {
      const res = await fetch(`/api/leads/${activeLead.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: composerText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enfileirar mensagem");

      notify(activeLead.initialSentAt ? "Resposta enfileirada no WhatsApp!" : "1ª abordagem enviada para a fila de disparo!");
      setComposerText("");
      const refreshRes = await fetch(`/api/leads/${activeLead.id}`);
      if (refreshRes.ok) {
        const refreshed: LeadDetail = await refreshRes.json();
        setActiveLead(refreshed);
      }
      loadLeads();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Não foi possível enviar a mensagem");
    } finally {
      setSendingMsg(false);
    }
  }

  async function unblockPhone(phone: string) {
    try {
      const res = await fetch(`/api/suppressions/${phone}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao desbloquear contato");
      setSuppressions(prev => prev.filter(s => s.phone !== phone));
      notify(`Número ${phone} desbloqueado e liberado.`);
      loadLeads();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erro ao desbloquear");
    }
  }

  async function addSuppression(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(suppressionForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao adicionar supressão");
      }
      setShowAddSuppressionModal(false);
      setSuppressionForm({ phone: "", reason: "Solicitação manual de bloqueio" });
      notify("Número adicionado à lista de supressão.");
      loadSuppressions();
      loadLeads();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erro ao suprimir número");
    } finally {
      setLoading(false);
    }
  }

  async function addLead(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Falha ao salvar");
      setLeads([data, ...leads]);
      setShowAddModal(false);
      setForm({ name: "", phone: "", company: "", website: "", category: "Serviços", source: "Cadastro manual", notes: "" });
      notify("Lead adicionado com sucesso!");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setLoading(false);
    }
  }

  // Estatísticas calculadas reais
  const totalLeads = leads.length;
  const newCount = leads.filter(l => l.status === "NEW").length;
  const readyCount = leads.filter(l => l.status === "READY").length;
  const sentCount = leads.filter(l => l.initialSentAt || l.status === "SENT").length;
  const repliedCount = leads.filter(l => ["REPLIED", "QUALIFIED", "MEETING", "WON"].includes(l.status)).length;
  const wonCount = leads.filter(l => l.status === "WON").length;
  const activeConversations = leads.filter(l => l.status === "REPLIED" || l.status === "QUALIFIED").length;

  // Filtragem combinada por busca e aba de estágio
  const filtered = useMemo(() => {
    return leads.filter(l => {
      const matchesQuery = `${l.name} ${l.company || ""} ${l.phone} ${l.category || ""}`
        .toLowerCase()
        .includes(query.toLowerCase());
      if (!matchesQuery) return false;
      if (stageFilter === "ALL") return true;
      if (stageFilter === "READY") return l.status === "READY" || l.status === "NEW";
      if (stageFilter === "SENT") return l.status === "SENT";
      if (stageFilter === "REPLIED") return l.status === "REPLIED";
      if (stageFilter === "QUALIFIED") return l.status === "QUALIFIED" || l.status === "MEETING";
      if (stageFilter === "WON") return l.status === "WON";
      return true;
    });
  }, [leads, query, stageFilter]);

  return (
    <div className="app-shell">
      {/* Toast Notifier */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          background: "#1E293B",
          color: "#F8FAFC",
          border: "1px solid var(--border-medium)",
          padding: "12px 18px",
          borderRadius: 10,
          fontWeight: 600,
          fontSize: 13,
          boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 10
        }}>
          <Sparkles size={16} style={{ color: "var(--accent-primary)" }} />
          {toast}
        </div>
      )}

      {/* Sidebar Craftmanship */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">P</div>
          <span className="brand-title">Prospecta WA</span>
        </div>

        <div className="nav-section-label">WORKSPACE</div>
        <button
          className={`sidebar-nav-item ${activeTab === "leads" ? "active" : ""}`}
          onClick={() => setActiveTab("leads")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LayoutDashboard size={16} />
            <span>Pipeline de Leads</span>
          </div>
          <span className="sidebar-counter">{totalLeads}</span>
        </button>

        <a className="sidebar-nav-item" href="/campaigns">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Target size={16} />
            <span>Campanhas de Busca</span>
          </div>
          <span className="sidebar-counter">8</span>
        </a>

        <button
          className={`sidebar-nav-item ${activeTab === "suppressions" ? "active" : ""}`}
          onClick={() => setActiveTab("suppressions")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldAlert size={16} />
            <span>Lista de Supressão</span>
          </div>
          {suppressions.length > 0 && <span className="sidebar-counter">{suppressions.length}</span>}
        </button>

        <div className="nav-section-label" style={{ marginTop: 14 }}>OPERAÇÃO</div>
        <div className="sidebar-nav-item" style={{ cursor: "default" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Zap size={16} style={{ color: "#10B981" }} />
            <span>Evolution API</span>
          </div>
          <span style={{ fontSize: 10, color: "#10B981", fontWeight: 600 }}>Ativo</span>
        </div>

        <div className="sidebar-footer">
          <div style={{ padding: "8px 10px", background: "var(--bg-surface-elevated)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Innovary Midia</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Plano Landing Pages</div>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              location.assign("/login");
            }}
            className="sidebar-nav-item"
            style={{ color: "#EF4444", marginTop: 4 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LogOut size={15} />
              <span>Sair da Conta</span>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="app-main">
        {/* Header */}
        <header className="app-header">
          <div className="header-title-group">
            <h1>Central de Prospecção</h1>
            <p>Gerenciamento ativo de oportunidades para Landing Pages (R$ 1.200)</p>
          </div>

          <div className="header-actions">
            <button className="btn-secondary" onClick={() => loadLeads()} title="Atualizar dados">
              <RefreshCw size={14} />
              <span>Atualizar</span>
            </button>
            <button className="btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={15} />
              <span>Novo Lead</span>
            </button>
          </div>
        </header>

        {activeTab === "leads" && (
          <>
            {/* Real Key Performance Metrics */}
            <section className="metrics-grid">
              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-title">Pipeline Total</span>
                  <span className="metric-badge blue">Base ativa</span>
                </div>
                <div className="metric-value">{totalLeads.toLocaleString("pt-BR")}</div>
                <div className="metric-sub">Empresas qualificadas para abordagem</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-title">Abordagens Enviadas</span>
                  <span className="metric-badge amber">1º contato</span>
                </div>
                <div className="metric-value">{sentCount.toLocaleString("pt-BR")}</div>
                <div className="metric-sub">Mensagens disparadas pelo WhatsApp</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-title">Em Atendimento</span>
                  <span className="metric-badge purple">Conversas ativas</span>
                </div>
                <div className="metric-value">{activeConversations.toLocaleString("pt-BR")}</div>
                <div className="metric-sub">Leads que responderam ou estão negociando</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-title">Meta do Mês (Fechamentos)</span>
                  <span className="metric-badge green">R$ 12.000 meta</span>
                </div>
                <div className="metric-value">
                  {wonCount} <span style={{ fontSize: 16, color: "var(--text-tertiary)", fontWeight: 500 }}>/ 10</span>
                </div>
                <div className="metric-sub">{wonCount * 1200} faturados este mês</div>
              </div>
            </section>

            {/* Real Funnel Progression Widget */}
            <div className="funnel-overview">
              <div className="funnel-header">
                <span className="funnel-title">Progresso do Funil Comercial</span>
                <span className="funnel-meta">
                  {wonCount} de 10 clientes fechados ({Math.round((wonCount / 10) * 100)}% da meta)
                </span>
              </div>

              {/* Dynamic Funnel Progress Bar */}
              <div className="funnel-bar-track">
                <div className="funnel-segment" style={{ width: `${totalLeads ? (newCount / totalLeads) * 100 : 25}%`, background: "#64748B" }} title="Novos" />
                <div className="funnel-segment" style={{ width: `${totalLeads ? (readyCount / totalLeads) * 100 : 25}%`, background: "#38BDF8" }} title="Prontos" />
                <div className="funnel-segment" style={{ width: `${totalLeads ? (sentCount / totalLeads) * 100 : 25}%`, background: "#F59E0B" }} title="Disparados" />
                <div className="funnel-segment" style={{ width: `${totalLeads ? (repliedCount / totalLeads) * 100 : 15}%`, background: "#F472B6" }} title="Em Conversa" />
                <div className="funnel-segment" style={{ width: `${totalLeads ? (wonCount / totalLeads) * 100 : 10}%`, background: "#10B981" }} title="Fechados" />
              </div>

              <div className="funnel-legend">
                <div className="legend-item"><i className="legend-dot" style={{ background: "#64748B" }} /> Novos ({newCount})</div>
                <div className="legend-item"><i className="legend-dot" style={{ background: "#38BDF8" }} /> Prontos ({readyCount})</div>
                <div className="legend-item"><i className="legend-dot" style={{ background: "#F59E0B" }} /> Disparados ({sentCount})</div>
                <div className="legend-item"><i className="legend-dot" style={{ background: "#F472B6" }} /> Em Conversa ({repliedCount})</div>
                <div className="legend-item"><i className="legend-dot" style={{ background: "#10B981" }} /> Clientes Fechados ({wonCount})</div>
              </div>
            </div>

            {/* Filter Pills + Search Input */}
            <div className="filter-bar">
              <div className="tab-pills">
                <button
                  className={`tab-pill ${stageFilter === "ALL" ? "active" : ""}`}
                  onClick={() => setStageFilter("ALL")}
                >
                  Todos ({leads.length})
                </button>
                <button
                  className={`tab-pill ${stageFilter === "READY" ? "active" : ""}`}
                  onClick={() => setStageFilter("READY")}
                >
                  Prontos ({readyCount + newCount})
                </button>
                <button
                  className={`tab-pill ${stageFilter === "SENT" ? "active" : ""}`}
                  onClick={() => setStageFilter("SENT")}
                >
                  Disparados ({sentCount})
                </button>
                <button
                  className={`tab-pill ${stageFilter === "REPLIED" ? "active" : ""}`}
                  onClick={() => setStageFilter("REPLIED")}
                >
                  Em Conversa ({repliedCount})
                </button>
                <button
                  className={`tab-pill ${stageFilter === "WON" ? "active" : ""}`}
                  onClick={() => setStageFilter("WON")}
                >
                  Fechados ({wonCount})
                </button>
              </div>

              <div className="table-search-input">
                <Search size={14} style={{ color: "var(--text-tertiary)" }} />
                <input
                  placeholder="Filtrar por nome, empresa, nicho..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                {query && (
                  <button onClick={() => setQuery("")} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: 0 }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Clean, High-Density Table */}
            <div className="table-container">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Empresa / Contato</th>
                    <th>Segmento</th>
                    <th>WhatsApp</th>
                    <th>Etapa no Funil</th>
                    <th style={{ textAlign: "right" }}>Ações Rápidas</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-secondary)" }}>
                        <div style={{ maxWidth: 360, margin: "0 auto" }}>
                          <MessageSquare size={32} style={{ color: "var(--text-tertiary)", margin: "0 auto 12px" }} />
                          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>
                            Nenhum lead encontrado neste filtro
                          </div>
                          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px" }}>
                            Cadastre um lead manualmente ou inicie uma busca automática pela aba de Campanhas.
                          </p>
                          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                            <Plus size={14} /> Cadastrar primeiro lead
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map(lead => {
                      const status = statusConfig[lead.status] || { label: lead.status, chipClass: "new", color: "#94A3B8" };

                      return (
                        <tr key={lead.id} onClick={() => openConversation(lead.id)}>
                          <td>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                              {lead.company || lead.name}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                              {lead.company && <span>{lead.name}</span>}
                              {lead.website && (
                                <a
                                  href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: "var(--accent-primary-text)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}
                                  onClick={e => e.stopPropagation()}
                                >
                                  {lead.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 26)}
                                  <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          </td>

                          <td>
                            <span style={{ fontSize: 12, color: "var(--text-secondary)", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 6 }}>
                              {lead.category || "Geral"}
                            </span>
                          </td>

                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{lead.phone}</span>
                              <button
                                style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: 2 }}
                                title="Copiar telefone"
                                onClick={e => {
                                  e.stopPropagation();
                                  copyToClipboard(lead.phone);
                                }}
                              >
                                {copiedPhone === lead.phone ? <Check size={12} style={{ color: "#10B981" }} /> : <Copy size={12} />}
                              </button>
                            </div>
                          </td>

                          <td>
                            <span className={`status-chip ${status.chipClass}`}>
                              <i style={{ width: 6, height: 6, borderRadius: "50%", background: status.color }} />
                              {status.label}
                            </span>
                          </td>

                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                              <a
                                href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-secondary"
                                style={{ height: 30, padding: "0 9px", fontSize: 11 }}
                                title="Abrir no WhatsApp Web"
                              >
                                <ExternalLink size={12} />
                                WA
                              </a>

                              <button
                                className="btn-primary"
                                style={{ height: 30, padding: "0 10px", fontSize: 11 }}
                                onClick={() => openConversation(lead.id)}
                              >
                                <MessageCircle size={12} />
                                Atender
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Tab Supressões */}
        {activeTab === "suppressions" && (
          <div className="table-container" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px", color: "var(--text-primary)" }}>
                  Contatos Suprimidos & Lista Negra
                </h2>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                  Números bloqueados após solicitação de opt-out ou recusa, protegidos de novos disparos.
                </p>
              </div>
              <button className="btn-primary" onClick={() => setShowAddSuppressionModal(true)}>
                <Plus size={14} /> Adicionar Bloqueio
              </button>
            </div>

            <table className="crm-table">
              <thead>
                <tr>
                  <th>Telefone</th>
                  <th>Motivo</th>
                  <th>Data</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {suppressions.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                      Nenhum telefone na lista de supressão.
                    </td>
                  </tr>
                ) : (
                  suppressions.map(s => (
                    <tr key={s.phone}>
                      <td style={{ fontWeight: 600 }}>{s.phone}</td>
                      <td><span className="status-chip blocked">{s.reason}</span></td>
                      <td style={{ color: "var(--text-secondary)" }}>{new Date(s.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn-secondary"
                          style={{ height: 28, padding: "0 8px", fontSize: 11 }}
                          onClick={() => unblockPhone(s.phone)}
                        >
                          Liberar número
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Slide-over Drawer (Linear / Attio style - Smooth slide in from right) */}
      {selectedLeadId && (
        <div className="slide-over-backdrop" onClick={() => setSelectedLeadId(null)}>
          <div className="slide-over-drawer" onClick={e => e.stopPropagation()}>
            {/* Drawer Header */}
            <div className="drawer-header">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    {activeLead?.company || activeLead?.name}
                  </h3>
                  <a
                    href={`https://wa.me/${activeLead?.phone?.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#10B981", display: "inline-flex", alignItems: "center" }}
                    title="Abrir WhatsApp oficial"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  {activeLead?.name && activeLead.company && `${activeLead.name} · `}
                  {activeLead?.phone}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                  value={activeLead?.status}
                  onChange={e => updateStatus(e.target.value)}
                  disabled={updatingStatus}
                  style={{
                    background: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-medium)",
                    color: "var(--text-primary)",
                    borderRadius: 7,
                    padding: "5px 10px",
                    fontSize: 12,
                    outline: "none"
                  }}
                >
                  {Object.entries(statusConfig).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>

                <button
                  className="btn-secondary"
                  style={{ width: 30, height: 30, padding: 0, display: "grid", placeItems: "center" }}
                  onClick={() => setSelectedLeadId(null)}
                  title="Fechar (Esc)"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Drawer Chat Body */}
            <div className="drawer-content">
              {loadingChat ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)", fontSize: 13 }}>
                  Carregando mensagens...
                </div>
              ) : activeLead?.messages?.length === 0 ? (
                <div style={{
                  padding: 24,
                  background: "var(--bg-surface-elevated)",
                  borderRadius: 12,
                  border: "1px dashed var(--border-subtle)",
                  textAlign: "center"
                }}>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13, marginBottom: 4 }}>
                    Nenhuma mensagem enviada ainda
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px" }}>
                    Clique no botão de IA abaixo para gerar a abordagem ideal (com quebra de padrão e bypass de secretária).
                  </p>
                  <button className="btn-primary" onClick={requestAiDraft} disabled={generatingDraft}>
                    <Sparkles size={14} />
                    <span>{generatingDraft ? "Gerando..." : "Gerar abordagem com IA"}</span>
                  </button>
                </div>
              ) : (
                activeLead?.messages?.map(msg => (
                  <div
                    key={msg.id}
                    className={msg.direction === "OUTBOUND" ? "bubble-sent" : "bubble-received"}
                  >
                    <div>{msg.body}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 4, textAlign: "right" }}>
                      {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {msg.direction === "OUTBOUND" && ` · ${msg.status}`}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer & Composer */}
            <div className="drawer-footer">
              <div className="ai-assistant-banner">
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--accent-primary-text)" }}>
                  <Bot size={15} />
                  <span>IA Persuasiva (Chris Voss & Bypass de Secretária)</span>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ height: 28, padding: "0 10px", fontSize: 11 }}
                  onClick={requestAiDraft}
                  disabled={generatingDraft}
                >
                  <Sparkles size={12} style={{ color: "var(--accent-primary)" }} />
                  {generatingDraft ? "Redigindo..." : "Sugerir Pitch"}
                </button>
              </div>

              <form onSubmit={handleSendMessage} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  value={composerText}
                  onChange={e => setComposerText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      handleSendMessage(e);
                    }
                  }}
                  placeholder="Digite a mensagem do WhatsApp ou gere pela IA (Ctrl+Enter para enviar)..."
                  rows={3}
                  style={{
                    flex: 1,
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-medium)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    resize: "none",
                    outline: "none"
                  }}
                />
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ height: 42, padding: "0 16px" }}
                  disabled={sendingMsg || !composerText.trim()}
                >
                  <Send size={15} />
                  <span>{sendingMsg ? "Enviando..." : "Enviar"}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Add Lead */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "grid", placeItems: "center", zIndex: 110, padding: 20 }} onClick={() => setShowAddModal(false)}>
          <div style={{ width: "min(480px, 100%)", background: "var(--bg-surface)", border: "1px solid var(--border-medium)", borderRadius: 14, padding: 24, boxShadow: "0 25px 60px rgba(0,0,0,0.8)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Cadastrar Novo Lead</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={addLead}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Nome do Contato ou Decisor</label>
              <input
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "9px 12px", color: "var(--text-primary)", fontSize: 13, marginBottom: 14, outline: "none" }}
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Dra. Camila Nogueira"
              />

              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Nome da Empresa / Clínica</label>
              <input
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "9px 12px", color: "var(--text-primary)", fontSize: 13, marginBottom: 14, outline: "none" }}
                value={form.company}
                onChange={e => setForm({ ...form, company: e.target.value })}
                placeholder="Ex.: Instituto Nogueira de Estética"
              />

              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>WhatsApp (com DDD)</label>
              <input
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "9px 12px", color: "var(--text-primary)", fontSize: 13, marginBottom: 14, outline: "none" }}
                required
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="Ex.: 5511999999999"
              />

              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Segmento / Nicho</label>
              <input
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "9px 12px", color: "var(--text-primary)", fontSize: 13, marginBottom: 14, outline: "none" }}
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                placeholder="Ex.: Odontologia, Energia Solar, Advocacia..."
              />

              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Site Atual (se houver)</label>
              <input
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "9px 12px", color: "var(--text-primary)", fontSize: 13, marginBottom: 14, outline: "none" }}
                value={form.website}
                onChange={e => setForm({ ...form, website: e.target.value })}
                placeholder="Ex.: https://institutonogueira.com.br"
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? "Salvando..." : "Salvar Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Suppression */}
      {showAddSuppressionModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "grid", placeItems: "center", zIndex: 110, padding: 20 }} onClick={() => setShowAddSuppressionModal(false)}>
          <div style={{ width: "min(460px, 100%)", background: "var(--bg-surface)", border: "1px solid var(--border-medium)", borderRadius: 14, padding: 24, boxShadow: "0 25px 60px rgba(0,0,0,0.8)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Bloquear Número (Supressão)</h3>
              <button onClick={() => setShowAddSuppressionModal(false)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={addSuppression}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>WhatsApp para Bloqueio</label>
              <input
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "9px 12px", color: "var(--text-primary)", fontSize: 13, marginBottom: 14, outline: "none" }}
                required
                value={suppressionForm.phone}
                onChange={e => setSuppressionForm({ ...suppressionForm, phone: e.target.value })}
                placeholder="Ex.: 5511999999999"
              />

              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Motivo</label>
              <input
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "9px 12px", color: "var(--text-primary)", fontSize: 13, marginBottom: 14, outline: "none" }}
                required
                value={suppressionForm.reason}
                onChange={e => setSuppressionForm({ ...suppressionForm, reason: e.target.value })}
                placeholder="Ex.: Pedido de opt-out, número incorreto..."
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button type="button" className="btn-secondary" onClick={() => setShowAddSuppressionModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? "Bloqueando..." : "Confirmar Bloqueio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
