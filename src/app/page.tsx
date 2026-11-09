"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bot,
  Calendar,
  Check,
  ChevronDown,
  ExternalLink,
  Heart,
  HelpCircle,
  Home as HomeIcon,
  LayoutGrid,
  LineChart,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
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

const statusConfig: Record<string, { label: string; badgeClass: string }> = {
  NEW: { label: "Novo Lead", badgeClass: "gray" },
  READY: { label: "Pronto p/ Envio", badgeClass: "purple" },
  SENT: { label: "Disparado", badgeClass: "dark" },
  REPLIED: { label: "Respondeu", badgeClass: "pink" },
  QUALIFIED: { label: "Qualificado", badgeClass: "pink" },
  MEETING: { label: "Reunião Marcada", badgeClass: "pink" },
  WON: { label: "Cliente Fechado", badgeClass: "green" },
  LOST: { label: "Encerrado", badgeClass: "gray" },
  OPTED_OUT: { label: "Opt-out", badgeClass: "dark" },
  BLOCKED: { label: "Bloqueado", badgeClass: "dark" },
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

  // Chat slide-over drawer
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
    } catch {}
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
          notify("Abordagem persuasiva gerada pela IA!");
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
      notify(`Número ${phone} desbloqueado.`);
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
      notify("Lead cadastrado com sucesso!");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setLoading(false);
    }
  }

  // Estatísticas Reais
  const totalLeads = leads.length;
  const readyCount = leads.filter(l => l.status === "READY" || l.status === "NEW").length;
  const sentCount = leads.filter(l => l.initialSentAt || l.status === "SENT").length;
  const repliedCount = leads.filter(l => ["REPLIED", "QUALIFIED", "MEETING", "WON"].includes(l.status)).length;
  const wonCount = leads.filter(l => l.status === "WON").length;

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
      if (stageFilter === "WON") return l.status === "WON";
      return true;
    });
  }, [leads, query, stageFilter]);

  return (
    <div className="magnific-shell">
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          background: "var(--color-pink)",
          color: "#FFFFFF",
          padding: "12px 20px",
          borderRadius: 999,
          fontWeight: 700,
          fontSize: 13,
          boxShadow: "0 10px 30px rgba(225, 29, 136, 0.4)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 10
        }}>
          <Sparkles size={16} />
          {toast}
        </div>
      )}

      {/* Sidebar (Deep Indigo/Purple #221644 Matching Reference) */}
      <aside className="magnific-sidebar">
        {/* Profile Section */}
        <div className="sidebar-profile">
          <div className="sidebar-avatar-circle">
            <div className="avatar-silhouette">IN</div>
          </div>
          <div className="sidebar-user-name">Innovary Midia</div>
          <div className="sidebar-user-badge">Prospecção WhatsApp</div>
        </div>

        {/* Navigation Items */}
        <nav className="sidebar-nav-list">
          <button
            className={`sidebar-nav-btn ${activeTab === "leads" && stageFilter === "ALL" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("leads");
              setStageFilter("ALL");
            }}
          >
            <HomeIcon size={18} />
            <span>Dashboard</span>
          </button>

          <a className="sidebar-nav-btn" href="/campaigns">
            <LayoutGrid size={18} />
            <span>Apps / Campanhas</span>
          </a>

          <button
            className={`sidebar-nav-btn ${stageFilter === "READY" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("leads");
              setStageFilter("READY");
            }}
          >
            <LineChart size={18} />
            <span>Chart / Funil</span>
          </button>

          {/* Active Highlighted Chat Button in Hot Pink */}
          <button
            className={`sidebar-nav-btn ${selectedLeadId !== null || stageFilter === "REPLIED" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("leads");
              setStageFilter("REPLIED");
            }}
          >
            <MessageSquare size={18} />
            <span>Chat WhatsApp</span>
            <div className="sidebar-nav-dot" />
          </button>

          <button
            className={`sidebar-nav-btn ${activeTab === "suppressions" ? "active" : ""}`}
            onClick={() => setActiveTab("suppressions")}
          >
            <Settings size={18} />
            <span>Setting / Supressão</span>
          </button>

          <div className="sidebar-nav-btn" style={{ cursor: "default", opacity: 0.7 }}>
            <HelpCircle size={18} />
            <span>Help / Suporte</span>
          </div>
        </nav>

        {/* Bottom Actions */}
        <div className="sidebar-bottom-actions">
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              location.assign("/login");
            }}
            className="sidebar-nav-btn"
            style={{ padding: "0", color: "#F472B6", height: "36px" }}
          >
            <LogOut size={16} />
            <span>Sair do Painel</span>
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="magnific-main">
        {/* Top Bar with Magnific Style Search & Icons */}
        <header className="magnific-topbar">
          <div className="magnific-search-input">
            <Search size={18} style={{ color: "var(--color-pink)" }} />
            <input
              placeholder="Search Here..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div className="topbar-right-icons">
            <button className="btn-magnific-pink" onClick={() => setShowAddModal(true)}>
              <Plus size={16} />
              <span>Novo Lead</span>
            </button>

            <button className="topbar-icon-btn" title="Favoritos">
              <Heart size={18} />
            </button>

            <button className="topbar-icon-btn" title="Notificações">
              <Bell size={18} />
              <div className="topbar-badge-dot" />
            </button>

            <button className="topbar-icon-btn" onClick={() => loadLeads()} title="Recarregar">
              <RefreshCw size={17} />
            </button>

            <button className="topbar-icon-btn" title="Menu Principal">
              <Menu size={18} />
            </button>
          </div>
        </header>

        {activeTab === "leads" && (
          <>
            {/* Top Row: 3 Donut Gauge Cards Matching Image 1 */}
            <section className="donut-grid">
              {/* Card 1: FOLLOWS (25% Donut in Hot Pink) */}
              <div className="magnific-card">
                <div className="donut-card-inner">
                  {/* SVG Donut 25% */}
                  <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
                    <svg width="90" height="90" viewBox="0 0 90 90">
                      <circle cx="45" cy="45" r="36" fill="none" stroke="#F1DAEE" strokeWidth="9" />
                      <circle
                        cx="45"
                        cy="45"
                        r="36"
                        fill="none"
                        stroke="#E11D88"
                        strokeWidth="9"
                        strokeDasharray="226"
                        strokeDashoffset="170"
                        strokeLinecap="round"
                        transform="rotate(-90 45 45)"
                      />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 16, fontWeight: 800, color: "var(--text-main)" }}>
                      25%
                    </div>
                  </div>

                  <div className="donut-metric-info">
                    <span className="donut-metric-tag pink">
                      <Users size={14} /> FOLLOWS
                    </span>
                    <p className="donut-metric-sub">
                      Total de {totalLeads} leads mapeados e prontos para abordagem comercial.
                    </p>
                  </div>
                </div>

                <div className="donut-slider-track">
                  <div className="donut-slider-fill pink" style={{ width: "30%" }}>
                    <div className="donut-slider-knob pink" />
                  </div>
                </div>
                <span className="donut-bottom-label">30% THIS MONTH</span>
              </div>

              {/* Card 2: SCOPE (75% Donut in Deep Indigo) */}
              <div className="magnific-card">
                <div className="donut-card-inner">
                  {/* SVG Donut 75% */}
                  <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
                    <svg width="90" height="90" viewBox="0 0 90 90">
                      <circle cx="45" cy="45" r="36" fill="none" stroke="#F1DAEE" strokeWidth="9" />
                      <circle
                        cx="45"
                        cy="45"
                        r="36"
                        fill="none"
                        stroke="#221644"
                        strokeWidth="9"
                        strokeDasharray="226"
                        strokeDashoffset="56"
                        strokeLinecap="round"
                        transform="rotate(-90 45 45)"
                      />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 16, fontWeight: 800, color: "var(--text-main)" }}>
                      75%
                    </div>
                  </div>

                  <div className="donut-metric-info">
                    <span className="donut-metric-tag indigo">
                      <Target size={14} /> SCOPE
                    </span>
                    <p className="donut-metric-sub">
                      {sentCount} abordagens de 1º contato disparadas pelo WhatsApp.
                    </p>
                  </div>
                </div>

                <div className="donut-slider-track">
                  <div className="donut-slider-fill indigo" style={{ width: "50%" }}>
                    <div className="donut-slider-knob indigo" />
                  </div>
                </div>
                <span className="donut-bottom-label">50% THIS MONTH</span>
              </div>

              {/* Card 3: VIEWS (50% Donut in Vivid Violet) */}
              <div className="magnific-card">
                <div className="donut-card-inner">
                  {/* SVG Donut 50% */}
                  <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
                    <svg width="90" height="90" viewBox="0 0 90 90">
                      <circle cx="45" cy="45" r="36" fill="none" stroke="#F1DAEE" strokeWidth="9" />
                      <circle
                        cx="45"
                        cy="45"
                        r="36"
                        fill="none"
                        stroke="#8B24B2"
                        strokeWidth="9"
                        strokeDasharray="226"
                        strokeDashoffset="113"
                        strokeLinecap="round"
                        transform="rotate(-90 45 45)"
                      />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 16, fontWeight: 800, color: "var(--text-main)" }}>
                      50%
                    </div>
                  </div>

                  <div className="donut-metric-info">
                    <span className="donut-metric-tag purple">
                      <MessageCircle size={14} /> VIEWS
                    </span>
                    <p className="donut-metric-sub">
                      {repliedCount} conversas respondidas e clientes em negociação ativa.
                    </p>
                  </div>
                </div>

                <div className="donut-slider-track">
                  <div className="donut-slider-fill purple" style={{ width: "60%" }}>
                    <div className="donut-slider-knob purple" />
                  </div>
                </div>
                <span className="donut-bottom-label">60% THIS MONTH</span>
              </div>
            </section>

            {/* Middle Row: CRM Table (Views) + Subscriptions Bar Chart */}
            <section className="mid-row-grid">
              {/* Left Card: CRM Pipeline Table */}
              <div className="magnific-card" style={{ padding: "20px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 2px", color: "var(--text-main)", letterSpacing: 0.5 }}>
                      VIEWS / PIPELINE DE LEADS
                    </h3>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                      Gerencie contatos e inicie abordagens com inteligência de conversão
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    {["ALL", "READY", "SENT", "REPLIED", "WON"].map(st => (
                      <button
                        key={st}
                        onClick={() => setStageFilter(st)}
                        style={{
                          background: stageFilter === st ? "var(--color-pink)" : "#FFFFFF",
                          color: stageFilter === st ? "#FFFFFF" : "var(--text-muted)",
                          border: "1px solid #F1DAEE",
                          borderRadius: 8,
                          padding: "4px 8px",
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: "pointer"
                        }}
                      >
                        {st === "ALL" ? "Todos" : st === "READY" ? "Prontos" : st === "SENT" ? "Enviados" : st === "REPLIED" ? "Conversa" : "Fechados"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3 Dashed Stat Boxes Matching Image 1 (21% FOLLOWS, 75% SCOPE, 50% VIEWS) */}
                <div className="dashed-stat-grid">
                  <div
                    className="dashed-stat-box"
                    onClick={() => setStageFilter("READY")}
                    title="Filtrar leads prontos"
                  >
                    <div className="dashed-stat-val">21%</div>
                    <div className="dashed-stat-title">FOLLOWS</div>
                    <div className="dashed-stat-sub">{readyCount} leads prontos para abordagem</div>
                  </div>

                  <div
                    className="dashed-stat-box indigo"
                    onClick={() => setStageFilter("SENT")}
                    title="Filtrar abordagens enviadas"
                  >
                    <div className="dashed-stat-val">75%</div>
                    <div className="dashed-stat-title">SCOPE</div>
                    <div className="dashed-stat-sub">{sentCount} abordagens de 1º contato ativas</div>
                  </div>

                  <div
                    className="dashed-stat-box purple"
                    onClick={() => setStageFilter("REPLIED")}
                    title="Filtrar respostas e negociações"
                  >
                    <div className="dashed-stat-val">50%</div>
                    <div className="dashed-stat-title">VIEWS</div>
                    <div className="dashed-stat-sub">{repliedCount} respostas em negociação</div>
                  </div>
                </div>

                <div style={{ overflowX: "auto", background: "#FFFFFF", borderRadius: 14, border: "1px solid var(--card-border)" }}>
                  <table className="magnific-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Empresa / Contato</th>
                        <th>WhatsApp</th>
                        <th>Etapa</th>
                        <th style={{ textAlign: "right" }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", padding: "36px 20px", color: "var(--text-muted)" }}>
                            Nenhum lead encontrado neste filtro. Crie uma busca em Campanhas ou cadastre um lead!
                          </td>
                        </tr>
                      ) : (
                        filtered.slice(0, 5).map((l, idx) => {
                          const conf = statusConfig[l.status] || { label: l.status, badgeClass: "gray" };

                          return (
                            <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => openConversation(l.id)}>
                              <td style={{ fontWeight: 700, color: "var(--color-pink)" }}>
                                {String(idx + 1).padStart(2, "0")}
                              </td>
                              <td>
                                <div style={{ fontWeight: 700, color: "var(--text-main)" }}>
                                  {l.company || l.name}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                  {l.website ? l.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 22) : l.category || "Serviços"}
                                </div>
                              </td>
                              <td>
                                <span style={{ fontWeight: 600, color: "var(--text-main)" }}>{l.phone}</span>
                              </td>
                              <td>
                                <span className={`pill-badge ${conf.badgeClass}`}>
                                  {conf.label}
                                </span>
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <button
                                  className="btn-magnific-pink"
                                  style={{ height: 30, padding: "0 10px", fontSize: 11 }}
                                  onClick={e => {
                                    e.stopPropagation();
                                    openConversation(l.id);
                                  }}
                                >
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

              {/* Right Card: SUBSCRIPTIONS (Bar Chart Matching Image 1) */}
              <div className="magnific-card bar-chart-card">
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px", color: "var(--text-main)", letterSpacing: 0.5 }}>
                    SUBSCRIPTIONS
                  </h3>

                  {/* Vertical Capsule Pill Bars (Hot Pink, Purple, Deep Indigo) */}
                  <div style={{ height: 130, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 6, padding: "0 4px" }}>
                    {[
                      { day: "SUN", bars: [{ h: 60, c: "pink" }, { h: 30, c: "purple" }] },
                      { day: "MON", bars: [{ h: 40, c: "dark" }, { h: 80, c: "pink" }] },
                      { day: "TUE", bars: [{ h: 90, c: "purple" }, { h: 50, c: "dark" }] },
                      { day: "WEN", bars: [{ h: 45, c: "pink" }, { h: 70, c: "purple" }] },
                      { day: "THU", bars: [{ h: 95, c: "purple" }, { h: 35, c: "dark" }] },
                      { day: "FRI", bars: [{ h: 80, c: "pink" }, { h: 55, c: "purple" }] },
                      { day: "SAT", bars: [{ h: 30, c: "dark" }, { h: 65, c: "pink" }] },
                    ].map(col => (
                      <div key={col.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
                        <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 100 }}>
                          {col.bars.map((b, i) => (
                            <div
                              key={i}
                              style={{
                                width: 9,
                                height: `${b.h}%`,
                                borderRadius: 999,
                                background: b.c === "pink" ? "var(--color-pink)" : b.c === "purple" ? "var(--color-purple)" : "var(--color-indigo)"
                              }}
                            />
                          ))}
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)" }}>{col.day}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bar-chart-legend" style={{ marginTop: 14 }}>
                  <div className="bar-legend-row">
                    <i className="bar-legend-dot pink" />
                    <span>Disparos de 1ª Abordagem pelo WhatsApp</span>
                  </div>
                  <div className="bar-legend-row">
                    <i className="bar-legend-dot purple" />
                    <span>Respostas e Interações com a IA</span>
                  </div>
                  <div className="bar-legend-row">
                    <i className="bar-legend-dot dark" />
                    <span>Reuniões Agendadas / Fechamentos</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Bottom Row: EARNING Wave Area Chart + Mini Calendar (Matching Image 1) */}
            <section className="magnific-card">
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px", color: "var(--text-main)", letterSpacing: 0.5 }}>
                EARNING / METAS DE VENDAS (R$ 12.000)
              </h3>

              <div className="bottom-earning-grid">
                {/* Wave Area Chart with Milestone Pins */}
                <div style={{ position: "relative", width: "100%", height: 135 }}>
                  <svg viewBox="0 0 540 130" style={{ width: "100%", height: "100%", overflow: "visible" }}>
                    <defs>
                      <linearGradient id="wavePinkPurple" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E11D88" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#FAF1F9" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="waveBackPurple" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B24B2" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="#FAF1F9" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Back Mountain (Purple) */}
                    <path
                      d="M 100 110 Q 180 20, 260 110"
                      fill="url(#waveBackPurple)"
                    />
                    <path
                      d="M 100 110 Q 180 20, 260 110"
                      fill="none"
                      stroke="#8B24B2"
                      strokeWidth="2.5"
                    />

                    {/* Front Waves (Hot Pink) */}
                    <path
                      d="M 10 110 Q 70 50, 130 110 Q 230 10, 330 110 Q 390 40, 450 110 Q 490 60, 530 110 L 530 110 L 10 110 Z"
                      fill="url(#wavePinkPurple)"
                    />
                    <path
                      d="M 10 110 Q 70 50, 130 110 Q 230 10, 330 110 Q 390 40, 450 110 Q 490 60, 530 110"
                      fill="none"
                      stroke="#E11D88"
                      strokeWidth="3"
                    />

                    {/* Baseline axis */}
                    <line x1="10" y1="110" x2="530" y2="110" stroke="#E6D3E4" strokeWidth="2" />
                    {[10, 95, 180, 265, 350, 435, 520].map((x, i) => (
                      <circle key={i} cx={x} cy="110" r="3.5" fill="#221644" />
                    ))}
                  </svg>

                  {/* Milestone Pins Matching Image 1 (300, 600, 350, 400) */}
                  <div style={{ position: "absolute", left: "12%", top: 38, background: "#8B24B2", color: "#FFF", borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 800 }}>
                    R$ 3.6k
                  </div>
                  <div style={{ position: "absolute", left: "32%", top: 4, background: "#E11D88", color: "#FFF", borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 800 }}>
                    R$ 7.2k
                  </div>
                  <div style={{ position: "absolute", left: "68%", top: 30, background: "#8B24B2", color: "#FFF", borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 800 }}>
                    R$ 9.6k
                  </div>
                  <div style={{ position: "absolute", left: "85%", top: 46, background: "#E11D88", color: "#FFF", borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 800 }}>
                    R$ 12k
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", marginTop: 4, padding: "0 10px" }}>
                    <span>SUN</span><span>MON</span><span>TUE</span><span>WEN</span><span>THU</span><span>FRI</span><span>SAT</span>
                  </div>
                </div>

                {/* Mini Calendar Widget Matching Image 1 */}
                <div className="mini-calendar">
                  <div className="mini-calendar-header">
                    <span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span>
                  </div>
                  <div className="calendar-days-grid">
                    <span></span><span></span><span></span><span></span><span>1</span><span>2</span><span className="calendar-day-cell highlight">3</span>
                    <span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span>
                    <span>11</span><span>12</span><span>13</span><span className="calendar-day-cell active-pink">14</span><span>15</span><span>16</span><span>17</span>
                    <span>18</span><span>19</span><span>20</span><span>21</span><span>22</span><span>23</span><span>24</span>
                    <span className="calendar-day-cell highlight">25</span><span>26</span><span>27</span><span>28</span><span>29</span><span>30</span><span>31</span>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* Tab Supressões */}
        {activeTab === "suppressions" && (
          <div className="magnific-card" style={{ background: "#FFFFFF" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px", color: "var(--text-main)" }}>
                  LISTA DE SUPRESSÃO & BLOQUEIOS
                </h2>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                  Números protegidos contra envios futuros após solicitação de opt-out.
                </p>
              </div>
              <button className="btn-magnific-pink" onClick={() => setShowAddSuppressionModal(true)}>
                <Plus size={14} /> Adicionar Bloqueio
              </button>
            </div>

            <table className="magnific-table">
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
                    <td colSpan={4} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                      Nenhum telefone na lista de supressão.
                    </td>
                  </tr>
                ) : (
                  suppressions.map(s => (
                    <tr key={s.phone}>
                      <td style={{ fontWeight: 700 }}>{s.phone}</td>
                      <td><span className="pill-badge dark">{s.reason}</span></td>
                      <td style={{ color: "var(--text-muted)" }}>{new Date(s.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn-magnific-ghost"
                          style={{ height: 28, padding: "0 10px", fontSize: 11 }}
                          onClick={() => unblockPhone(s.phone)}
                        >
                          Liberar
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

      {/* Slide-over WhatsApp Drawer in Magnific Theme */}
      {selectedLeadId && (
        <div className="magnific-drawer-backdrop" onClick={() => setSelectedLeadId(null)}>
          <div className="magnific-drawer" onClick={e => e.stopPropagation()}>
            {/* Drawer Header */}
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--card-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
                    {activeLead?.company || activeLead?.name}
                  </h3>
                  <a
                    href={`https://wa.me/${activeLead?.phone?.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--color-pink)", display: "inline-flex", alignItems: "center" }}
                    title="Abrir no WhatsApp Oficial"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {activeLead?.phone} · {activeLead?.category || "Serviços"}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                  value={activeLead?.status}
                  onChange={e => updateStatus(e.target.value)}
                  disabled={updatingStatus}
                  style={{
                    background: "var(--card-bg)",
                    border: "1px solid var(--card-border)",
                    color: "var(--text-main)",
                    borderRadius: 8,
                    padding: "5px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    outline: "none"
                  }}
                >
                  {Object.entries(statusConfig).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>

                <button
                  onClick={() => setSelectedLeadId(null)}
                  style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--card-bg)", border: "1px solid var(--card-border)", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--text-main)" }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Chat Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "18px 24px", display: "flex", flexDirection: "column", gap: 12, background: "#FFF" }}>
              {loadingChat ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
                  Carregando conversa...
                </div>
              ) : activeLead?.messages?.length === 0 ? (
                <div style={{
                  padding: 24,
                  background: "var(--card-bg)",
                  borderRadius: 16,
                  border: "1px dashed var(--card-border)",
                  textAlign: "center"
                }}>
                  <div style={{ fontWeight: 800, color: "var(--text-main)", fontSize: 14, marginBottom: 4 }}>
                    Nenhuma mensagem enviada ainda
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 16px" }}>
                    Gere uma abordagem personalizada com a IA para captar o decisor ou passar pela secretária.
                  </p>
                  <button className="btn-magnific-pink" onClick={requestAiDraft} disabled={generatingDraft}>
                    <Sparkles size={14} />
                    <span>{generatingDraft ? "Gerando..." : "Gerar abordagem com IA"}</span>
                  </button>
                </div>
              ) : (
                activeLead?.messages?.map(msg => (
                  <div
                    key={msg.id}
                    className={msg.direction === "OUTBOUND" ? "chat-bubble-outbound" : "chat-bubble-inbound"}
                  >
                    <div>{msg.body}</div>
                    <div style={{ fontSize: 10, color: msg.direction === "OUTBOUND" ? "rgba(255,255,255,0.7)" : "var(--text-muted)", marginTop: 4, textAlign: "right" }}>
                      {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {msg.direction === "OUTBOUND" && ` · ${msg.status}`}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Composer Footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--card-border)", background: "var(--card-bg)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--color-pink)" }}>
                  <Bot size={15} />
                  <span>IA Persuasiva (Bypass Secretária & Chris Voss)</span>
                </div>
                <button
                  type="button"
                  className="btn-magnific-ghost"
                  style={{ height: 28, padding: "0 10px", fontSize: 11 }}
                  onClick={requestAiDraft}
                  disabled={generatingDraft}
                >
                  <Sparkles size={12} style={{ color: "var(--color-pink)" }} />
                  {generatingDraft ? "Gerando..." : "Sugerir Pitch"}
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
                  placeholder="Digite a mensagem do WhatsApp (Ctrl+Enter para enviar)..."
                  rows={3}
                  style={{
                    flex: 1,
                    background: "#FFFFFF",
                    border: "1px solid var(--card-border)",
                    borderRadius: 12,
                    padding: "10px 14px",
                    color: "var(--text-main)",
                    fontSize: 13,
                    resize: "none",
                    outline: "none"
                  }}
                />
                <button
                  type="submit"
                  className="btn-magnific-pink"
                  style={{ height: 42, padding: "0 18px" }}
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(34, 22, 68, 0.45)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", zIndex: 110, padding: 20 }} onClick={() => setShowAddModal(false)}>
          <div style={{ width: "min(480px, 100%)", background: "#FFFFFF", border: "1px solid var(--card-border)", borderRadius: 20, padding: 28, boxShadow: "0 25px 60px rgba(34, 22, 68, 0.2)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--text-main)", margin: 0 }}>Cadastrar Novo Lead</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={addLead}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Nome do Contato ou Decisor</label>
              <input
                style={{ width: "100%", background: "#FAF1F9", border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 14px", color: "var(--text-main)", fontSize: 13, marginBottom: 14, outline: "none" }}
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Dra. Camila Nogueira"
              />

              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Nome da Empresa / Clínica</label>
              <input
                style={{ width: "100%", background: "#FAF1F9", border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 14px", color: "var(--text-main)", fontSize: 13, marginBottom: 14, outline: "none" }}
                value={form.company}
                onChange={e => setForm({ ...form, company: e.target.value })}
                placeholder="Ex.: Instituto Nogueira de Estética"
              />

              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>WhatsApp (com DDD)</label>
              <input
                style={{ width: "100%", background: "#FAF1F9", border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 14px", color: "var(--text-main)", fontSize: 13, marginBottom: 14, outline: "none" }}
                required
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="Ex.: 5511999999999"
              />

              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Segmento / Nicho</label>
              <input
                style={{ width: "100%", background: "#FAF1F9", border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 14px", color: "var(--text-main)", fontSize: 13, marginBottom: 14, outline: "none" }}
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                placeholder="Ex.: Odontologia, Energia Solar, Advocacia..."
              />

              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Site Atual (se houver)</label>
              <input
                style={{ width: "100%", background: "#FAF1F9", border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 14px", color: "var(--text-main)", fontSize: 13, marginBottom: 14, outline: "none" }}
                value={form.website}
                onChange={e => setForm({ ...form, website: e.target.value })}
                placeholder="Ex.: https://institutonogueira.com.br"
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button type="button" className="btn-magnific-ghost" onClick={() => setShowAddModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-magnific-pink" disabled={loading}>
                  {loading ? "Salvando..." : "Salvar Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Suppression */}
      {showAddSuppressionModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(34, 22, 68, 0.45)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", zIndex: 110, padding: 20 }} onClick={() => setShowAddSuppressionModal(false)}>
          <div style={{ width: "min(460px, 100%)", background: "#FFFFFF", border: "1px solid var(--card-border)", borderRadius: 20, padding: 28, boxShadow: "0 25px 60px rgba(34, 22, 68, 0.2)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--text-main)", margin: 0 }}>Bloquear Número (Supressão)</h3>
              <button onClick={() => setShowAddSuppressionModal(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={addSuppression}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>WhatsApp para Bloqueio</label>
              <input
                style={{ width: "100%", background: "#FAF1F9", border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 14px", color: "var(--text-main)", fontSize: 13, marginBottom: 14, outline: "none" }}
                required
                value={suppressionForm.phone}
                onChange={e => setSuppressionForm({ ...suppressionForm, phone: e.target.value })}
                placeholder="Ex.: 5511999999999"
              />

              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Motivo</label>
              <input
                style={{ width: "100%", background: "#FAF1F9", border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 14px", color: "var(--text-main)", fontSize: 13, marginBottom: 14, outline: "none" }}
                required
                value={suppressionForm.reason}
                onChange={e => setSuppressionForm({ ...suppressionForm, reason: e.target.value })}
                placeholder="Ex.: Pedido de opt-out, número incorreto..."
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button type="button" className="btn-magnific-ghost" onClick={() => setShowAddSuppressionModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-magnific-pink" disabled={loading}>
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
