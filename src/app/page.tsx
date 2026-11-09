"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  ExternalLink,
  Flame,
  LayoutDashboard,
  LogOut,
  MessageCircle,
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

const statusText: Record<string, string> = {
  NEW: "Novo Lead",
  READY: "Pronto p/ Contato",
  SENT: "Mensagem Enviada",
  REPLIED: "Respondeu",
  QUALIFIED: "Qualificado",
  MEETING: "Reunião Marcada",
  WON: "Cliente Fechado",
  LOST: "Perdido",
  OPTED_OUT: "Opt-out",
  BLOCKED: "Bloqueado",
};

const statusBadgeVariant: Record<string, "teal" | "blue" | "amber" | "pink" | "emerald" | "gray" | "red"> = {
  NEW: "gray",
  READY: "blue",
  SENT: "amber",
  REPLIED: "pink",
  QUALIFIED: "teal",
  MEETING: "teal",
  WON: "emerald",
  LOST: "gray",
  OPTED_OUT: "red",
  BLOCKED: "red",
};

const progressPercent: Record<string, number> = {
  NEW: 15,
  READY: 30,
  SENT: 50,
  REPLIED: 70,
  QUALIFIED: 85,
  MEETING: 92,
  WON: 100,
  LOST: 10,
  OPTED_OUT: 5,
  BLOCKED: 0,
};

