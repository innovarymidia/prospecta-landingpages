"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Copy,
  ExternalLink,
  Eye,
  Flame,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  LogOut,
  MapPin,
  MessageSquare,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldBan,
  Sparkles,
  Sun,
  Upload,
  X,
} from "lucide-react";
import {
  buildFollowUpSuggestion,
  buildTrackedPreviewUrl,
  getFollowUpStage,
  getLeadGoldScore,
  hasRealWebsite,
} from "@/lib/sniper";

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  purpose?: string | null;
  status: "QUEUED" | "SENT" | "DELIVERED" | "FAILED";
  body: string;
  mediaUrl?: string | null;
  createdAt: string;
};

type Lead = {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  website: string | null;
  address?: string | null;
  category?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  hours?: string | null;
  previewUrl?: string | null;
  previewSlug?: string | null;
  previewImage?: string | null;
  previewViews?: number;
  lastViewedAt?: string | null;
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

const statusConfig: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  NEW: { label: "Novo Lead", dotClass: "gray", badgeClass: "gray" },
  READY: { label: "Selecionado", dotClass: "blue", badgeClass: "blue" },
  BUILDING: { label: "Montando Prévia", dotClass: "purple", badgeClass: "purple" },
  DEMO_READY: { label: "Prévia Pronta", dotClass: "pink", badgeClass: "pink" },
  SENT: { label: "Prévia Enviada", dotClass: "yellow", badgeClass: "yellow" },
  REPLIED: { label: "Respondeu", dotClass: "green", badgeClass: "green" },
  QUALIFIED: { label: "Qualificado", dotClass: "blue", badgeClass: "blue" },
  MEETING: { label: "Reunião Marcada", dotClass: "purple", badgeClass: "purple" },
  WON: { label: "Cliente Fechado", dotClass: "green", badgeClass: "green" },
  LOST: { label: "Encerrado", dotClass: "gray", badgeClass: "gray" },
  OPTED_OUT: { label: "Opt-out", dotClass: "gray", badgeClass: "red" },
  BLOCKED: { label: "Bloqueado", dotClass: "gray", badgeClass: "red" },
};

async function compressScreenshotToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 1200;
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível no navegador");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

function getInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [activeTab, setActiveTab] = useState<"leads" | "suppressions">("leads");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [query, setQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddSuppressionModal, setShowAddSuppressionModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    company: "",
    website: "",
    category: "Locação de Máquinas / Equipamentos",
    address: "",
    rating: "",
    reviewsCount: "",
    previewUrl: "",
    source: "Cadastro manual",
    notes: "",
  });
  const [suppressionForm, setSuppressionForm] = useState({ phone: "", reason: "Solicitação manual de bloqueio" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  // Offcanvas Drawer
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<LeadDetail | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [previewUrlInput, setPreviewUrlInput] = useState("");
  const [savingPreview, setSavingPreview] = useState(false);
  const [includePreviewImage, setIncludePreviewImage] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme);
  }, [theme]);

  function notify(s: string) {
    setToast(s);
    setTimeout(() => setToast(""), 4500);
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
      setLeads(await r.json());
    } catch {}
  }

  async function loadSuppressions() {
    try {
      const r = await fetch("/api/suppressions");
      if (r.ok) setSuppressions(await r.json());
    } catch {}
  }

  async function loadStatus() {
    try {
      const r = await fetch("/api/system/status");
      if (r.ok) setSystemStatus(await r.json());
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
      setPreviewUrlInput(data.previewUrl || "");
      setIncludePreviewImage(Boolean(data.previewImage) && !data.initialSentAt);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erro ao abrir conversa");
      setSelectedLeadId(null);
    } finally {
      setLoadingChat(false);
    }
  }

  function getTrackedLink(lead: { previewSlug?: string | null; previewUrl?: string | null } | null | undefined) {
    if (!lead?.previewUrl) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildTrackedPreviewUrl(lead.previewSlug, origin) || lead.previewUrl;
  }

  async function savePreviewUrl(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!activeLead) return;
    setSavingPreview(true);
    try {
      const res = await fetch(`/api/leads/${activeLead.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewUrl: previewUrlInput.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar URL da prévia");
      setActiveLead(prev =>
        prev ? { ...prev, previewUrl: data.previewUrl, previewSlug: data.previewSlug, status: data.status } : null
      );
      setLeads(prev =>
        prev.map(l =>
          l.id === activeLead.id
            ? { ...l, previewUrl: data.previewUrl, previewSlug: data.previewSlug, status: data.status }
            : l
        )
      );
      notify(data.previewUrl ? "Prévia salva e link rastreado gerado!" : "Link da prévia removido.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao salvar prévia");
    } finally {
      setSavingPreview(false);
    }
  }

  async function handlePreviewImageFile(file: File) {
    if (!activeLead) return;
    setSavingPreview(true);
    try {
      const dataUrl = await compressScreenshotToDataUrl(file);
      const res = await fetch(`/api/leads/${activeLead.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewImage: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar print da prévia");
      setActiveLead(prev => (prev ? { ...prev, previewImage: data.previewImage } : null));
      setLeads(prev => prev.map(l => (l.id === activeLead.id ? { ...l, previewImage: data.previewImage } : l)));
      setIncludePreviewImage(true);
      notify("Print da prévia anexado! Pronto para enviar no WhatsApp.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao processar print");
    } finally {
      setSavingPreview(false);
    }
  }

  async function removePreviewImage() {
    if (!activeLead) return;
    setSavingPreview(true);
    try {
      const res = await fetch(`/api/leads/${activeLead.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewImage: null }),
      });
      if (!res.ok) throw new Error("Falha ao remover print");
      setActiveLead(prev => (prev ? { ...prev, previewImage: null } : null));
      setLeads(prev => prev.map(l => (l.id === activeLead.id ? { ...l, previewImage: null } : l)));
      setIncludePreviewImage(false);
      notify("Print removido.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao remover print");
    } finally {
      setSavingPreview(false);
    }
  }

  function handleDrawerPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handlePreviewImageFile(file);
          break;
        }
      }
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
          notify("Abordagem Sniper gerada pela IA!");
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
    const link = getTrackedLink(activeLead);
    const template = link
      ? `Oi, tudo bem? É da ${company}? Notei que vocês ainda não têm uma página própria focada em pedidos de orçamento no WhatsApp e montei uma prévia real de como ficaria o site de vocês funcionando no celular: ${link}\n\nSe puder encaminhar para o responsável dar uma olhada sem compromisso, acredito que ajuda bastante a evitar equipamento parado e puxar cotações no Google.`
      : `Oi, tudo bem? É da ${company}? Uma dúvida rápida: quem aí cuida da parte de novos orçamentos pelo site e WhatsApp? É por este número mesmo?`;
    setComposerText(template);
    notify("Abordagem rápida carregada!");
  }

  function loadFollowUp(stage: "DAY_2" | "DAY_5") {
    if (!activeLead) return;
    const company = activeLead.company?.trim() || activeLead.name.trim();
    const link = getTrackedLink(activeLead);
    setComposerText(buildFollowUpSuggestion(company, stage, link));
    setIncludePreviewImage(false);
    notify(stage === "DAY_5" ? "Follow-up de encerramento (Dia +5) carregado!" : "Follow-up de utilidade (Dia +2) carregado!");
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!activeLead || !composerText.trim()) return;

    setSendingMsg(true);
    try {
      const res = await fetch(`/api/leads/${activeLead.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: composerText.trim(),
          includePreviewImage: includePreviewImage && Boolean(activeLead.previewImage),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enfileirar mensagem");

      notify(data.hasMedia ? "Print da prévia + mensagem enviados para a fila!" : "Mensagem enviada para a fila do WhatsApp!");
      setComposerText("");
      setIncludePreviewImage(false);
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
      const payload = {
        name: form.name,
        phone: form.phone,
        company: form.company || undefined,
        website: form.website || undefined,
        category: form.category || undefined,
        address: form.address || undefined,
        rating: form.rating ? Number(form.rating.replace(",", ".")) : null,
        reviewsCount: form.reviewsCount ? Number(form.reviewsCount) : null,
        previewUrl: form.previewUrl.trim() || null,
        source: form.source || "Cadastro manual",
        notes: form.notes || undefined,
      };
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Falha ao salvar");
      setLeads([data, ...leads]);
      setShowAddModal(false);
      setForm({
        name: "",
        phone: "",
        company: "",
        website: "",
        category: "Locação de Máquinas / Equipamentos",
        address: "",
        rating: "",
        reviewsCount: "",
        previewUrl: "",
        source: "Cadastro manual",
        notes: "",
      });
      notify("Lead cadastrado com sucesso!");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setLoading(false);
    }
  }

  // Estatísticas Reais (Sniper + Views Rastreadas)
  const totalLeads = leads.length;
  const goldCount = leads.filter(l => getLeadGoldScore(l).isGold).length;
  const demoCount = leads.filter(l => l.status === "BUILDING" || l.status === "DEMO_READY" || Boolean(l.previewUrl)).length;
  const readyCount = leads.filter(l => ["READY", "NEW", "BUILDING", "DEMO_READY"].includes(l.status)).length;
  const sentCount = leads.filter(l => l.initialSentAt || l.status === "SENT").length;
  const followUpCount = leads.filter(l => getFollowUpStage(l).due !== false).length;
  const totalPreviewViews = leads.reduce((sum, l) => sum + (l.previewViews || 0), 0);
  const viewedLeadsCount = leads.filter(l => (l.previewViews || 0) > 0).length;
  const repliedCount = leads.filter(l => ["REPLIED", "QUALIFIED", "MEETING", "WON"].includes(l.status)).length;
  const wonCount = leads.filter(l => l.status === "WON").length;

  const goldPct = totalLeads > 0 ? Math.round((goldCount / totalLeads) * 100) : 0;
  const demoPct = totalLeads > 0 ? Math.round((demoCount / totalLeads) * 100) : 0;
  const viewsPct = sentCount > 0 ? Math.min(100, Math.round((viewedLeadsCount / sentCount) * 100)) : 0;
  const metaPct = Math.min(100, Math.round((wonCount / 10) * 100));

  const filtered = useMemo(() => {
    return leads.filter(l => {
      const matchesQuery = `${l.name} ${l.company || ""} ${l.phone} ${l.category || ""} ${l.address || ""}`
        .toLowerCase()
        .includes(query.toLowerCase());
      if (!matchesQuery) return false;
      if (stageFilter === "ALL") return true;
      if (stageFilter === "GOLD") return getLeadGoldScore(l).isGold || !hasRealWebsite(l.website);
      if (stageFilter === "DEMO") return l.status === "BUILDING" || l.status === "DEMO_READY" || Boolean(l.previewUrl);
      if (stageFilter === "READY") return ["READY", "NEW", "BUILDING", "DEMO_READY"].includes(l.status);
      if (stageFilter === "SENT") return l.status === "SENT";
      if (stageFilter === "FOLLOWUP") return getFollowUpStage(l).due !== false;
      if (stageFilter === "REPLIED") return ["REPLIED", "QUALIFIED", "MEETING"].includes(l.status);
      if (stageFilter === "WON") return l.status === "WON";
      return true;
    });
  }, [leads, query, stageFilter]);

  return (
    <div className="tblr-page">
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "var(--tblr-body-color)",
            color: "var(--tblr-bg-surface)",
            padding: "10px 16px",
            borderRadius: "6px",
            fontWeight: 600,
            fontSize: 13,
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Sparkles size={15} style={{ color: "var(--tblr-azure)" }} />
          {toast}
        </div>
      )}

      {/* Tabler Vertical Sidebar */}
      <aside className="tblr-sidebar">
        <a href="/" className="tblr-brand">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 68" width="28" height="28" aria-label="Prospecta">
            <path
              d="M64.6 16.2C63 9.9 58.1 5 51.8 3.4 40 1.5 28 1.5 16.2 3.4 9.9 5 5 9.9 3.4 16.2 1.5 28 1.5 40 3.4 51.8 5 58.1 9.9 63 16.2 64.6c11.8 1.9 23.8 1.9 35.6 0C58.1 63 63 58.1 64.6 51.8c1.9-11.8 1.9-23.8 0-35.6zM33.3 36.3c-2.8 4.4-6.6 8.2-11.1 11-1.5.9-3.3.9-4.8.1s-2.4-2.3-2.5-4c0-1.7.9-3.3 2.4-4.1 2.3-1.4 4.4-3.2 6.1-5.3-1.8-2.1-3.8-3.8-6.1-5.3-2.3-1.3-3-4.2-1.7-6.4s4.3-2.9 6.5-1.6c4.5 2.8 8.2 6.5 11.1 10.9 1 1.4 1 3.3.1 4.7zM49.2 46H37.8c-2.1 0-3.8-1-3.8-3s1.7-3 3.8-3h11.4c2.1 0 3.8 1 3.8 3s-1.7 3-3.8 3z"
              fill="var(--tblr-primary)"
            />
          </svg>
          <div>
            <div className="tblr-brand-title">Prospecta</div>
            <div className="tblr-brand-sub">Rental B2B CRM</div>
          </div>
        </a>

        <nav className="tblr-nav-list">
          <div className="tblr-nav-section">Operação Sniper</div>
          <button
            className={`tblr-nav-link ${activeTab === "leads" && stageFilter === "ALL" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("leads");
              setStageFilter("ALL");
            }}
          >
            <LayoutDashboard size={16} />
            <span>Visão Geral</span>
            <span className="tblr-nav-badge">{totalLeads}</span>
          </button>

          <button
            className={`tblr-nav-link ${activeTab === "leads" && stageFilter === "GOLD" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("leads");
              setStageFilter("GOLD");
            }}
          >
            <Flame size={16} />
            <span>Leads Ouro</span>
            <span className="tblr-nav-badge primary">{goldCount}</span>
          </button>

          <button
            className={`tblr-nav-link ${activeTab === "leads" && stageFilter === "DEMO" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("leads");
              setStageFilter("DEMO");
            }}
          >
            <Eye size={16} />
            <span>Prévias Prontas</span>
            <span className="tblr-nav-badge">{demoCount}</span>
          </button>

          <button
            className={`tblr-nav-link ${activeTab === "leads" && stageFilter === "FOLLOWUP" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("leads");
              setStageFilter("FOLLOWUP");
            }}
          >
            <Activity size={16} />
            <span>Follow-up 2d/5d</span>
            {followUpCount > 0 && <span className="tblr-nav-badge warning">{followUpCount}</span>}
          </button>

          <button
            className={`tblr-nav-link ${activeTab === "leads" && stageFilter === "REPLIED" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("leads");
              setStageFilter("REPLIED");
            }}
          >
            <MessageSquare size={16} />
            <span>Em Negociação</span>
            <span className="tblr-nav-badge">{repliedCount}</span>
          </button>

          <div className="tblr-nav-section">Captação & Controle</div>
          <a className="tblr-nav-link" href="/campaigns">
            <MapPin size={16} />
            <span>Buscas Maps (Outscraper)</span>
          </a>

          <button
            className={`tblr-nav-link ${activeTab === "suppressions" ? "active" : ""}`}
            onClick={() => setActiveTab("suppressions")}
          >
            <ShieldBan size={16} />
            <span>Lista de Supressão</span>
            <span className="tblr-nav-badge">{suppressions.length}</span>
          </button>
        </nav>

        <div className="tblr-sidebar-footer">
          <div className="tblr-user-box">
            <div className="tblr-avatar">IN</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tblr-body-color)" }}>Innovary</div>
              <div style={{ fontSize: 11, color: "var(--tblr-secondary)" }}>Meta: 10 sites/mês</div>
            </div>
          </div>

          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              location.assign("/login");
            }}
            className="tblr-nav-link"
            style={{ color: "var(--tblr-red)" }}
          >
            <LogOut size={15} />
            <span>Sair do painel</span>
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="tblr-page-wrapper">
        {/* Top Utility Header */}
        <header className="tblr-topbar">
          <div style={{ position: "relative", width: "min(360px, 100%)" }}>
            <Search
              size={15}
              style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--tblr-muted)" }}
            />
            <input
              className="tblr-input"
              style={{ paddingLeft: 34 }}
              placeholder="Buscar empresa, cidade, WhatsApp ou nicho..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`tblr-badge ${systemStatus?.automationEnabled ? "green" : "yellow"}`}>
              <span className={`tblr-status-dot ${systemStatus?.automationEnabled ? "green" : "yellow"}`} />
              {systemStatus?.automationEnabled ? "Evolution API Ativa" : "Envios Pausados"}
            </span>

            <button
              className="tblr-btn tblr-btn-icon"
              onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}
              title={theme === "light" ? "Modo escuro Tabler" : "Modo claro Tabler"}
            >
              {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>

            <button className="tblr-btn tblr-btn-icon" onClick={() => loadLeads()} title="Atualizar dados">
              <RefreshCw size={15} />
            </button>
          </div>
        </header>

        <main className="tblr-container">
          {/* Tabler Page Header */}
          <div className="tblr-page-header">
            <div>
              <div className="tblr-page-pretitle">
                {activeTab === "leads" ? "VISÃO GERAL · RENTAL B2B (LOCADORAS)" : "CONFORMIDADE E OPT-OUT"}
              </div>
              <h1 className="tblr-page-title">
                {activeTab === "leads" ? "Painel de Prospecção & Prévias" : "Lista de Supressão"}
              </h1>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <a href="/campaigns" className="tblr-btn">
                <MapPin size={14} />
                <span>Buscas Maps</span>
              </a>
              <button className="tblr-btn tblr-btn-primary" onClick={() => setShowAddModal(true)}>
                <Plus size={15} />
                <span>Novo Lead</span>
              </button>
            </div>
          </div>

          {activeTab === "leads" ? (
            <>
              {/* Row 1: 4 Signature Tabler KPI Cards */}
              <section className="tblr-kpi-grid">
                {/* KPI 1: Leads Ouro */}
                <div className="tblr-card">
                  <div className="tblr-card-body">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="tblr-subheader">Leads Ouro (Sem Site)</span>
                      <span className="tblr-badge blue">{goldPct}% da base</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "8px 0 10px" }}>
                      <span className="tblr-metric-num">{goldCount}</span>
                      <span style={{ fontSize: 12, color: "var(--tblr-secondary)" }}>de {totalLeads} empresas</span>
                    </div>
                    <div className="tblr-progress">
                      <div className="tblr-progress-bar" style={{ width: `${Math.max(8, goldPct)}%` }} />
                    </div>
                  </div>
                </div>

                {/* KPI 2: Prévias Manuais Prontas */}
                <div className="tblr-card">
                  <div className="tblr-card-body">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="tblr-subheader">Prévias Prontas</span>
                      <span className="tblr-badge purple">{demoPct}%</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8 }}>
                      <div>
                        <span className="tblr-metric-num">{demoCount}</span>
                        <div style={{ fontSize: 12, color: "var(--tblr-secondary)", marginTop: 2 }}>
                          {readyCount} em fila de criação
                        </div>
                      </div>
                      <svg width="88" height="34" viewBox="0 0 88 34">
                        <defs>
                          <linearGradient id="tblrSparkBlue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#066fd1" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#066fd1" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M2 28 L18 22 L34 25 L52 14 L68 18 L86 6 L86 34 L2 34 Z" fill="url(#tblrSparkBlue)" />
                        <path d="M2 28 L18 22 L34 25 L52 14 L68 18 L86 6" fill="none" stroke="#066fd1" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* KPI 3: Envios & Follow-up */}
                <div className="tblr-card">
                  <div className="tblr-card-body">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="tblr-subheader">Prévias Enviadas</span>
                      {followUpCount > 0 ? (
                        <span className="tblr-badge yellow">{followUpCount} follow-up</span>
                      ) : (
                        <span className="tblr-badge green">Em dia</span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8 }}>
                      <div>
                        <span className="tblr-metric-num">{sentCount}</span>
                        <div style={{ fontSize: 12, color: "var(--tblr-secondary)", marginTop: 2 }}>
                          {repliedCount} respostas recebidas
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 32 }}>
                        {[35, 65, 50, 85, 70, 95, 60].map((h, i) => (
                          <div
                            key={i}
                            style={{
                              width: 6,
                              height: `${h}%`,
                              borderRadius: 2,
                              background: i >= 4 ? "var(--tblr-primary)" : "var(--tblr-primary-lt)",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* KPI 4: Aberturas Reais /v/[slug] */}
                <div className="tblr-card">
                  <div className="tblr-card-body">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="tblr-subheader">Aberturas (/v/slug)</span>
                      <span className="tblr-badge green" style={{ gap: 2 }}>
                        {viewsPct}% <ArrowUpRight size={11} />
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8 }}>
                      <div>
                        <span className="tblr-metric-num">{totalPreviewViews}</span>
                        <div style={{ fontSize: 12, color: "var(--tblr-secondary)", marginTop: 2 }}>
                          {viewedLeadsCount} empresas clicaram
                        </div>
                      </div>
                      <svg width="88" height="34" viewBox="0 0 88 34">
                        <path d="M2 26 L18 24 L34 16 L52 19 L68 10 L86 5" fill="none" stroke="#2fb344" strokeWidth="2.2" strokeLinecap="round" />
                        <circle cx="86" cy="5" r="3" fill="#2fb344" />
                      </svg>
                    </div>
                  </div>
                </div>
              </section>

              {/* Row 2: Tabler Summary & Funnel Breakdown */}
              <section className="tblr-mid-grid">
                {/* Card Esquerdo: Meta Mensal & Operação */}
                <div className="tblr-card">
                  <div className="tblr-card-header">
                    <h3 className="tblr-card-title">Meta Comercial Mensal (Sites R$ 1.200)</h3>
                    <span className="tblr-badge green">{wonCount} / 10 fechados</span>
                  </div>
                  <div className="tblr-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div className="tblr-subheader">Receita Fechada no Mês</div>
                        <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          R$ {(wonCount * 1200).toLocaleString("pt-BR")}
                          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--tblr-secondary)", marginLeft: 8 }}>
                            / meta R$ 12.000
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="tblr-subheader">Progresso</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--tblr-primary)" }}>{metaPct}%</div>
                      </div>
                    </div>

                    <div className="tblr-progress" style={{ height: 8 }}>
                      <div className="tblr-progress-bar green" style={{ width: `${Math.max(4, metaPct)}%` }} />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, paddingTop: 6 }}>
                      <div>
                        <div className="tblr-subheader">Taxa de Clique</div>
                        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{viewsPct}%</div>
                        <div style={{ fontSize: 11, color: "var(--tblr-secondary)" }}>nas prévias enviadas</div>
                      </div>
                      <div>
                        <div className="tblr-subheader">Em Negociação</div>
                        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{repliedCount}</div>
                        <div style={{ fontSize: 11, color: "var(--tblr-secondary)" }}>decisores respondendo</div>
                      </div>
                      <div>
                        <div className="tblr-subheader">Follow-ups 2d/5d</div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: followUpCount > 0 ? "#b45309" : "var(--tblr-body-color)", marginTop: 2 }}>
                          {followUpCount}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--tblr-secondary)" }}>aguardando toque</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Direito: Distribuição do Funil Sniper */}
                <div className="tblr-card">
                  <div className="tblr-card-header">
                    <h3 className="tblr-card-title">Etapas do Funil Artesanal</h3>
                    <span style={{ fontSize: 12, color: "var(--tblr-secondary)" }}>Clique para filtrar</span>
                  </div>
                  <div className="tblr-card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[
                      { key: "GOLD", label: "Garimpados Ouro (Sem site)", count: goldCount, color: "var(--tblr-primary)" },
                      { key: "DEMO", label: "Prévias Manuais Prontas", count: demoCount, color: "var(--tblr-purple)" },
                      { key: "SENT", label: "Prévias Enviadas (Link + Print)", count: sentCount, color: "var(--tblr-yellow)" },
                      { key: "REPLIED", label: "Em Conversa / Reunião", count: repliedCount, color: "var(--tblr-azure)" },
                      { key: "WON", label: "Contratos Fechados (R$ 1.200)", count: wonCount, color: "var(--tblr-green)" },
                    ].map(row => {
                      const pct = totalLeads > 0 ? Math.round((row.count / totalLeads) * 100) : 0;
                      return (
                        <div
                          key={row.key}
                          onClick={() => setStageFilter(row.key)}
                          style={{ cursor: "pointer" }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                            <span style={{ fontWeight: 500, color: "var(--tblr-body-color)" }}>{row.label}</span>
                            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                              {row.count} <span style={{ color: "var(--tblr-muted)", fontWeight: 400 }}>({pct}%)</span>
                            </span>
                          </div>
                          <div className="tblr-progress">
                            <div
                              className="tblr-progress-bar"
                              style={{ width: `${Math.max(row.count > 0 ? 6 : 0, pct)}%`, background: row.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Row 3: Classic Tabler Pipeline Table */}
              <section className="tblr-card">
                <div className="tblr-card-header">
                  <div>
                    <h3 className="tblr-card-title">Pipeline de Empresas</h3>
                  </div>

                  <div className="tblr-segmented">
                    {[
                      { id: "ALL", label: "Todos" },
                      { id: "GOLD", label: "Ouro" },
                      { id: "DEMO", label: "Prévia" },
                      { id: "SENT", label: "Enviados" },
                      { id: "FOLLOWUP", label: `Follow-up${followUpCount ? ` (${followUpCount})` : ""}` },
                      { id: "REPLIED", label: "Conversa" },
                      { id: "WON", label: "Fechados" },
                    ].map(st => (
                      <button
                        key={st.id}
                        onClick={() => setStageFilter(st.id)}
                        className={`tblr-seg-btn ${stageFilter === st.id ? "active" : ""}`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table className="tblr-table">
                    <thead>
                      <tr>
                        <th>Empresa / Google Maps</th>
                        <th>WhatsApp</th>
                        <th>Rastreio & Follow-up</th>
                        <th>Etapa</th>
                        <th style={{ textAlign: "right" }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", padding: "40px 20px", color: "var(--tblr-secondary)" }}>
                            Nenhum lead encontrado neste filtro. Adicione uma locadora em <strong>+ Novo Lead</strong> ou rode uma busca em <strong>Buscas Maps</strong>.
                          </td>
                        </tr>
                      ) : (
                        filtered.slice(0, 20).map(l => {
                          const conf = statusConfig[l.status] || { label: l.status, dotClass: "gray", badgeClass: "gray" };
                          const gold = getLeadGoldScore(l);
                          const followUp = getFollowUpStage(l);
                          const realSite = hasRealWebsite(l.website);
                          const displayName = l.company || l.name;

                          return (
                            <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => openConversation(l.id)}>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span className="tblr-avatar">{getInitials(displayName)}</span>
                                  <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontWeight: 600 }}>
                                      <span>{displayName}</span>
                                      {gold.isGold && <span className="tblr-badge yellow">Ouro</span>}
                                      {l.previewUrl && <span className="tblr-badge blue">Prévia</span>}
                                    </div>
                                    <div style={{ fontSize: 12, color: "var(--tblr-secondary)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      {typeof l.rating === "number" && (
                                        <span style={{ color: "#d97706", fontWeight: 600 }}>
                                          ★ {l.rating.toFixed(1)} ({l.reviewsCount ?? 0})
                                        </span>
                                      )}
                                      <span>{realSite && l.website ? l.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 26) : "Sem site próprio"}</span>
                                      {l.address && <span>· {l.address.slice(0, 24)}</span>}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{l.phone}</td>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  {(l.previewViews || 0) > 0 ? (
                                    <span className="tblr-badge purple">
                                      <Eye size={11} /> {l.previewViews} {l.previewViews === 1 ? "view" : "views"}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 12, color: "var(--tblr-muted)" }}>
                                      {l.previewUrl ? "0 cliques" : "Sem prévia"}
                                    </span>
                                  )}
                                  {followUp.due && (
                                    <span className="tblr-badge yellow">
                                      Follow-up {followUp.due === "DAY_5" ? "5d+" : "2d+"}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <span className={`tblr-badge ${conf.badgeClass}`}>
                                  <span className={`tblr-status-dot ${conf.dotClass}`} />
                                  {conf.label}
                                </span>
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <button
                                  className="tblr-btn tblr-btn-sm"
                                  onClick={e => {
                                    e.stopPropagation();
                                    openConversation(l.id);
                                  }}
                                >
                                  Abrir
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="tblr-card-footer">
                  <span>Mostrando {Math.min(filtered.length, 20)} de {filtered.length} leads filtrados</span>
                  <span>Total na base: {totalLeads} empresas</span>
                </div>
              </section>
            </>
          ) : (
            /* Tab Supressões em Padrão Tabler */
            <section className="tblr-card">
              <div className="tblr-card-header">
                <div>
                  <h3 className="tblr-card-title">Números Bloqueados & Opt-out</h3>
                </div>
                <button className="tblr-btn tblr-btn-primary tblr-btn-sm" onClick={() => setShowAddSuppressionModal(true)}>
                  <Plus size={14} /> Adicionar Bloqueio
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="tblr-table">
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
                        <td colSpan={4} style={{ textAlign: "center", padding: "40px 20px", color: "var(--tblr-secondary)" }}>
                          Nenhum telefone na lista de supressão.
                        </td>
                      </tr>
                    ) : (
                      suppressions.map(s => (
                        <tr key={s.phone}>
                          <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{s.phone}</td>
                          <td><span className="tblr-badge red">{s.reason}</span></td>
                          <td style={{ color: "var(--tblr-secondary)" }}>{new Date(s.createdAt).toLocaleDateString("pt-BR")}</td>
                          <td style={{ textAlign: "right" }}>
                            <button className="tblr-btn tblr-btn-sm" onClick={() => unblockPhone(s.phone)}>
                              Liberar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Tabler Offcanvas Drawer (Atendimento + URL Prévia + Ctrl+V Print) */}
      {selectedLeadId && (() => {
        const trackedUrl = getTrackedLink(activeLead);
        const followUp = activeLead ? getFollowUpStage(activeLead) : { due: false as const, daysSinceSent: 0 };

        return (
          <div className="tblr-drawer-backdrop" onClick={() => setSelectedLeadId(null)}>
            <div className="tblr-drawer" onClick={e => e.stopPropagation()} onPaste={handleDrawerPaste}>
              {/* Header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--tblr-border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                      {activeLead?.company || activeLead?.name}
                    </h3>
                    <a
                      href={`https://wa.me/${activeLead?.phone?.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--tblr-primary)", display: "inline-flex" }}
                      title="Abrir no WhatsApp Oficial"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--tblr-secondary)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span>{activeLead?.phone} · {activeLead?.category || "Locação B2B"}</span>
                    {typeof activeLead?.rating === "number" && (
                      <span style={{ color: "#d97706", fontWeight: 600 }}>
                        ★ {activeLead.rating.toFixed(1)} ({activeLead.reviewsCount ?? 0})
                      </span>
                    )}
                    {activeLead?.address && <span>· {activeLead.address.slice(0, 35)}</span>}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <select
                    value={activeLead?.status || "READY"}
                    onChange={e => updateStatus(e.target.value)}
                    disabled={updatingStatus}
                    className="tblr-input"
                    style={{ height: 32, width: "auto", fontSize: 12, fontWeight: 600 }}
                  >
                    {Object.entries(statusConfig).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>

                  <button onClick={() => setSelectedLeadId(null)} className="tblr-btn tblr-btn-icon tblr-btn-sm">
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Sniper Preview URL & Print Bar */}
              {activeLead && (
                <div style={{ padding: "12px 20px", background: "var(--tblr-bg-surface-secondary)", borderBottom: "1px solid var(--tblr-border-color)", display: "flex", flexDirection: "column", gap: 10 }}>
                  <form onSubmit={savePreviewUrl} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <Link2 size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--tblr-primary)" }} />
                      <input
                        className="tblr-input"
                        style={{ paddingLeft: 32, height: 34, fontSize: 12 }}
                        value={previewUrlInput}
                        onChange={e => setPreviewUrlInput(e.target.value)}
                        placeholder="Cole aqui o link externo da prévia manual (https://...)"
                      />
                    </div>
                    <button type="submit" className="tblr-btn tblr-btn-primary tblr-btn-sm" style={{ height: 34 }} disabled={savingPreview}>
                      {savingPreview ? "..." : "Salvar Prévia"}
                    </button>
                  </form>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    {trackedUrl ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                        <span className="tblr-badge purple">
                          <Eye size={11} /> {activeLead.previewViews ?? 0} {activeLead.previewViews === 1 ? "clique" : "cliques"}
                        </span>
                        <button
                          type="button"
                          className="tblr-btn tblr-btn-sm"
                          style={{ height: 26, fontSize: 11 }}
                          onClick={() => {
                            navigator.clipboard.writeText(trackedUrl);
                            notify("Link rastreado copiado!");
                          }}
                        >
                          <Copy size={11} /> Copiar /v/{activeLead.previewSlug}
                        </button>
                        <a href={trackedUrl} target="_blank" rel="noreferrer" style={{ color: "var(--tblr-primary)", fontSize: 11, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
                          Testar <ExternalLink size={11} />
                        </a>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--tblr-secondary)" }}>
                        Salve a URL da prévia manual para gerar o link rastreado <code>/v/slug</code>.
                      </span>
                    )}

                    <div>
                      {activeLead.previewImage ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--tblr-bg-surface)", border: "1px solid var(--tblr-border-color)", borderRadius: 4, padding: "2px 8px" }}>
                          <img src={activeLead.previewImage} alt="Print da prévia" style={{ width: 26, height: 18, objectFit: "cover", borderRadius: 2 }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--tblr-green)" }}>Print pronto</span>
                          <button type="button" onClick={removePreviewImage} style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--tblr-secondary)", padding: 0, display: "grid", placeItems: "center" }}>
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <label className="tblr-btn tblr-btn-sm" style={{ height: 26, fontSize: 11, borderStyle: "dashed", cursor: "pointer" }} title="Ou dê Ctrl+V em um print capturado!">
                          <Upload size={11} />
                          <span>Anexar Print (ou Ctrl+V)</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            style={{ display: "none" }}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handlePreviewImageFile(file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Follow-up Alert */}
              {followUp.due && (
                <div style={{ padding: "10px 20px", background: "var(--tblr-yellow-lt)", borderBottom: "1px solid var(--tblr-border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#92400e" }}>
                    Sem resposta há {followUp.daysSinceSent} dias — toque recomendado ({followUp.due === "DAY_5" ? "Dia +5" : "Dia +2"})
                  </span>
                  <button
                    type="button"
                    className="tblr-btn tblr-btn-sm"
                    onClick={() => loadFollowUp(followUp.due as "DAY_2" | "DAY_5")}
                  >
                    Carregar Follow-up
                  </button>
                </div>
              )}

              {/* Chat Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                {loadingChat ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--tblr-secondary)", fontSize: 13 }}>
                    Carregando conversa...
                  </div>
                ) : activeLead?.messages?.length === 0 ? (
                  <div style={{ padding: 24, background: "var(--tblr-bg-surface-secondary)", borderRadius: 6, border: "1px dashed var(--tblr-border-color)", textAlign: "center" }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                      {activeLead.previewUrl ? "Prévia pronta para envio direto!" : "Nenhuma mensagem enviada ainda"}
                    </div>
                    <p style={{ fontSize: 12, color: "var(--tblr-secondary)", margin: "0 0 14px" }}>
                      {activeLead.previewUrl
                        ? "Gere a mensagem direta já com o link rastreado e o print da página."
                        : "Cole o link da prévia acima (e opcionalmente o print) para gerar a abordagem direta."}
                    </p>
                    <button className="tblr-btn tblr-btn-primary tblr-btn-sm" onClick={requestAiDraft} disabled={generatingDraft}>
                      <Sparkles size={13} />
                      <span>{generatingDraft ? "Gerando..." : "Gerar Abordagem Direta"}</span>
                    </button>
                  </div>
                ) : (
                  activeLead?.messages?.map(msg => (
                    <div key={msg.id} className={msg.direction === "OUTBOUND" ? "tblr-chat-outbound" : "tblr-chat-inbound"}>
                      {msg.mediaUrl && (
                        <img
                          src={msg.mediaUrl}
                          alt="Print enviado"
                          style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 4, marginBottom: 8, display: "block" }}
                        />
                      )}
                      <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
                      <div style={{ fontSize: 10, opacity: 0.75, marginTop: 4, textAlign: "right" }}>
                        {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {msg.direction === "OUTBOUND" && ` · ${msg.status}`}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Composer */}
              <div style={{ padding: "14px 20px", borderTop: "1px solid var(--tblr-border-color)", background: "var(--tblr-bg-surface-secondary)", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--tblr-primary)" }}>
                      <Bot size={14} /> Abordagem Sniper
                    </span>
                    {activeLead?.previewImage && (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={includePreviewImage}
                          onChange={e => setIncludePreviewImage(e.target.checked)}
                          style={{ accentColor: "var(--tblr-primary)" }}
                        />
                        <ImageIcon size={13} />
                        <span>Enviar print junto</span>
                      </label>
                    )}
                  </div>

                  <button type="button" className="tblr-btn tblr-btn-sm" onClick={requestAiDraft} disabled={generatingDraft}>
                    <Sparkles size={12} style={{ color: "var(--tblr-primary)" }} />
                    {generatingDraft ? "Gerando..." : "Sugerir Pitch Direto"}
                  </button>
                </div>

                <form onSubmit={handleSendMessage} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <textarea
                    className="tblr-textarea"
                    rows={3}
                    value={composerText}
                    onChange={e => setComposerText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSendMessage(e);
                    }}
                    placeholder="Digite a mensagem do WhatsApp (Ctrl+Enter para enviar)..."
                  />
                  <button
                    type="submit"
                    className="tblr-btn tblr-btn-primary"
                    style={{ height: 40, padding: "0 16px", flexShrink: 0 }}
                    disabled={sendingMsg || !composerText.trim()}
                  >
                    <Send size={14} />
                    <span>{sendingMsg ? "..." : "Enviar"}</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Add Lead */}
      {showAddModal && (
        <div className="tblr-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="tblr-modal" onClick={e => e.stopPropagation()}>
            <div className="tblr-card-header">
              <h3 className="tblr-card-title">Cadastrar Lead Sniper</h3>
              <button onClick={() => setShowAddModal(false)} className="tblr-btn tblr-btn-icon tblr-btn-sm">
                <X size={14} />
              </button>
            </div>
            <form onSubmit={addLead} className="tblr-card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="tblr-subheader" style={{ display: "block", marginBottom: 4 }}>Nome da Locadora / Empresa</label>
                <input className="tblr-input" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Ex.: Locadora Forte Equipamentos" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="tblr-subheader" style={{ display: "block", marginBottom: 4 }}>Contato / Responsável</label>
                  <input className="tblr-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Comercial / Marcos" />
                </div>
                <div>
                  <label className="tblr-subheader" style={{ display: "block", marginBottom: 4 }}>WhatsApp (com DDD)</label>
                  <input className="tblr-input" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="5519999999999" />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr", gap: 10 }}>
                <div>
                  <label className="tblr-subheader" style={{ display: "block", marginBottom: 4 }}>Segmento</label>
                  <input className="tblr-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
                </div>
                <div>
                  <label className="tblr-subheader" style={{ display: "block", marginBottom: 4 }}>Nota Google</label>
                  <input className="tblr-input" value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })} placeholder="4.8" />
                </div>
                <div>
                  <label className="tblr-subheader" style={{ display: "block", marginBottom: 4 }}>Avaliações</label>
                  <input className="tblr-input" type="number" min={0} value={form.reviewsCount} onChange={e => setForm({ ...form, reviewsCount: e.target.value })} placeholder="35" />
                </div>
              </div>

              <div>
                <label className="tblr-subheader" style={{ display: "block", marginBottom: 4 }}>Cidade / Endereço</label>
                <input className="tblr-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Campinas, SP" />
              </div>

              <div>
                <label className="tblr-subheader" style={{ display: "block", marginBottom: 4 }}>Site Atual (deixe vazio se não tiver)</label>
                <input className="tblr-input" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="Vazio ou https://..." />
              </div>

              <div>
                <label className="tblr-subheader" style={{ display: "block", marginBottom: 4 }}>URL da Prévia Manual (opcional)</label>
                <input className="tblr-input" value={form.previewUrl} onChange={e => setForm({ ...form, previewUrl: e.target.value })} placeholder="https://previa.seudominio.com" />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button type="button" className="tblr-btn" onClick={() => setShowAddModal(false)}>Cancelar</button>
                <button type="submit" className="tblr-btn tblr-btn-primary" disabled={loading}>
                  {loading ? "Salvando..." : "Salvar Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Suppression */}
      {showAddSuppressionModal && (
        <div className="tblr-modal-backdrop" onClick={() => setShowAddSuppressionModal(false)}>
          <div className="tblr-modal" style={{ width: "min(440px, 100%)" }} onClick={e => e.stopPropagation()}>
            <div className="tblr-card-header">
              <h3 className="tblr-card-title">Bloquear Número (Supressão)</h3>
              <button onClick={() => setShowAddSuppressionModal(false)} className="tblr-btn tblr-btn-icon tblr-btn-sm">
                <X size={14} />
              </button>
            </div>
            <form onSubmit={addSuppression} className="tblr-card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="tblr-subheader" style={{ display: "block", marginBottom: 4 }}>WhatsApp para Bloqueio</label>
                <input className="tblr-input" required value={suppressionForm.phone} onChange={e => setSuppressionForm({ ...suppressionForm, phone: e.target.value })} placeholder="5511999999999" />
              </div>
              <div>
                <label className="tblr-subheader" style={{ display: "block", marginBottom: 4 }}>Motivo</label>
                <input className="tblr-input" required value={suppressionForm.reason} onChange={e => setSuppressionForm({ ...suppressionForm, reason: e.target.value })} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button type="button" className="tblr-btn" onClick={() => setShowAddSuppressionModal(false)}>Cancelar</button>
                <button type="submit" className="tblr-btn tblr-btn-primary" disabled={loading}>
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
