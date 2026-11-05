"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  ChevronDown,
  CircleHelp,
  Command,
  ExternalLink,
  LayoutDashboard,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
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
  READY: "Pronto para contato",
  SENT: "Mensagem enviada",
  REPLIED: "Respondeu",
  QUALIFIED: "Qualificado",
  MEETING: "Reunião marcada",
  WON: "Convertido",
  LOST: "Encerrado",
  OPTED_OUT: "Opt-out",
  BLOCKED: "Bloqueado",
  NEW: "Novo",
};

const statusBadgeClass: Record<string, string> = {
  READY: "blue",
  SENT: "orange",
  REPLIED: "green",
  QUALIFIED: "teal",
  MEETING: "purple",
  WON: "green",
  LOST: "gray",
  OPTED_OUT: "red",
  BLOCKED: "red",
  NEW: "",
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<"leads" | "suppressions">("leads");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [query, setQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddSuppressionModal, setShowAddSuppressionModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", company: "", website: "", source: "Cadastro manual", notes: "" });
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
    setTimeout(() => setToast(""), 4000);
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
      // Ignora falha de rede temporária
    }
  }

  async function loadSuppressions() {
    try {
      const r = await fetch("/api/suppressions");
      if (r.ok) {
        const rows: Suppression[] = await r.json();
        setSuppressions(rows);
      }
    } catch {
      // Ignora falha de rede temporária
    }
  }

  async function loadStatus() {
    try {
      const r = await fetch("/api/system/status");
      if (r.ok) {
        const data: SystemStatus = await r.json();
        setSystemStatus(data);
      }
    } catch {
      // Ignora falha silenciosamente
    }
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
          notify("Sugestão de abordagem gerada!");
          return;
        }
      }
      // Fallback local se a API não retornar
      applyApproachTemplate();
    } catch {
      applyApproachTemplate();
    } finally {
      setGeneratingDraft(false);
    }
  }

  function applyApproachTemplate() {
    if (!activeLead) return;
    const firstName = activeLead.name.trim().split(" ")[0] || "olá";
    const companyName = activeLead.company?.trim() || "sua empresa";
    const offer = systemStatus?.businessOffer || "nossos serviços";
    const company = systemStatus?.businessName || "nossa equipe";
    const template = `Olá, ${firstName}! Tudo bem?\nVi a presença da ${companyName} no Google e achei muito interessante o trabalho de vocês. Sou da ${company} e ajudamos negócios como o seu com ${offer}.\n\nVocê teria 5 minutinhos nesta semana para trocarmos uma ideia rápida?`;
    setComposerText(template);
    notify("Modelo padrão carregado no campo de mensagem");
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!activeLead || !composerText.trim()) return;

    if (!systemStatus?.automationEnabled) {
      notify("Aviso: A automação está pausada nas variáveis do servidor (AUTOMATION_ENABLED=false).");
    }

    setSendingMsg(true);
    try {
      const res = await fetch(`/api/leads/${activeLead.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: composerText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enfileirar mensagem");

      notify(activeLead.initialSentAt ? "Resposta enfileirada para envio!" : "1ª abordagem enviada para a fila de disparo!");
      setComposerText("");
      // Recarrega conversa
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
      setForm({ name: "", phone: "", company: "", website: "", source: "Cadastro manual", notes: "" });
      notify("Lead adicionado com sucesso");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setLoading(false);
    }
  }

  const todayLabel = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Command size={18} />
          </div>
          <span>prospecta</span>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <button
          className={`nav-item ${activeTab === "leads" ? "active" : ""}`}
          style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          onClick={() => setActiveTab("leads")}
        >
          <LayoutDashboard size={16} />
          <span>Visão geral & Leads</span>
        </button>
        <a className="nav-item" href="/campaigns">
          <Send size={16} />
          <span>Campanhas de busca</span>
        </a>
        <button
          className={`nav-item ${activeTab === "suppressions" ? "active" : ""}`}
          style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          onClick={() => setActiveTab("suppressions")}
        >
          <ShieldAlert size={16} />
          <span>Supressão ({suppressions.length})</span>
        </button>

        <div className="nav-label" style={{ marginTop: 16 }}>SISTEMA</div>
        <div className="nav-item" style={{ cursor: "default" }}>
          <Settings2 size={16} />
          <span>Configurações</span>
        </div>

        <div className="nav-bottom">
          <div className="nav-item" style={{ cursor: "default" }}>
            <CircleHelp size={16} />
            <span>Documentação</span>
          </div>
          <div className="nav-item">
            <div className="avatar" style={{ width: 29, height: 29, fontSize: 11 }}>
              AD
            </div>
            <span>{systemStatus?.businessName || "Administração"}</span>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow" style={{ textTransform: "capitalize" }}>{todayLabel}</div>
            <h1 className="title">Central de Prospecção</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className={`status ${systemStatus?.automationEnabled ? "on" : "off"}`}>
              <i className="dot" />
              Automação {systemStatus?.automationEnabled ? "ativa" : "pausada"}
            </div>
            <button
              className="btn"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                location.assign("/login");
              }}
            >
              Sair
            </button>
            <div className="avatar">AD</div>
          </div>
        </header>

        <div className="notice">
          <ShieldCheck size={15} style={{ verticalAlign: "-3px", marginRight: 7, color: "#318b60" }} />
          Proteção ativa: respostas por IA só são geradas para leads registrados com primeira abordagem confirmada. Contatos com pedido de opt-out são suprimidos e bloqueados imediatamente.
        </div>

        {activeTab === "leads" && (
          <>
            <section className="stats">
              <div className="card">
                <div className="stat-label">Leads na base</div>
                <div className="stat-num">{leads.length.toLocaleString("pt-BR")}</div>
                <div className="stat-foot">Empresas cadastradas</div>
              </div>
              <div className="card">
                <div className="stat-label">Abordagens enviadas</div>
                <div className="stat-num">{leads.filter(x => x.initialSentAt).length}</div>
                <div className="stat-foot">
                  <ArrowUpRight size={12} style={{ verticalAlign: "-2px" }} /> Primeiro contato realizado
                </div>
              </div>
              <div className="card">
                <div className="stat-label">Respostas recebidas</div>
                <div className="stat-num">{leads.filter(x => ["REPLIED", "QUALIFIED", "MEETING", "WON"].includes(x.status)).length}</div>
                <div className="stat-foot">
                  <ArrowDownLeft size={12} style={{ verticalAlign: "-2px" }} /> Leads que responderam
                </div>
              </div>
              <div className="card">
                <div className="stat-label">Qualificados / Reuniões</div>
                <div className="stat-num">{leads.filter(x => ["QUALIFIED", "MEETING", "WON"].includes(x.status)).length}</div>
                <div className="stat-foot">Oportunidades ativas</div>
              </div>
            </section>

            <div className="toolbar" id="leads">
              <h2>
                Leads cadastrados <span className="badge" style={{ marginLeft: 7 }}>{leads.length}</span>
              </h2>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#8b968e" }} />
                  <input
                    className="search"
                    style={{ paddingLeft: 31 }}
                    placeholder="Buscar por nome, empresa ou telefone..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                </div>
                <button className="btn" onClick={() => loadLeads()} title="Atualizar lista">
                  <RefreshCw size={13} />
                </button>
                <button className="btn primary" onClick={() => setShowAddModal(true)}>
                  <Plus size={14} style={{ verticalAlign: "-3px", marginRight: 5 }} /> Adicionar lead
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>LEAD / EMPRESA</th>
                    <th>ORIGEM</th>
                    <th>STATUS</th>
                    <th>ÚLTIMA ATIVIDADE</th>
                    <th style={{ textAlign: "right" }}>AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id}>
                      <td>
                        <div className="lead-name">{l.name}</div>
                        <div className="sub">{l.company ? `${l.company} · ` : ""}+{l.phone}</div>
                      </td>
                      <td>
                        <span className="badge">{l.source || "Direto"}</span>
                      </td>
                      <td>
                        <span className={`badge ${statusBadgeClass[l.status] || ""}`}>
                          {statusText[l.status] || l.status}
                        </span>
                      </td>
                      <td>
                        <span className="sub">
                          {l.lastMessageAt
                            ? new Date(l.lastMessageAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                            : "Aguardando 1º contato"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {l.status === "READY" && !l.initialSentAt ? (
                          <button
                            className="btn primary"
                            style={{ padding: "6px 11px", fontSize: 11 }}
                            onClick={() => openConversation(l.id)}
                          >
                            <Send size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />
                            Abordar
                          </button>
                        ) : (
                          <button
                            className="btn"
                            style={{ padding: "6px 11px", fontSize: 11 }}
                            onClick={() => openConversation(l.id)}
                          >
                            <MessageCircle size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />
                            Conversa
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="empty">
                  Nenhum lead encontrado. Crie uma busca na aba <strong>Campanhas de busca</strong> ou cadastre um lead manual.
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "suppressions" && (
          <div>
            <div className="toolbar">
              <div>
                <h2 style={{ margin: 0 }}>Lista de Supressão & Bloqueios</h2>
                <div className="sub">Telefones que solicitaram opt-out ou foram bloqueados pelo operador. Nenhuma mensagem é enviada a estes números.</div>
              </div>
              <button className="btn primary" onClick={() => setShowAddSuppressionModal(true)}>
                <Plus size={14} style={{ verticalAlign: "-3px", marginRight: 5 }} /> Bloquear número
              </button>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>TELEFONE</th>
                    <th>MOTIVO DO BLOQUEIO</th>
                    <th>DATA</th>
                    <th style={{ textAlign: "right" }}>AÇÃO</th>
                  </tr>
                </thead>
                <tbody>
                  {suppressions.map(s => (
                    <tr key={s.phone}>
                      <td style={{ fontWeight: 600 }}>+{s.phone}</td>
                      <td><span className="badge red">{s.reason}</span></td>
                      <td>
                        <span className="sub">
                          {new Date(s.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn"
                          style={{ padding: "5px 9px", fontSize: 11 }}
                          onClick={() => unblockPhone(s.phone)}
                        >
                          <Trash2 size={12} style={{ verticalAlign: "-2px", marginRight: 4, color: "#dc2626" }} />
                          Desbloquear
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {suppressions.length === 0 && (
                <div className="empty">
                  Nenhum número na lista de supressão no momento.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="footer-note">
          <Bot size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
          Buffer inteligente agrega mensagens consecutivas antes de acionar a IA. Respostas respeitam opt-out e restrições configuradas.
        </div>
      </main>

      {/* Modal / Painel de Conversa */}
      {selectedLeadId && (
        <div className="modal-bg" onClick={() => setSelectedLeadId(null)}>
          <div className="conversation-modal" onClick={e => e.stopPropagation()}>
            <div className="conversation-header">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{activeLead?.name || "Carregando..."}</h2>
                  {activeLead && (
                    <span className={`badge ${statusBadgeClass[activeLead.status] || ""}`}>
                      {statusText[activeLead.status] || activeLead.status}
                    </span>
                  )}
                </div>
                <div className="sub" style={{ marginTop: 4, display: "flex", gap: 12, alignItems: "center" }}>
                  <span>{activeLead?.company || "Empresa não informada"}</span>
                  <span>·</span>
                  <span>+{activeLead?.phone}</span>
                  {activeLead?.website && (
                    <>
                      <span>·</span>
                      <a
                        href={activeLead.website.startsWith("http") ? activeLead.website : `https://${activeLead.website}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--green)", display: "inline-flex", alignItems: "center", gap: 3 }}
                      >
                        Site <ExternalLink size={11} />
                      </a>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {activeLead && (
                  <select
                    className="select-status"
                    disabled={updatingStatus}
                    value={activeLead.status}
                    onChange={e => updateStatus(e.target.value)}
                    title="Alterar estágio do lead"
                  >
                    <option value="READY">Pronto para contato</option>
                    <option value="SENT">Mensagem enviada</option>
                    <option value="REPLIED">Respondeu</option>
                    <option value="QUALIFIED">Qualificado</option>
                    <option value="MEETING">Reunião marcada</option>
                    <option value="WON">Convertido</option>
                    <option value="LOST">Encerrado</option>
                    <option value="OPTED_OUT">Opt-out</option>
                    <option value="BLOCKED">Bloqueado</option>
                  </select>
                )}
                <button type="button" className="btn" onClick={() => setSelectedLeadId(null)}>
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="conversation-body">
              {loadingChat && <div className="empty">Carregando histórico da conversa...</div>}

              {!loadingChat && activeLead && activeLead.messages.length === 0 && (
                <div className="empty" style={{ padding: "26px 12px" }}>
                  <Send size={24} style={{ color: "var(--green)", marginBottom: 8 }} />
                  <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
                    Nenhuma mensagem enviada ainda
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Clique no botão de IA abaixo ou redija a 1ª abordagem para iniciar o contato via WhatsApp.
                  </div>
                </div>
              )}

              {!loadingChat && activeLead && activeLead.messages.map(m => (
                <div
                  key={m.id}
                  className={`chat-msg ${m.direction === "OUTBOUND" ? "outbound" : "inbound"}`}
                >
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                  <div className="chat-meta">
                    <span>
                      {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {m.direction === "OUTBOUND" && (
                      <span style={{ fontSize: 9, opacity: 0.8 }}>
                        · {m.status === "SENT" ? "Enviada" : m.status === "DELIVERED" ? "Entregue" : m.status === "QUEUED" ? "Na fila" : "Falhou"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="conversation-footer">
              {activeLead && (activeLead.status === "OPTED_OUT" || activeLead.status === "BLOCKED") ? (
                <div className="notice" style={{ margin: 0, background: "#fef2f2", borderColor: "#fecaca", color: "#991b1b" }}>
                  Este contato solicitou cancelamento ou está bloqueado. O envio de mensagens está desabilitado.
                </div>
              ) : (
                <form onSubmit={handleSendMessage}>
                  {activeLead && !activeLead.initialSentAt && (
                    <div className="template-box">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Sparkles size={14} style={{ color: "var(--green)" }} />
                        <span>Gerar abordagem personalizada com IA?</span>
                      </div>
                      <button
                        type="button"
                        className="btn primary"
                        style={{ padding: "5px 10px", fontSize: 11 }}
                        disabled={generatingDraft}
                        onClick={requestAiDraft}
                      >
                        {generatingDraft ? "Gerando com IA…" : "Gerar abordagem"}
                      </button>
                    </div>
                  )}

                  <div className="composer-row">
                    <textarea
                      className="composer-input"
                      rows={3}
                      required
                      placeholder={activeLead?.initialSentAt ? "Digite uma resposta manual..." : "Digite o texto da 1ª abordagem..."}
                      value={composerText}
                      onChange={e => setComposerText(e.target.value)}
                    />
                    <button
                      className="btn primary"
                      style={{ height: 68, padding: "0 18px" }}
                      disabled={sendingMsg || !composerText.trim()}
                    >
                      {sendingMsg ? "Enviando…" : <Send size={16} />}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cadastro Manual de Lead */}
      {showAddModal && (
        <div className="modal-bg" onClick={() => setShowAddModal(false)}>
          <form className="modal" onSubmit={addLead} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Novo lead</h2>
              <button type="button" className="btn" onClick={() => setShowAddModal(false)}>
                <X size={15} />
              </button>
            </div>
            <label className="label">Nome do contato</label>
            <input
              className="input"
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Ana Silva"
            />
            <label className="label">Telefone com código do país</label>
            <input
              className="input"
              required
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="5511999999999"
            />
            <label className="label">Empresa</label>
            <input
              className="input"
              value={form.company}
              onChange={e => setForm({ ...form, company: e.target.value })}
              placeholder="Nome da empresa"
            />
            <label className="label">Site</label>
            <input
              className="input"
              value={form.website}
              onChange={e => setForm({ ...form, website: e.target.value })}
              placeholder="https://..."
            />
            <label className="label">Notas para personalização</label>
            <input
              className="input"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Contexto comercial conhecido"
            />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowAddModal(false)}>
                Cancelar
              </button>
              <button className="btn primary" disabled={loading}>
                {loading ? "Salvando…" : "Salvar lead"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Adicionar Supressão Manual */}
      {showAddSuppressionModal && (
        <div className="modal-bg" onClick={() => setShowAddSuppressionModal(false)}>
          <form className="modal" onSubmit={addSuppression} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Bloquear telefone (Supressão)</h2>
              <button type="button" className="btn" onClick={() => setShowAddSuppressionModal(false)}>
                <X size={15} />
              </button>
            </div>
            <label className="label">Telefone para bloqueio</label>
            <input
              className="input"
              required
              value={suppressionForm.phone}
              onChange={e => setSuppressionForm({ ...suppressionForm, phone: e.target.value })}
              placeholder="5511999999999"
            />
            <label className="label">Motivo do bloqueio</label>
            <input
              className="input"
              required
              value={suppressionForm.reason}
              onChange={e => setSuppressionForm({ ...suppressionForm, reason: e.target.value })}
              placeholder="Ex.: Pedido por e-mail, concorrente, etc."
            />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowAddSuppressionModal(false)}>
                Cancelar
              </button>
              <button className="btn primary" disabled={loading}>
                {loading ? "Bloqueando…" : "Bloquear contato"}
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 22,
            right: 22,
            padding: "12px 16px",
            background: "#17221d",
            color: "white",
            borderRadius: 9,
            fontSize: 12,
            zIndex: 30,
            boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