const progressColor: Record<string, "orange" | "teal" | "blue" | "pink"> = {
  NEW: "blue",
  READY: "blue",
  SENT: "orange",
  REPLIED: "pink",
  QUALIFIED: "teal",
  MEETING: "teal",
  WON: "teal",
  LOST: "blue",
  OPTED_OUT: "orange",
  BLOCKED: "orange",
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<"leads" | "suppressions">("leads");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [query, setQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddSuppressionModal, setShowAddSuppressionModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", company: "", website: "", category: "Serviços", source: "Cadastro manual", notes: "" });
  const [suppressionForm, setSuppressionForm] = useState({ phone: "", reason: "Solicitação manual de bloqueio" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  // System status
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  // Conversation panel
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
      notify(`Status atualizado para "${statusText[newStatus] || newStatus}"`);
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

  const filtered = useMemo(() => {
    return leads.filter(l => `${l.name} ${l.company || ""} ${l.phone}`.toLowerCase().includes(query.toLowerCase()));
  }, [leads, query]);

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

  // Estatísticas calculadas
  const totalLeads = leads.length;
  const sentCount = leads.filter(l => l.initialSentAt || l.status === "SENT").length;
  const repliedCount = leads.filter(l => ["REPLIED", "QUALIFIED", "MEETING", "WON"].includes(l.status)).length;
  const wonCount = leads.filter(l => l.status === "WON").length;
  const responseRate = sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 15;

  return (
    <div className="figma-shell">
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          background: "var(--accent-mint)",
          color: "var(--accent-mint-dark)",
          padding: "12px 20px",
          borderRadius: 14,
          fontWeight: 700,
          fontSize: 13,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 10
        }}>
          <Sparkles size={16} />
          {toast}
        </div>
      )}

      {/* Sleek Sidebar (Matching Figma Design) */}
      <aside className="figma-sidebar">
        {/* MacOS Window Dots */}
        <div className="mac-dots">
          <div className="mac-dot red" />
          <div className="mac-dot yellow" />
          <div className="mac-dot green" />
        </div>

        {/* Brand / Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 10px 18px" }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "linear-gradient(135deg, #7CE7D7 0%, #38BDF8 100%)",
            display: "grid",
            placeItems: "center",
            color: "#12141F",
            fontWeight: 800,
            fontSize: 14
          }}>
            P
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-pure)", letterSpacing: -0.3 }}>
            Prospecta<span style={{ color: "var(--accent-mint)" }}>.wa</span>
          </span>
        </div>

        {/* Navigation Links */}
        <div className="nav-group-title">GERAL</div>
        <button
          className={`nav-link ${activeTab === "leads" ? "active" : ""}`}
          onClick={() => setActiveTab("leads")}
          style={{ width: "100%", background: activeTab === "leads" ? undefined : "none", border: "none" }}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </button>

        <a className="nav-link" href="/campaigns">
          <Target size={18} />
          <span>Campanhas</span>
        </a>

        <button
          className={`nav-link ${activeTab === "suppressions" ? "active" : ""}`}
          onClick={() => setActiveTab("suppressions")}
          style={{ width: "100%", background: activeTab === "suppressions" ? undefined : "none", border: "none" }}
        >
          <ShieldAlert size={18} />
          <span>Supressões ({suppressions.length})</span>
        </button>

        <div className="nav-group-title" style={{ marginTop: 12 }}>AUTOMAÇÃO</div>
        <div className="nav-link" style={{ cursor: "default", opacity: 0.7 }}>
          <Zap size={18} />
          <span>Evolution WhatsApp</span>
        </div>

        {/* Sidebar Footer / Profile */}
        <div className="sidebar-footer">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" }}>
            <div className="user-avatar">IN</div>
            <div className="user-info">
              <span className="user-name">Innovary Midia</span>
              <span className="user-role" style={{ color: "var(--accent-mint)" }}>● Online (Render)</span>
            </div>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              location.assign("/login");
            }}
            className="nav-link"
            style={{ width: "100%", background: "none", border: "none", marginTop: 8, color: "#EF4444" }}
          >
            <LogOut size={16} />
            <span>Encerrar Sessão</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="figma-main">
        {/* Top Header Bar */}
        <header className="figma-header">
          <div className="search-box">
            <Search size={16} style={{ color: "var(--text-dim)" }} />
            <input
              placeholder="Buscar por lead, empresa ou telefone..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div className="user-nav">
            <button className="icon-btn" title="Notificações">
              <Bell size={18} />
              <div className="badge-dot" />
            </button>

            <button className="btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={16} />
              <span>Novo Lead</span>
            </button>

            <div className="user-profile">
              <div className="user-avatar">IN</div>
              <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
            </div>
          </div>
        </header>

        {activeTab === "leads" && (
          <>
            {/* Top KPI Cards Row ("Today's Sales" - Matching Figma) */}
            <section className="kpi-row">
              {/* Card 1: Total Leads */}
              <div className="kpi-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="kpi-icon-box amber">
                    <TrendingUp size={22} />
                  </div>
                  <span className="kpi-trend positive">+12% este mês</span>
                </div>
                <div>
                  <h3 className="kpi-value">{totalLeads.toLocaleString("pt-BR")}</h3>
                  <p className="kpi-label">Total de Leads Mapeados</p>
                </div>
              </div>

              {/* Card 2: Disparados */}
              <div className="kpi-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="kpi-icon-box blue">
                    <Send size={22} />
                  </div>
                  <span className="kpi-trend positive">+8% hoje</span>
                </div>
                <div>
                  <h3 className="kpi-value">{sentCount.toLocaleString("pt-BR")}</h3>
                  <p className="kpi-label">Abordagens Realizadas</p>
                </div>
              </div>

              {/* Card 3: Respostas */}
              <div className="kpi-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="kpi-icon-box pink">
                    <MessageCircle size={22} />
                  </div>
                  <span className="kpi-trend positive">{responseRate}% taxa</span>
                </div>
                <div>
                  <h3 className="kpi-value">{repliedCount.toLocaleString("pt-BR")}</h3>
                  <p className="kpi-label">Respostas & Conversas</p>
                </div>
              </div>

              {/* Card 4: Clientes Fechados / Meta */}
              <div className="kpi-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="kpi-icon-box mint">
                    <Flame size={22} />
                  </div>
                  <span className="kpi-trend positive">Meta: 10/mês</span>
                </div>
                <div>
                  <h3 className="kpi-value">{wonCount} <span style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 500 }}>/ 10</span></h3>
                  <p className="kpi-label">Vendas Fechadas (R$ 1.200)</p>
                </div>
              </div>
            </section>

            {/* Dashboard Content Grid (Left 62% + Right 38% Matching Figma) */}
            <div className="dashboard-grid">
              {/* Left Column: Top Products / Leads Table + Earnings */}
              <div className="dash-col">
                {/* Table Card */}
                <div className="figma-card">
                  <div className="card-header">
                    <div>
                      <h2>Top Leads & Oportunidades</h2>
                      <p>Pipeline de conversão e abordagens pelo WhatsApp</p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-secondary" onClick={() => loadLeads()} title="Atualizar">
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table className="figma-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>#</th>
                          <th>Lead / Empresa</th>
                          <th>Segmento</th>
                          <th>Funil</th>
                          <th>Contato</th>
                          <th style={{ textAlign: "right" }}>Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                              Nenhum lead encontrado. Crie uma nova busca em <strong>Campanhas</strong> ou adicione um lead manualmente!
                            </td>
                          </tr>
                        ) : (
                          filtered.slice(0, 8).map((lead, idx) => {
                            const pct = progressPercent[lead.status] || 15;
                            const barColor = progressColor[lead.status] || "blue";
                            const badgeColor = statusBadgeVariant[lead.status] || "gray";

                            return (
                              <tr key={lead.id} style={{ cursor: "pointer" }} onClick={() => openConversation(lead.id)}>
                                <td style={{ color: "var(--text-dim)", fontWeight: 600 }}>
                                  {String(idx + 1).padStart(2, "0")}
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600, color: "var(--text-pure)", fontSize: 13 }}>
                                    {lead.company || lead.name}
                                  </div>
                                  <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 2 }}>
                                    {lead.website ? (
                                      <a
                                        href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ color: "var(--accent-mint)", textDecoration: "none" }}
                                        onClick={e => e.stopPropagation()}
                                      >
                                        {lead.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 24)} ↗
                                      </a>
                                    ) : (
                                      lead.name
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span className="f-badge gray">
                                    {lead.category || "Serviços"}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    <div className="progress-bar-bg">
                                      <div className={`progress-bar-fill ${barColor}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={`f-badge ${badgeColor}`} style={{ alignSelf: "flex-start", fontSize: 10, padding: "2px 6px" }}>
                                      {statusText[lead.status] || lead.status}
                                    </span>
                                  </div>
                                </td>
                                <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                  {lead.phone}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <button
                                    className="btn-primary"
                                    style={{ padding: "5px 10px", fontSize: 11 }}
                                    onClick={e => {
                                      e.stopPropagation();
                                      openConversation(lead.id);
                                    }}
                                  >
                                    <MessageCircle size={13} />
                                    Chat
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Earnings Gauge Card (Matching Figma "Earnings - $6078.76 / 80%") */}
                <div className="figma-card">
                  <div className="card-header">
                    <div>
                      <h2>Faturamento & Projeção Comercial</h2>
                      <p>Meta mensal: 10 clientes fechados de Landing Page (R$ 1.200 cada)</p>
                    </div>
                    <span className="f-badge teal">Ativo</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 32, fontWeight: 800, color: "var(--text-pure)", letterSpacing: -0.5 }}>
                        R$ 12.000<span style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 500 }}>/mês</span>
                      </div>
                      <p style={{ color: "var(--accent-mint)", fontSize: 13, fontWeight: 600, margin: "6px 0 0" }}>
                        80% de probabilidade de meta atingida com a cadência ativa
                      </p>
                    </div>

                    {/* Semi-circle Gauge SVG */}
                    <div style={{ position: "relative", width: 180, height: 95, display: "grid", placeItems: "center" }}>
                      <svg width="180" height="95" viewBox="0 0 180 95">
                        <path
                          d="M 15 90 A 75 75 0 0 1 165 90"
                          fill="none"
                          stroke="rgba(255, 255, 255, 0.08)"
                          strokeWidth="16"
                          strokeLinecap="round"
                        />
                        <path
                          d="M 15 90 A 75 75 0 0 1 135 37"
                          fill="none"
                          stroke="url(#mintGrad)"
                          strokeWidth="16"
                          strokeLinecap="round"
                        />
                        <defs>
                          <linearGradient id="mintGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#7CE7D7" />
                            <stop offset="100%" stopColor="#38BDF8" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div style={{ position: "absolute", bottom: 2, textAlign: "center" }}>
                        <span style={{ fontSize: 24, fontWeight: 800, color: "var(--text-pure)" }}>80%</span>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>CONVERSÃO</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Level (Bar), Customer Fulfilment (Dual Wave), Visitor Insights (Mountain) */}
              <div className="dash-col">
                {/* Level / Bar Chart Widget */}
                <div className="figma-card">
                  <div className="card-header">
                    <div>
                      <h2>Nível de Atividade Semanal</h2>
                      <p>Disparos vs Atendimentos</p>
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <i style={{ width: 6, height: 6, borderRadius: "50%", background: "#7CE7D7" }} /> Volume
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <i style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} /> Resposta
                      </span>
                    </div>
                  </div>

                  {/* Vertical Bar Chart SVG */}
                  <div style={{ height: 110, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, padding: "0 6px" }}>
                    {[
                      { day: "Seg", h1: 65, h2: 35 },
                      { day: "Ter", h1: 85, h2: 50 },
                      { day: "Qua", h1: 95, h2: 70 },
                      { day: "Qui", h1: 80, h2: 60 },
                      { day: "Sex", h1: 75, h2: 45 },
                      { day: "Sáb", h1: 30, h2: 15 },
                      { day: "Dom", h1: 20, h2: 10 },
                    ].map(col => (
                      <div key={col.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
                        <div style={{ width: 14, height: 80, background: "rgba(255,255,255,0.06)", borderRadius: 6, display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
                          <div style={{ width: "100%", height: `${col.h1}%`, background: "linear-gradient(180deg, #7CE7D7 0%, #2DD4BF 100%)", borderRadius: 6 }} />
                        </div>
                        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{col.day}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Customer Fulfilment / Dual Wave Chart Widget */}
                <div className="figma-card">
                  <div className="card-header">
                    <div>
                      <h2>Taxa de Qualificação</h2>
                      <p>Evolução do funil de abordagem</p>
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                      <span style={{ color: "#7CE7D7" }}>● Mês Passado: R$ 4.087</span>
                      <span style={{ color: "#F472B6" }}>● Este Mês: R$ 5.508</span>
                    </div>
                  </div>

                  {/* Dual Wave SVG */}
                  <div style={{ width: "100%", height: 100 }}>
                    <svg viewBox="0 0 320 90" style={{ width: "100%", height: "100%", overflow: "visible" }}>
                      <defs>
                        <linearGradient id="wave1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7CE7D7" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#7CE7D7" stopOpacity="0.0" />
                        </linearGradient>
                        <linearGradient id="wave2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#F472B6" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#F472B6" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {/* Top Wave (Teal) */}
                      <path
                        d="M 0 45 Q 60 15, 120 40 T 240 25 T 320 20 L 320 90 L 0 90 Z"
                        fill="url(#wave1)"
                      />
                      <path
                        d="M 0 45 Q 60 15, 120 40 T 240 25 T 320 20"
                        fill="none"
                        stroke="#7CE7D7"
                        strokeWidth="2.5"
                      />
                      {/* Bottom Wave (Pink) */}
                      <path
                        d="M 0 65 Q 60 40, 120 60 T 240 50 T 320 45 L 320 90 L 0 90 Z"
                        fill="url(#wave2)"
                      />
                      <path
                        d="M 0 65 Q 60 40, 120 60 T 240 50 T 320 45"
                        fill="none"
                        stroke="#F472B6"
                        strokeWidth="2.5"
                      />
                    </svg>
                  </div>
                </div>

                {/* Visitor Insights / Mountain Area Chart Widget */}
                <div className="figma-card">
                  <div className="card-header">
                    <div>
                      <h2>Desempenho de Captação</h2>
                      <p>Crescimento de contatos ao longo dos meses</p>
                    </div>
                    <span className="f-badge amber">● Novos Leads</span>
                  </div>

                  {/* Mountain Chart SVG */}
                  <div style={{ width: "100%", height: 110 }}>
                    <svg viewBox="0 0 340 100" style={{ width: "100%", height: "100%", overflow: "visible" }}>
                      <defs>
                        <linearGradient id="mountain" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7CE7D7" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#141622" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M 0 85 L 25 75 L 50 82 L 80 60 L 110 70 L 140 40 L 170 30 L 200 45 L 230 65 L 260 55 L 290 70 L 320 45 L 340 60 L 340 100 L 0 100 Z"
                        fill="url(#mountain)"
                      />
                      <path
                        d="M 0 85 L 25 75 L 50 82 L 80 60 L 110 70 L 140 40 L 170 30 L 200 45 L 230 65 L 260 55 L 290 70 L 320 45 L 340 60"
                        fill="none"
                        stroke="#7CE7D7"
                        strokeWidth="2"
                      />
                      {/* Highlight Dot */}
                      <circle cx="170" cy="30" r="4.5" fill="#F59E0B" stroke="#141622" strokeWidth="2" />
                      <line x1="170" y1="30" x2="170" y2="95" stroke="#F59E0B" strokeDasharray="3,3" strokeWidth="1" />
                    </svg>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-dim)", marginTop: 6 }}>
                    <span>Jan</span><span>Fev</span><span>Mar</span><span>Abr</span><span>Mai</span><span>Jun</span><span>Jul</span><span>Ago</span><span>Set</span><span>Out</span><span>Nov</span><span>Dez</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Tab Supressões */}
        {activeTab === "suppressions" && (
          <div className="figma-card">
            <div className="card-header">
              <div>
                <h2>Lista de Supressão & Bloqueios</h2>
                <p>Números com opt-out ou bloqueados para garantir conformidade e zero spam</p>
              </div>
              <button className="btn-primary" onClick={() => setShowAddSuppressionModal(true)}>
                <Plus size={14} />
                <span>Bloquear Número</span>
              </button>
            </div>

            <table className="figma-table">
              <thead>
                <tr>
                  <th>Telefone</th>
                  <th>Motivo</th>
                  <th>Data de Inclusão</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {suppressions.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                      Nenhum telefone na lista de bloqueio.
                    </td>
                  </tr>
                ) : (
                  suppressions.map(s => (
                    <tr key={s.phone}>
                      <td style={{ fontWeight: 600, color: "var(--text-pure)" }}>{s.phone}</td>
                      <td><span className="f-badge red">{s.reason}</span></td>
                      <td style={{ color: "var(--text-muted)" }}>{new Date(s.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn-secondary"
                          style={{ padding: "4px 8px", fontSize: 11, color: "var(--accent-mint)" }}
                          onClick={() => unblockPhone(s.phone)}
                        >
                          Desbloquear
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

      {/* WhatsApp Chat Slide-Over Drawer (Matching Figma Dark Theme) */}
      {selectedLeadId && (
        <div className="modal-backdrop" onClick={() => setSelectedLeadId(null)}>
          <div className="chat-drawer" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--border-card)", paddingBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-pure)", margin: 0 }}>
                  {activeLead?.company || activeLead?.name || "Conversa"}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{activeLead?.phone}</span>
                  <span className={`f-badge ${statusBadgeVariant[activeLead?.status || "NEW"]}`}>
                    {statusText[activeLead?.status || "NEW"]}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                  value={activeLead?.status}
                  onChange={e => updateStatus(e.target.value)}
                  disabled={updatingStatus}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-card)",
                    color: "var(--text-primary)",
                    borderRadius: 10,
                    padding: "6px 10px",
                    fontSize: 12,
                    outline: "none"
                  }}
                >
                  {Object.entries(statusText).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => setSelectedLeadId(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Messages Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 4px", display: "flex", flexDirection: "column", gap: 12, minHeight: 250, maxHeight: 380 }}>
              {loadingChat ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
                  Carregando mensagens...
                </div>
              ) : activeLead?.messages?.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 13 }}>
                  <p style={{ margin: "0 0 10px", color: "var(--text-pure)", fontWeight: 600 }}>Nenhuma mensagem trocada ainda.</p>
                  <p style={{ fontSize: 12, margin: 0 }}>Clique no botão abaixo para a IA gerar uma abordagem personalizada para este nicho!</p>
                </div>
              ) : (
                activeLead?.messages?.map(msg => (
                  <div
                    key={msg.id}
                    className={msg.direction === "OUTBOUND" ? "chat-bubble-out" : "chat-bubble-in"}
                  >
                    <div>{msg.body}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, textAlign: "right" }}>
                      {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {msg.direction === "OUTBOUND" && ` · ${msg.status}`}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* AI Generator CTA Banner */}
            <div style={{
              background: "rgba(124, 231, 215, 0.08)",
              border: "1px solid rgba(124, 231, 215, 0.2)",
              borderRadius: 12,
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#B6F0E7" }}>
                <Bot size={16} style={{ color: "var(--accent-mint)" }} />
                <span>IA Persuasiva (Chris Voss / Bypass de Secretária)</span>
              </div>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: "4px 10px", fontSize: 11 }}
                onClick={requestAiDraft}
                disabled={generatingDraft}
              >
                {generatingDraft ? "Gerando..." : "Gerar Pitch IA"}
              </button>
            </div>

            {/* Message Composer Form */}
            <form onSubmit={handleSendMessage} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                value={composerText}
                onChange={e => setComposerText(e.target.value)}
                placeholder="Digite a mensagem do WhatsApp ou gere pela IA acima..."
                rows={3}
                style={{
                  flex: 1,
                  background: "var(--bg-inner)",
                  border: "1px solid var(--border-card)",
                  borderRadius: 12,
                  padding: "10px 14px",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  resize: "none",
                  outline: "none"
                }}
              />
              <button
                type="submit"
                className="btn-primary"
                style={{ height: 42, padding: "0 18px" }}
                disabled={sendingMsg || !composerText.trim()}
              >
                <Send size={15} />
                <span>{sendingMsg ? "Enviando..." : "Enviar"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Lead */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal-window" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-pure)", margin: 0 }}>Cadastrar Novo Lead</h3>
              <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setShowAddModal(false)}>
                <X size={15} />
              </button>
            </div>

            <form onSubmit={addLead}>
              <label className="label">Nome do Contato ou Decisor</label>
              <input
                className="input"
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Dra. Camila Nogueira"
              />

              <label className="label">Nome da Empresa / Clínica</label>
              <input
                className="input"
                value={form.company}
                onChange={e => setForm({ ...form, company: e.target.value })}
                placeholder="Ex.: Instituto Nogueira de Estética"
              />

              <label className="label">WhatsApp (com DDD)</label>
              <input
                className="input"
                required
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="Ex.: 5511999999999"
              />

              <label className="label">Segmento / Nicho</label>
              <input
                className="input"
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                placeholder="Ex.: Clínica de Estética, Odontologia, Energia Solar..."
              />

              <label className="label">Site Atual (se houver)</label>
              <input
                className="input"
                value={form.website}
                onChange={e => setForm({ ...form, website: e.target.value })}
                placeholder="Ex.: https://institutonogueira.com.br"
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
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
        <div className="modal-backdrop" onClick={() => setShowAddSuppressionModal(false)}>
          <div className="modal-window" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-pure)", margin: 0 }}>Bloquear Telefone (Supressão)</h3>
              <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setShowAddSuppressionModal(false)}>
                <X size={15} />
              </button>
            </div>

            <form onSubmit={addSuppression}>
              <label className="label">WhatsApp para Bloqueio</label>
              <input
                className="input"
                required
                value={suppressionForm.phone}
                onChange={e => setSuppressionForm({ ...suppressionForm, phone: e.target.value })}
                placeholder="Ex.: 5511999999999"
              />

              <label className="label">Motivo</label>
              <input
                className="input"
                required
                value={suppressionForm.reason}
                onChange={e => setSuppressionForm({ ...suppressionForm, reason: e.target.value })}
                placeholder="Ex.: Pedido de opt-out, número incorreto..."
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
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
