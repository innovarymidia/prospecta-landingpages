"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Clock,
  DollarSign,
  Eye,
  FilePlus,
  Globe,
  Home as HomeIcon,
  LogOut,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldBan,
  Sparkles,
  Tag,
  UserPlus,
  X,
} from "lucide-react";
import CampaignsPanel from "@/components/CampaignsPanel";
import LeadConversationPane, {
  avatarPalette,
  getInitials,
  Lead,
  LeadDetail,
  statusConfig,
} from "@/components/LeadConversationPane";
import {
  buildFollowUpSuggestion,
  buildTrackedPreviewUrl,
  getFollowUpStage,
  getLeadGoldScore,
  hasRealWebsite,
} from "@/lib/sniper";

type ActiveView = "dashboard" | "pipeline" | "chat" | "campaigns" | "suppressions";

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

export default function Home() {
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [chatFilter, setChatFilter] = useState<"ALL" | "REPLIED" | "SENT">("ALL");
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
    category: "Locação de Máquinas e Equipamentos",
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

  // Chat slide over drawer
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

  function notify(s: string) {
    setToast(s);
    setTimeout(() => setToast(""), 4500);
  }

  function navigateView(view: ActiveView, nextStage?: string) {
    setActiveView(view);
    if (nextStage !== undefined) setStageFilter(nextStage);
    if (view !== "chat") setSelectedLeadId(null);

    if (typeof window !== "undefined") {
      const params = new URLSearchParams();
      if (view !== "dashboard") params.set("view", view);
      if (view === "pipeline" && nextStage && nextStage !== "ALL") params.set("stage", nextStage);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (selectedLeadId && activeView !== "chat") setSelectedLeadId(null);
        if (showAddModal) setShowAddModal(false);
        if (showAddSuppressionModal) setShowAddSuppressionModal(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeView, selectedLeadId, showAddModal, showAddSuppressionModal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view") as ActiveView | null;
    const st = params.get("stage");
    if (v && ["dashboard", "pipeline", "chat", "campaigns", "suppressions"].includes(v)) {
      setActiveView(v);
    }
    if (st) setStageFilter(st);
  }, []);

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

  useEffect(() => {
    if (activeView === "chat" && !selectedLeadId && leads.length > 0) {
      const preferred =
        leads.find(l => ["REPLIED", "QUALIFIED", "MEETING", "WON"].includes(l.status)) || leads[0];
      if (preferred) openConversation(preferred.id);
    }
  }, [activeView, leads, selectedLeadId]);

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
    notify(stage === "DAY_5" ? "Follow up de encerramento (Dia 5) carregado!" : "Follow up de utilidade (Dia 2) carregado!");
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

      notify(data.hasMedia ? "Print da prévia e mensagem enviados para a fila!" : "Mensagem enviada para a fila do WhatsApp!");
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
        category: "Locação de Máquinas e Equipamentos",
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

  // Métricas Reais
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
  const viewsPct = sentCount > 0 ? Math.min(100, Math.round((viewedLeadsCount / sentCount) * 100)) : 0;
  const metaPct = Math.min(100, Math.round((wonCount / 10) * 100));
  const monthlyRevenue = wonCount * 1200;

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

  const chatContacts = useMemo(() => {
    return leads.filter(l => {
      const matchesQuery = `${l.name} ${l.company || ""} ${l.phone} ${l.category || ""} ${l.address || ""}`
        .toLowerCase()
        .includes(query.toLowerCase());
      if (!matchesQuery) return false;
      if (chatFilter === "REPLIED") return ["REPLIED", "QUALIFIED", "MEETING", "WON"].includes(l.status);
      if (chatFilter === "SENT") return l.status === "SENT" || Boolean(l.initialSentAt);
      return true;
    });
  }, [leads, query, chatFilter]);

  const conversationPaneProps = {
    lead: activeLead,
    loading: loadingChat,
    trackedUrl: getTrackedLink(activeLead),
    previewUrlInput,
    onPreviewUrlInputChange: setPreviewUrlInput,
    savingPreview,
    onSavePreviewUrl: savePreviewUrl,
    onCopyTrackedUrl: () => {
      const link = getTrackedLink(activeLead);
      if (link) {
        navigator.clipboard.writeText(link);
        notify("Link rastreado copiado!");
      }
    },
    onUploadPreviewImage: handlePreviewImageFile,
    onRemovePreviewImage: removePreviewImage,
    updatingStatus,
    onUpdateStatus: updateStatus,
    generatingDraft,
    onRequestAiDraft: requestAiDraft,
    onLoadFollowUp: loadFollowUp,
    composerText,
    onComposerTextChange: setComposerText,
    includePreviewImage,
    onIncludePreviewImageChange: setIncludePreviewImage,
    sendingMsg,
    onSendMessage: handleSendMessage,
    onPasteImage: handleDrawerPaste,
  };

  return (
    <div className="fd-main-wrapper">
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#1c2d41",
            color: "#ffffff",
            padding: "12px 18px",
            borderRadius: 60,
            fontWeight: 500,
            fontSize: 13,
            boxShadow: "0 10px 25px rgba(28, 45, 65, 0.25)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Sparkles size={15} style={{ color: "#01caf1" }} />
          {toast}
        </div>
      )}

      {/* Topbar Header (Exact FreeDash 80px Fixed Header) */}
      <header className="fd-topbar">
        <div className="fd-navbar-header">
          <a
            href="/"
            onClick={e => {
              e.preventDefault();
              navigateView("dashboard", "ALL");
            }}
            className="fd-navbar-brand"
          >
            <svg width="32" height="32" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M8.94981 23.8836C17.1535 22.0444 21.8606 18.63 23.1886 17.1527C25.1125 19.7791 23.5006 24.7713 22.4542 26.9391C19.9436 30.6278 9.57181 33.6852 9.35294 33.8456C5.33665 36.9488 9.0603 41.9613 9.23039 42.1733C9.23088 42.1734 9.23137 42.1735 9.23186 42.1737C9.23842 42.1826 9.23765 42.1823 9.23039 42.1733C5.05462 41.0619 2.48669 36.4087 1.72464 34.2207C0.0360044 28.059 5.83782 24.7619 8.94981 23.8836Z"
                fill="#00B0FF"
              />
              <path
                d="M19.2543 18.6806C5.84573 22.0456 2.3459 26.3581 2.27206 28.0937C0.567018 20.2601 3.11893 17.16 4.67094 15.0703C5.75714 13.0639 13.9224 10.8693 17.506 9.86971C23.1659 8.41418 27.6286 5.09151 29.5156 3.76525C32.8828 13.1366 24.0777 17.6135 19.2543 18.6806Z"
                fill="#615DFF"
              />
            </svg>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#1c2d41", letterSpacing: "-0.02em" }}>
              Prospecta
            </span>
          </a>
        </div>

        <div className="fd-navbar-collapse">
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <button
              className="fd-btn"
              style={{ border: 0, background: "transparent", padding: "0 6px", position: "relative" }}
              onClick={() => navigateView("pipeline", followUpCount > 0 ? "FOLLOWUP" : "ALL")}
              title="Pendências de Follow up e Views"
            >
              <Bell size={20} style={{ color: "#7c8798" }} />
              <span
                className="fd-badge-pill primary"
                style={{ position: "absolute", top: -2, right: -4, fontSize: 10, padding: "2px 6px", lineHeight: 1 }}
              >
                {followUpCount + viewedLeadsCount}
              </span>
            </button>

            <select
              className="fd-pill-select"
              value={stageFilter}
              onChange={e => navigateView("pipeline", e.target.value)}
              aria-label="Filtro rápido de etapa"
            >
              <option value="ALL">Todas as Etapas</option>
              <option value="GOLD">Leads Ouro (Sem Site)</option>
              <option value="DEMO">Prévias Prontas</option>
              <option value="SENT">Prévias Enviadas</option>
              <option value="FOLLOWUP">Follow up Pendente</option>
              <option value="REPLIED">Em Negociação</option>
              <option value="WON">Clientes Fechados</option>
            </select>

            <span
              className={`fd-badge-pill ${systemStatus?.automationEnabled ? "success" : "warning"}`}
              style={{ fontSize: 12 }}
            >
              {systemStatus?.automationEnabled ? "WhatsApp Conectado" : "Envios Pausados"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div className="fd-customize-input">
              <input
                className="fd-pill-input"
                type="search"
                placeholder="Pesquisar empresa"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <Search
                size={18}
                style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: "#7c8798" }}
              />
            </div>

            <button
              onClick={() => loadLeads()}
              className="fd-btn"
              style={{ border: 0, background: "transparent", padding: 6 }}
              title="Atualizar dados"
            >
              <RefreshCw size={18} style={{ color: "#7c8798" }} />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img
                src="/freedash/profile-pic.jpg"
                alt="Operador"
                width={40}
                height={40}
                style={{ borderRadius: "50%", objectFit: "cover" }}
              />
              <div style={{ lineHeight: 1.2 }}>
                <span style={{ fontSize: 13, color: "#7c8798" }}>Olá, </span>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#1c2d41" }}>Innovary</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Left Sidebar (FreeDash Skin6 with Signature Purple Gradient Selected Pill) */}
      <aside className="fd-left-sidebar">
        <nav className="fd-sidebar-nav">
          <ul className="fd-sidebar-ul">
            <li className={`fd-sidebar-item ${activeView === "dashboard" ? "selected" : ""}`}>
              <button
                type="button"
                className="fd-sidebar-link"
                onClick={() => navigateView("dashboard", "ALL")}
              >
                <HomeIcon />
                <span className="fd-hide-menu">Dashboard</span>
              </button>
            </li>

            <li className="fd-list-divider" />
            <li className="fd-nav-small-cap">
              <span className="fd-hide-menu">Prospecção</span>
            </li>

            <li className={`fd-sidebar-item ${activeView === "pipeline" && stageFilter === "GOLD" ? "selected" : ""}`}>
              <button
                type="button"
                className="fd-sidebar-link"
                onClick={() => navigateView("pipeline", "GOLD")}
              >
                <Tag />
                <span className="fd-hide-menu">Leads Ouro</span>
                <span className="fd-nav-pill-count">{goldCount}</span>
              </button>
            </li>

            <li className={`fd-sidebar-item ${activeView === "pipeline" && stageFilter === "DEMO" ? "selected" : ""}`}>
              <button
                type="button"
                className="fd-sidebar-link"
                onClick={() => navigateView("pipeline", "DEMO")}
              >
                <Eye />
                <span className="fd-hide-menu">Prévias Prontas</span>
                <span className="fd-nav-pill-count">{demoCount}</span>
              </button>
            </li>

            <li className={`fd-sidebar-item ${activeView === "pipeline" && stageFilter === "FOLLOWUP" ? "selected" : ""}`}>
              <button
                type="button"
                className="fd-sidebar-link"
                onClick={() => navigateView("pipeline", "FOLLOWUP")}
              >
                <Clock />
                <span className="fd-hide-menu">Follow up 2d e 5d</span>
                {followUpCount > 0 && <span className="fd-nav-pill-count">{followUpCount}</span>}
              </button>
            </li>

            <li className={`fd-sidebar-item ${activeView === "chat" ? "selected" : ""}`}>
              <button
                type="button"
                className="fd-sidebar-link"
                onClick={() => navigateView("chat")}
              >
                <MessageSquare />
                <span className="fd-hide-menu">Chat WhatsApp</span>
                <span className="fd-nav-pill-count">{repliedCount}</span>
              </button>
            </li>

            <li className="fd-list-divider" />
            <li className="fd-nav-small-cap">
              <span className="fd-hide-menu">Captação</span>
            </li>

            <li className={`fd-sidebar-item ${activeView === "campaigns" ? "selected" : ""}`}>
              <button
                type="button"
                className="fd-sidebar-link"
                onClick={() => navigateView("campaigns")}
              >
                <MapPin />
                <span className="fd-hide-menu">Buscas no Maps</span>
              </button>
            </li>

            <li className={`fd-sidebar-item ${activeView === "suppressions" ? "selected" : ""}`}>
              <button
                type="button"
                className="fd-sidebar-link"
                onClick={() => navigateView("suppressions")}
              >
                <ShieldBan />
                <span className="fd-hide-menu">Supressão</span>
                <span className="fd-nav-pill-count">{suppressions.length}</span>
              </button>
            </li>

            <li className="fd-list-divider" />
            <li className="fd-nav-small-cap">
              <span className="fd-hide-menu">Sistema</span>
            </li>

            <li className="fd-sidebar-item">
              <button
                type="button"
                className="fd-sidebar-link"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  location.assign("/login");
                }}
              >
                <LogOut />
                <span className="fd-hide-menu">Sair do Painel</span>
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Main Page Wrapper */}
      <div className="fd-page-wrapper">
        {/* Breadcrumb Header */}
        <div className="fd-page-breadcrumb">
          <div>
            <h3 className="fd-page-title">
              {activeView === "dashboard"
                ? "Bom dia, Operação Locadoras B2B!"
                : activeView === "pipeline"
                  ? stageFilter === "GOLD"
                    ? "Leads Ouro sem Site"
                    : stageFilter === "DEMO"
                      ? "Prévias Prontas"
                      : stageFilter === "FOLLOWUP"
                        ? "Follow up 2d e 5d"
                        : "Pipeline de Prospecção"
                  : activeView === "chat"
                    ? "Chat WhatsApp"
                    : activeView === "campaigns"
                      ? "Buscas no Maps e Campanhas"
                      : "Lista de Supressão"}
            </h3>
            <div className="fd-breadcrumb">
              <span>
                {activeView === "dashboard"
                  ? "Dashboard"
                  : activeView === "pipeline" || activeView === "chat"
                    ? "Prospecção"
                    : "Captação"}
              </span>
              <span>/</span>
              <span>
                {activeView === "dashboard"
                  ? "Visão Geral"
                  : activeView === "pipeline"
                    ? "Pipeline"
                    : activeView === "chat"
                      ? "Atendimento WhatsApp"
                      : activeView === "campaigns"
                        ? "Campanhas"
                        : "Bloqueios"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              onClick={() => navigateView("campaigns")}
              className={`fd-btn fd-btn-rounded ${activeView === "campaigns" ? "fd-btn-primary" : ""}`}
            >
              <MapPin size={15} />
              <span>Buscas Maps</span>
            </button>
            <button className="fd-btn fd-btn-primary fd-btn-rounded" onClick={() => setShowAddModal(true)}>
              <Plus size={15} />
              <span>Novo Lead</span>
            </button>
          </div>
        </div>

        {/* Main Fluid Container */}
        <div className="fd-container-fluid">
          {activeView === "dashboard" && (
            <>
              {/* Row 1: FreeDash 4 KPI Group */}
              <div className="fd-kpi-row">
                <div className="fd-kpi-cell">
                  <div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <h2 className="fd-kpi-value">{goldCount}</h2>
                      <span className="fd-badge-pill primary">{goldPct}%</span>
                    </div>
                    <h6 className="fd-kpi-label">Leads Ouro sem site</h6>
                  </div>
                  <UserPlus size={26} style={{ color: "#b8c3d5" }} />
                </div>

                <div className="fd-kpi-cell">
                  <div>
                    <h2 className="fd-kpi-value">
                      <sup className="fd-sup-currency">R$</sup>
                      {monthlyRevenue.toLocaleString("pt-BR")}
                    </h2>
                    <h6 className="fd-kpi-label">Faturamento do Mês (Meta 12k)</h6>
                  </div>
                  <DollarSign size={26} style={{ color: "#b8c3d5" }} />
                </div>

                <div className="fd-kpi-cell">
                  <div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <h2 className="fd-kpi-value">{demoCount}</h2>
                      <span className="fd-badge-pill danger">{sentCount} enviadas</span>
                    </div>
                    <h6 className="fd-kpi-label">Prévias Prontas</h6>
                  </div>
                  <FilePlus size={26} style={{ color: "#b8c3d5" }} />
                </div>

                <div className="fd-kpi-cell">
                  <div>
                    <h2 className="fd-kpi-value">{totalPreviewViews}</h2>
                    <h6 className="fd-kpi-label">Cliques Reais em Prévias</h6>
                  </div>
                  <Globe size={26} style={{ color: "#b8c3d5" }} />
                </div>
              </div>

              {/* Row 2: 3 Cards Sales Charts Section (Donut + Bar Chart + Progress Bars) */}
              <div className="fd-charts-3col">
                {/* Card 1: Total do Funil (C3 Donut Style) */}
                <div className="fd-card">
                  <div className="fd-card-body">
                    <h4 className="fd-card-title">Total do Funil</h4>

                    <div style={{ display: "flex", justifyContent: "center", margin: "24px 0 28px" }}>
                      <div style={{ position: "relative", width: 170, height: 170 }}>
                        <svg width="170" height="170" viewBox="0 0 170 170">
                          <circle cx="85" cy="85" r="64" fill="none" stroke="#edf2f6" strokeWidth="18" />
                          <circle
                            cx="85"
                            cy="85"
                            r="64"
                            fill="none"
                            stroke="#5f76e8"
                            strokeWidth="18"
                            strokeDasharray="170 402"
                            strokeDashoffset="0"
                            transform="rotate(-90 85 85)"
                          />
                          <circle
                            cx="85"
                            cy="85"
                            r="64"
                            fill="none"
                            stroke="#ff4f70"
                            strokeWidth="18"
                            strokeDasharray="110 402"
                            strokeDashoffset="-170"
                            transform="rotate(-90 85 85)"
                          />
                          <circle
                            cx="85"
                            cy="85"
                            r="64"
                            fill="none"
                            stroke="#01caf1"
                            strokeWidth="18"
                            strokeDasharray="75 402"
                            strokeDashoffset="-280"
                            transform="rotate(-90 85 85)"
                          />
                        </svg>
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <span style={{ fontSize: 13, color: "#7c8798", fontWeight: 400 }}>Base Total</span>
                          <strong style={{ fontSize: 24, color: "#1c2d41", fontWeight: 500 }}>{totalLeads}</strong>
                        </div>
                      </div>
                    </div>

                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14, fontSize: 14 }}>
                      <li style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#5f76e8", marginRight: 10 }} />
                        <span>Prévias Prontas</span>
                        <span style={{ marginLeft: "auto", color: "#1c2d41", fontWeight: 500 }}>{demoCount}</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ff4f70", marginRight: 10 }} />
                        <span>Aguardando Follow up</span>
                        <span style={{ marginLeft: "auto", color: "#1c2d41", fontWeight: 500 }}>{followUpCount}</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#01caf1", marginRight: 10 }} />
                        <span>Em Negociação</span>
                        <span style={{ marginLeft: "auto", color: "#1c2d41", fontWeight: 500 }}>{repliedCount}</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Card 2: Meta e Produtividade (Chartist Bar Style) */}
                <div className="fd-card">
                  <div className="fd-card-body" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    <h4 className="fd-card-title">Meta de Faturamento</h4>

                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingTop: 18 }}>
                      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", height: 220, borderBottom: "1px dashed #edf2f9", paddingBottom: 8, gap: 14 }}>
                        {[
                          { label: "Ouro", val: Math.max(15, Math.min(100, goldCount * 10 || 28)), raw: goldCount },
                          { label: "Prévia", val: Math.max(15, Math.min(100, demoCount * 15 || 42)), raw: demoCount },
                          { label: "Envios", val: Math.max(15, Math.min(100, sentCount * 12 || 35)), raw: sentCount },
                          { label: "Views", val: Math.max(15, Math.min(100, totalPreviewViews * 12 || 68)), raw: totalPreviewViews },
                          { label: "Chat", val: Math.max(15, Math.min(100, repliedCount * 15 || 52)), raw: repliedCount },
                          { label: "Meta", val: Math.max(15, metaPct || 85), raw: `${wonCount}/10` },
                        ].map(bar => (
                          <div key={bar.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                            <span style={{ fontSize: 11, color: "#7c8798", marginBottom: 6 }}>{bar.raw}</span>
                            <div
                              style={{
                                width: 12,
                                height: `${bar.val}%`,
                                background: "#5f76e8",
                                borderRadius: 2,
                                transition: "height 0.3s ease",
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, fontSize: 12, color: "#b8c3d5" }}>
                        <span>Ouro</span><span>Prévia</span><span>Envios</span><span>Views</span><span>Chat</span><span>Meta</span>
                      </div>
                    </div>

                    <div style={{ textAlign: "center", marginTop: 22, fontSize: 13, fontStyle: "italic", color: "#7c8798" }}>
                      Progresso para 10 sites no mês ({metaPct}%)
                    </div>
                  </div>
                </div>

                {/* Card 3: Distribuição por Regiões e Etapas (Exact Progress Bars) */}
                <div className="fd-card">
                  <div className="fd-card-body">
                    <h4 className="fd-card-title" style={{ marginBottom: 20 }}>Prospecção por Região</h4>

                    <div style={{ background: "#f9fbfd", borderRadius: 4, padding: "18px 16px", marginBottom: 26, textAlign: "center", border: "1px solid #edf2f9" }}>
                      <div style={{ fontSize: 12, color: "#7c8798", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Foco Ativo Nacional
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 500, color: "#1c2d41", marginTop: 4 }}>
                        5 Praças de Locadoras B2B
                      </div>
                      <div style={{ fontSize: 12, color: "#5f76e8", marginTop: 4 }}>
                        Taxa de abertura atual: {viewsPct}%
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                      {[
                        { label: "Campinas SP", pct: 34, color: "#5f76e8" },
                        { label: "Grande SP", pct: 28, color: "#ff4f70" },
                        { label: "Curitiba PR", pct: 20, color: "#01caf1" },
                        { label: "Belo Horizonte", pct: 18, color: "#22ca80" },
                      ].map(region => (
                        <div key={region.label} style={{ display: "grid", gridTemplateColumns: "105px 1fr 40px", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 14, color: "#7c8798", textAlign: "right" }}>{region.label}</span>
                          <div className="fd-progress">
                            <div className="fd-progress-bar" style={{ width: `${region.pct * 2.5}%`, background: region.color }} />
                          </div>
                          <span style={{ fontSize: 14, color: "#1c2d41", fontWeight: 500, textAlign: "right" }}>{region.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: Earning Statistics Area Chart (8 cols) + Recent Activity Timeline (4 cols) */}
              <div className="fd-charts-2col">
                <div className="fd-card">
                  <div className="fd-card-body">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <h4 className="fd-card-title" style={{ margin: 0 }}>Evolução de Cliques e Conversas</h4>
                      <span className="fd-badge-pill primary">{viewedLeadsCount} empresas abriram</span>
                    </div>

                    <div style={{ width: "100%", height: 260, paddingTop: 10 }}>
                      <svg viewBox="0 0 640 220" style={{ width: "100%", height: "100%", overflow: "visible" }}>
                        <defs>
                          <linearGradient id="fdAreaGradient" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0%" stopColor="rgba(255, 255, 255, 0)" />
                            <stop offset="100%" stopColor="rgba(95, 118, 232, 0.28)" />
                          </linearGradient>
                        </defs>

                        {/* Grid lines */}
                        {[30, 80, 130, 180].map((y, idx) => (
                          <g key={y}>
                            <line x1="36" y1={y} x2="620" y2={y} stroke="#edf2f9" strokeDasharray="3 3" />
                            <text x="6" y={y + 4} fill="#b8c3d5" fontSize="11">
                              {[25, 18, 10, 4][idx]}
                            </text>
                          </g>
                        ))}

                        {/* Smooth area curve */}
                        <path
                          d="M 40 165 C 100 165, 110 155, 140 150 C 185 140, 200 110, 245 110 C 290 110, 310 65, 355 65 C 400 65, 420 120, 465 115 C 510 110, 530 45, 575 45 L 615 105 L 615 190 L 40 190 Z"
                          fill="url(#fdAreaGradient)"
                        />
                        <path
                          d="M 40 165 C 100 165, 110 155, 140 150 C 185 140, 200 110, 245 110 C 290 110, 310 65, 355 65 C 400 65, 420 120, 465 115 C 510 110, 530 45, 575 45 L 615 105"
                          fill="none"
                          stroke="#5f76e8"
                          strokeWidth="3"
                        />

                        {[
                          [40, 165],
                          [140, 150],
                          [245, 110],
                          [355, 65],
                          [465, 115],
                          [575, 45],
                          [615, 105],
                        ].map(([cx, cy], i) => (
                          <circle key={i} cx={cx} cy={cy} r="5" fill="#ffffff" stroke="#5f76e8" strokeWidth="3" />
                        ))}

                        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d, i) => (
                          <text key={d} x={40 + i * 95} y="210" fill="#b8c3d5" fontSize="12" textAnchor="middle">
                            {d}
                          </text>
                        ))}
                      </svg>
                    </div>

                    <div style={{ textAlign: "center", fontSize: 13, fontStyle: "italic", color: "#7c8798", marginTop: 8 }}>
                      Resultados acompanhados no mês atual
                    </div>
                  </div>
                </div>

                {/* Recent Activity Timeline */}
                <div className="fd-card">
                  <div className="fd-card-body">
                    <h4 className="fd-card-title" style={{ marginBottom: 22 }}>Atividade Recente</h4>

                    <div>
                      <div className="fd-activity-line">
                        <span className="fd-btn-circle fd-activity-circle" style={{ background: "#01caf1" }}>
                          <Eye size={18} />
                        </span>
                        <h5 style={{ fontSize: 15, fontWeight: 500, color: "#1c2d41", margin: "0 0 4px" }}>
                          Rastreio /v/slug ativo
                        </h5>
                        <p style={{ fontSize: 13, color: "#7c8798", margin: "0 0 4px" }}>
                          {totalPreviewViews > 0
                            ? `${totalPreviewViews} aberturas humanas contabilizadas em ${viewedLeadsCount} empresas.`
                            : "Cole a URL da prévia manual no lead para gerar seu link rastreado."}
                        </p>
                        <span style={{ fontSize: 12, color: "#b8c3d5" }}>Em tempo real</span>
                      </div>

                      <div className="fd-activity-line">
                        <span className="fd-btn-circle fd-activity-circle" style={{ background: "#ff4f70" }}>
                          <MessageSquare size={18} />
                        </span>
                        <h5 style={{ fontSize: 15, fontWeight: 500, color: "#1c2d41", margin: "0 0 4px" }}>
                          Cadência de Follow up
                        </h5>
                        <p style={{ fontSize: 13, color: "#7c8798", margin: "0 0 4px" }}>
                          {followUpCount > 0
                            ? `${followUpCount} empresas enviadas aguardando toque de 2 ou 5 dias.`
                            : "Nenhum follow up pendente no momento."}
                        </p>
                        <span style={{ fontSize: 12, color: "#b8c3d5" }}>Regras 2d e 5d</span>
                      </div>

                      <div className="fd-activity-line">
                        <span className="fd-btn-circle fd-activity-circle" style={{ background: "#5f76e8" }}>
                          <Bell size={18} />
                        </span>
                        <h5 style={{ fontSize: 15, fontWeight: 500, color: "#1c2d41", margin: "0 0 4px" }}>
                          KeepAlive Evolution API
                        </h5>
                        <p style={{ fontSize: 13, color: "#7c8798", margin: "0 0 6px" }}>
                          Monitoramento de 60 segundos ativo no Render para manter sessões sempre prontas.
                        </p>
                        <button
                          type="button"
                          onClick={() => navigateView("campaigns")}
                          style={{
                            fontSize: 13,
                            color: "#01caf1",
                            border: 0,
                            borderBottom: "1px solid #01caf1",
                            padding: "0 0 2px",
                            background: "transparent",
                            cursor: "pointer",
                          }}
                        >
                          Gerenciar buscas no Maps
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {(activeView === "dashboard" || activeView === "pipeline") && (
              <div className="fd-card">
                <div className="fd-card-body">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
                    <h4 className="fd-card-title" style={{ margin: 0 }}>Pipeline de Empresas (Locadoras B2B)</h4>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[
                        { id: "ALL", label: "Todos" },
                        { id: "GOLD", label: "Ouro" },
                        { id: "DEMO", label: "Prévia" },
                        { id: "SENT", label: "Enviados" },
                        { id: "FOLLOWUP", label: `Follow up${followUpCount ? ` (${followUpCount})` : ""}` },
                        { id: "REPLIED", label: "Conversa" },
                        { id: "WON", label: "Fechados" },
                      ].map(st => (
                        <button
                          key={st.id}
                          onClick={() => setStageFilter(st.id)}
                          className={`fd-btn fd-btn-sm fd-btn-rounded ${stageFilter === st.id ? "fd-btn-primary" : ""}`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table className="fd-table">
                      <thead>
                        <tr>
                          <th>Empresa e Contato</th>
                          <th>Site e Maps</th>
                          <th>WhatsApp</th>
                          <th style={{ textAlign: "center" }}>Status</th>
                          <th style={{ textAlign: "center" }}>Views</th>
                          <th>Etapa</th>
                          <th style={{ textAlign: "right" }}>Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ textAlign: "center", padding: "38px 16px", color: "#7c8798" }}>
                              Nenhum lead encontrado neste filtro. Cadastre em <strong>Novo Lead</strong> ou configure uma busca no Maps.
                            </td>
                          </tr>
                        ) : (
                          filtered.slice(0, activeView === "pipeline" ? 100 : 20).map((l, idx) => {
                            const conf = statusConfig[l.status] || { label: l.status, color: "#b8c3d5" };
                            const gold = getLeadGoldScore(l);
                            const followUp = getFollowUpStage(l);
                            const realSite = hasRealWebsite(l.website);
                            const displayName = l.company || l.name;
                            const avColor = avatarPalette[idx % avatarPalette.length];

                            return (
                              <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => openConversation(l.id)}>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <span className="fd-avatar-circle" style={{ background: avColor }}>
                                      {getInitials(displayName)}
                                    </span>
                                    <div>
                                      <div style={{ fontSize: 15, fontWeight: 500, color: "#1c2d41", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                        <span>{displayName}</span>
                                        {gold.isGold && <span className="fd-badge-pill warning">Ouro</span>}
                                        {l.previewUrl && <span className="fd-badge-pill primary">Prévia</span>}
                                      </div>
                                      <span style={{ fontSize: 13, color: "#7c8798" }}>{l.address || l.category || l.name}</span>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <div style={{ fontSize: 13, color: realSite ? "#4f5467" : "#ff4f70", fontWeight: realSite ? 400 : 500 }}>
                                    {realSite && l.website ? l.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 26) : "Sem site próprio"}
                                  </div>
                                  {typeof l.rating === "number" && (
                                    <div style={{ fontSize: 12, color: "#fdc16a", fontWeight: 500, marginTop: 2 }}>
                                      ★ {l.rating.toFixed(1)} ({l.reviewsCount ?? 0} avaliações)
                                    </div>
                                  )}
                                </td>
                                <td style={{ fontWeight: 500, color: "#1c2d41" }}>{l.phone}</td>
                                <td style={{ textAlign: "center" }}>
                                  <span className="fd-status-dot" style={{ background: conf.color }} title={conf.label} />
                                </td>
                                <td style={{ textAlign: "center", fontWeight: 500, color: "#1c2d41" }}>
                                  {l.previewViews ?? 0}
                                </td>
                                <td>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: "#1c2d41" }}>{conf.label}</span>
                                    {followUp.due && (
                                      <span className="fd-badge-pill warning">
                                        Follow up {followUp.due === "DAY_5" ? "5d" : "2d"}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <button
                                    className="fd-btn fd-btn-sm fd-btn-rounded fd-btn-primary"
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
                </div>
              </div>
          )}

          {activeView === "chat" && (
            <div className="fd-chat-workspace">
              <div className="fd-chat-contacts">
                <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #edf2f9" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <h4 className="fd-card-title" style={{ margin: 0, fontSize: 16 }}>Conversas</h4>
                    <span className="fd-badge-pill primary">{chatContacts.length}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { id: "ALL", label: "Todos" },
                      { id: "REPLIED", label: "Respondeu" },
                      { id: "SENT", label: "Enviados" },
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setChatFilter(f.id as "ALL" | "REPLIED" | "SENT")}
                        className={`fd-btn fd-btn-sm fd-btn-rounded ${chatFilter === f.id ? "fd-btn-primary" : ""}`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: "auto" }}>
                  {chatContacts.length === 0 ? (
                    <div style={{ padding: 28, textAlign: "center", fontSize: 13, color: "#7c8798" }}>
                      Nenhuma empresa encontrada neste filtro.
                    </div>
                  ) : (
                    chatContacts.map((l, idx) => {
                      const displayName = l.company || l.name;
                      const conf = statusConfig[l.status] || { label: l.status, color: "#b8c3d5" };
                      const lastMsg = l.messages?.[0]?.body;
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => openConversation(l.id)}
                          className={`fd-chat-contact-item ${selectedLeadId === l.id ? "active" : ""}`}
                        >
                          <span
                            className="fd-avatar-circle"
                            style={{ background: avatarPalette[idx % avatarPalette.length], width: 40, height: 40, fontSize: 13 }}
                          >
                            {getInitials(displayName)}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                              <span
                                style={{
                                  fontSize: 14,
                                  fontWeight: 500,
                                  color: "#1c2d41",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {displayName}
                              </span>
                              <span className="fd-status-dot" style={{ background: conf.color, flexShrink: 0 }} title={conf.label} />
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "#7c8798",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                marginTop: 3,
                              }}
                            >
                              {lastMsg || l.phone}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                              <span style={{ fontSize: 11, color: "#7c8798" }}>{conf.label}</span>
                              {(l.previewViews ?? 0) > 0 && (
                                <span className="fd-badge-pill primary" style={{ fontSize: 10, padding: "1px 6px" }}>
                                  {l.previewViews} views
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="fd-chat-pane">
                <LeadConversationPane {...conversationPaneProps} />
              </div>
            </div>
          )}

          {activeView === "campaigns" && <CampaignsPanel onNotify={notify} />}

          {activeView === "suppressions" && (
            <div className="fd-card">
              <div className="fd-card-body">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <h4 className="fd-card-title" style={{ margin: 0 }}>Números Bloqueados e Opt out</h4>
                  <button className="fd-btn fd-btn-primary fd-btn-rounded fd-btn-sm" onClick={() => setShowAddSuppressionModal(true)}>
                    <Plus size={14} /> Adicionar Bloqueio
                  </button>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table className="fd-table">
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
                          <td colSpan={4} style={{ textAlign: "center", padding: "40px 16px", color: "#7c8798" }}>
                            Nenhum telefone na lista de supressão.
                          </td>
                        </tr>
                      ) : (
                        suppressions.map(s => (
                          <tr key={s.phone}>
                            <td style={{ fontWeight: 500, color: "#1c2d41" }}>{s.phone}</td>
                            <td><span className="fd-badge-pill danger">{s.reason}</span></td>
                            <td>{new Date(s.createdAt).toLocaleDateString("pt-BR")}</td>
                            <td style={{ textAlign: "right" }}>
                              <button className="fd-btn fd-btn-sm fd-btn-rounded" onClick={() => unblockPhone(s.phone)}>
                                Liberar
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="fd-footer">
          Prospecta WA para Prospecção B2B de Alta Conversão.
        </footer>
      </div>

      {/* Offcanvas Drawer WhatsApp e Prévia Sniper */}
      {selectedLeadId && activeView !== "chat" && (
        <div className="fd-drawer-backdrop" onClick={() => setSelectedLeadId(null)}>
          <div className="fd-drawer" onClick={e => e.stopPropagation()}>
            <LeadConversationPane {...conversationPaneProps} onClose={() => setSelectedLeadId(null)} />
          </div>
        </div>
      )}

      {/* Modal Add Lead */}
      {showAddModal && (
        <div className="fd-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="fd-modal" onClick={e => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #edf2f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 18, fontWeight: 500, color: "#1c2d41", margin: 0 }}>Cadastrar Lead Sniper</h3>
              <button onClick={() => setShowAddModal(false)} className="fd-btn fd-btn-sm" style={{ padding: "0 8px" }}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={addLead} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>Nome da Locadora ou Empresa</label>
                <input className="fd-input" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Ex.: Locadora Forte Equipamentos" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>Contato ou Responsável</label>
                  <input className="fd-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Comercial" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>WhatsApp (com DDD)</label>
                  <input className="fd-input" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="5519999999999" />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>Segmento</label>
                  <input className="fd-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>Nota Google</label>
                  <input className="fd-input" value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })} placeholder="4.8" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>Avaliações</label>
                  <input className="fd-input" type="number" min={0} value={form.reviewsCount} onChange={e => setForm({ ...form, reviewsCount: e.target.value })} placeholder="35" />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>Cidade e Endereço</label>
                <input className="fd-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Campinas, SP" />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>Site Atual (deixe vazio se não tiver)</label>
                <input className="fd-input" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="Vazio ou https://..." />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>URL da Prévia Manual (opcional)</label>
                <input className="fd-input" value={form.previewUrl} onChange={e => setForm({ ...form, previewUrl: e.target.value })} placeholder="https://previa.seudominio.com" />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" className="fd-btn fd-btn-rounded" onClick={() => setShowAddModal(false)}>Cancelar</button>
                <button type="submit" className="fd-btn fd-btn-primary fd-btn-rounded" disabled={loading}>
                  {loading ? "Salvando..." : "Salvar Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Suppression */}
      {showAddSuppressionModal && (
        <div className="fd-modal-backdrop" onClick={() => setShowAddSuppressionModal(false)}>
          <div className="fd-modal" style={{ width: "min(440px, 100%)" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #edf2f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 18, fontWeight: 500, color: "#1c2d41", margin: 0 }}>Bloquear Número</h3>
              <button onClick={() => setShowAddSuppressionModal(false)} className="fd-btn fd-btn-sm" style={{ padding: "0 8px" }}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={addSuppression} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>WhatsApp para Bloqueio</label>
                <input className="fd-input" required value={suppressionForm.phone} onChange={e => setSuppressionForm({ ...suppressionForm, phone: e.target.value })} placeholder="5511999999999" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#1c2d41", marginBottom: 4 }}>Motivo</label>
                <input className="fd-input" required value={suppressionForm.reason} onChange={e => setSuppressionForm({ ...suppressionForm, reason: e.target.value })} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" className="fd-btn fd-btn-rounded" onClick={() => setShowAddSuppressionModal(false)}>Cancelar</button>
                <button type="submit" className="fd-btn fd-btn-primary fd-btn-rounded" disabled={loading}>
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
