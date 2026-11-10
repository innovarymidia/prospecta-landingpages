"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Building2,
  Home as HomeIcon,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldBan,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import CampaignsPanel from "@/components/CampaignsPanel";
import DashboardOverview, { SystemStatus } from "@/components/DashboardOverview";
import LeadConversationPane, {
  avatarPalette,
  getInitials,
  Lead,
  LeadDetail,
  statusConfig,
} from "@/components/LeadConversationPane";
import { buildFallbackApproach } from "@/lib/ai";
import {
  buildFollowUpSuggestion,
  buildTrackedPreviewUrl,
  extractRegionLabel,
  getFollowUpStage,
  getLeadGoldScore,
  hasRealWebsite,
  sortHotLeads,
} from "@/lib/sniper";

type ActiveView = "dashboard" | "pipeline" | "chat" | "campaigns" | "suppressions";

type Suppression = {
  phone: string;
  reason: string;
  createdAt: string;
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
  const [chatFilter, setChatFilter] = useState<"ALL" | "WAIT_HUMAN" | "REPLIED" | "SENT">("ALL");
  const [priorityTab, setPriorityTab] = useState<"HOT" | "HUMAN" | "FOLLOWUP">("HOT");
  const [visibleCount, setVisibleCount] = useState<number>(25);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileChatActive, setMobileChatActive] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

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
  const [togglingMessaging, setTogglingMessaging] = useState(false);

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

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(current);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("prospecta_theme", next);
    } catch {}
  }

  async function toggleMessagingEnabled(nextValue: boolean) {
    setTogglingMessaging(true);
    try {
      const res = await fetch("/api/system/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messagingEnabled: nextValue }),
      });
      if (!res.ok) throw new Error("Falha ao alterar envios");
      const data = await res.json();
      setSystemStatus(prev => (prev ? { ...prev, automationEnabled: Boolean(data.automationEnabled) } : prev));
      notify(
        data.automationEnabled
          ? "Envios de WhatsApp retomados! Captura de leads continua ativa."
          : "Envios de WhatsApp pausados. A captura de leads no Maps continua normalmente."
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao alterar envios");
    } finally {
      setTogglingMessaging(false);
    }
  }

  function navigateView(view: ActiveView, nextStage?: string) {
    setActiveView(view);
    if (nextStage !== undefined) setStageFilter(nextStage);
    setVisibleCount(25);
    setMobileMenuOpen(false);
    if (view !== "chat") {
      setSelectedLeadId(null);
      setMobileChatActive(false);
    }

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
        if (mobileMenuOpen) setMobileMenuOpen(false);
        if (selectedLeadId && activeView !== "chat") setSelectedLeadId(null);
        if (showAddModal) setShowAddModal(false);
        if (showAddSuppressionModal) setShowAddSuppressionModal(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeView, mobileMenuOpen, selectedLeadId, showAddModal, showAddSuppressionModal]);

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
      if (!r.ok) throw new Error("Erro ao carregar empresas");
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
      loadStatus();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeView === "chat" && !selectedLeadId && leads.length > 0) {
      const preferred =
        leads.find(l => Boolean(l.aiPausedAt) && !["WON", "LOST", "OPTED_OUT", "BLOCKED"].includes(l.status)) ||
        leads.find(l => ["REPLIED", "QUALIFIED", "MEETING", "WON"].includes(l.status)) ||
        leads[0];
      if (preferred) openConversation(preferred.id, false);
    }
  }, [activeView, leads, selectedLeadId]);

  async function openConversation(leadId: string, activateMobileChat = true) {
    setSelectedLeadId(leadId);
    if (activateMobileChat) setMobileChatActive(true);
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
      setMobileChatActive(false);
    } finally {
      setLoadingChat(false);
    }
  }

  function getTrackedLink(lead: { previewSlug?: string | null; previewUrl?: string | null } | null | undefined) {
    if (!lead?.previewUrl) return null;
    const baseOrigin = systemStatus?.publicAppUrl || (typeof window !== "undefined" ? window.location.origin : "");
    return buildTrackedPreviewUrl(lead.previewSlug, baseOrigin) || lead.previewUrl;
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
      if (!res.ok) throw new Error(data.error || "Falha ao salvar link da prévia");
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
      notify(data.previewUrl ? "Link salvo e contador de cliques ativado!" : "Link da prévia removido.");
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
      if (!res.ok) throw new Error(data.error || "Falha ao salvar foto da prévia");
      setActiveLead(prev => (prev ? { ...prev, previewImage: data.previewImage } : null));
      setLeads(prev => prev.map(l => (l.id === activeLead.id ? { ...l, previewImage: data.previewImage } : l)));
      setIncludePreviewImage(true);
      notify("Foto da prévia anexada!");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao processar foto");
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
      if (!res.ok) throw new Error("Falha ao remover foto");
      setActiveLead(prev => (prev ? { ...prev, previewImage: null } : null));
      setLeads(prev => prev.map(l => (l.id === activeLead.id ? { ...l, previewImage: null } : l)));
      setIncludePreviewImage(false);
      notify("Foto removida.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao remover foto");
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
        throw new Error(err.error || "Falha ao alterar etapa");
      }
      const updated = await res.json();
      setActiveLead(prev => prev ? { ...prev, status: updated.status, optOutAt: updated.optOutAt } : null);
      setLeads(prev => prev.map(l => l.id === activeLead.id ? { ...l, status: updated.status } : l));
      notify(`Etapa atualizada para "${statusConfig[newStatus]?.shortLabel || newStatus}"`);
      if (newStatus === "OPTED_OUT" || newStatus === "BLOCKED") loadSuppressions();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha ao atualizar etapa");
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
          notify("Mensagem criada pela IA!");
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
    const tracked = getTrackedLink(activeLead);
    setComposerText(
      buildFallbackApproach({
        name: activeLead.name,
        company: activeLead.company,
        rating: activeLead.rating,
        previewUrl: activeLead.previewUrl,
        trackedPreviewUrl: tracked,
      })
    );
    notify("Mensagem padrão carregada!");
  }

  function loadFollowUp(stage: "DAY_2" | "DAY_5") {
    if (!activeLead) return;
    const company = activeLead.company?.trim() || activeLead.name.trim();
    const link = getTrackedLink(activeLead);
    setComposerText(buildFollowUpSuggestion(company, stage, link));
    setIncludePreviewImage(false);
    notify(stage === "DAY_5" ? "Mensagem de retorno (5 dias) carregada!" : "Mensagem de retorno (2 dias) carregada!");
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
      if (!res.ok) throw new Error(data.error || "Erro ao enviar mensagem");

      notify(
        data.aiPaused
          ? "Mensagem enviada e IA pausada para você assumir este atendimento."
          : data.hasMedia
            ? "Foto da prévia e mensagem enviadas para a fila!"
            : "Mensagem enviada para a fila do WhatsApp!"
      );
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

  async function toggleAiPause(paused: boolean) {
    if (!activeLead) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/leads/${activeLead.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aiPaused: paused }),
      });
      if (!res.ok) throw new Error("Falha ao atualizar status da IA");
      const updated = await res.json();
      setActiveLead(prev => (prev ? { ...prev, aiPausedAt: updated.aiPausedAt ?? null } : null));
      setLeads(prev =>
        prev.map(l => (l.id === activeLead.id ? { ...l, aiPausedAt: updated.aiPausedAt ?? null } : l))
      );
      notify(paused ? "IA pausada para este contato." : "IA reativada para este contato.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao alternar IA");
    } finally {
      setUpdatingStatus(false);
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
        throw new Error(err.error || "Falha ao bloquear número");
      }
      setShowAddSuppressionModal(false);
      setSuppressionForm({ phone: "", reason: "Solicitação manual de bloqueio" });
      notify("Número adicionado à lista de bloqueios.");
      loadSuppressions();
      loadLeads();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erro ao bloquear número");
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
      notify("Empresa cadastrada com sucesso!");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setLoading(false);
    }
  }

  const totalLeads = leads.length;
  const noRealSiteCount = leads.filter(l => !hasRealWebsite(l.website)).length;
  const goldCount = leads.filter(l => getLeadGoldScore(l).isGold).length;
  const readyWithoutPreviewCount = leads.filter(
    l => !l.previewUrl && ["NEW", "READY", "BUILDING"].includes(l.status)
  ).length;
  const readyToSendCount = leads.filter(
    l => Boolean(l.previewUrl) && !l.initialSentAt && ["NEW", "READY", "BUILDING", "DEMO_READY"].includes(l.status)
  ).length;
  const demoCount = leads.filter(l => l.status === "BUILDING" || l.status === "DEMO_READY" || Boolean(l.previewUrl)).length;
  const sentCount = leads.filter(l => Boolean(l.initialSentAt) || l.status === "SENT").length;
  const followUpCount = leads.filter(l => getFollowUpStage(l).due !== false).length;
  const totalPreviewViews = leads.reduce((sum, l) => sum + (l.previewViews || 0), 0);
  const viewedLeadsCount = leads.filter(l => (l.previewViews || 0) > 0).length;
  const repliedCount = leads.filter(l => ["REPLIED", "QUALIFIED", "MEETING", "WON"].includes(l.status)).length;
  const wonCount = leads.filter(l => l.status === "WON").length;

  const goldPct = totalLeads > 0 ? Math.round((noRealSiteCount / totalLeads) * 100) : 0;
  const monthlyRevenue = wonCount * 1200;

  const hotLeads = useMemo(() => sortHotLeads(leads), [leads]);
  const waitingHumanLeads = useMemo(
    () =>
      leads.filter(
        l =>
          (Boolean(l.aiPausedAt) || l.status === "REPLIED") &&
          !["WON", "LOST", "OPTED_OUT", "BLOCKED"].includes(l.status)
      ),
    [leads]
  );
  const followUpLeads = useMemo(
    () => leads.filter(l => getFollowUpStage(l).due !== false),
    [leads]
  );

  const realCities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads) {
      const label = extractRegionLabel(l.address, l.source);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label, count]) => ({
        label,
        count,
        pct: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0,
      }));
  }, [leads, totalLeads]);

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
    return leads
      .filter(l => {
        const matchesQuery = `${l.name} ${l.company || ""} ${l.phone} ${l.category || ""} ${l.address || ""}`
          .toLowerCase()
          .includes(query.toLowerCase());
        if (!matchesQuery) return false;
        if (chatFilter === "WAIT_HUMAN") {
          return (
            (Boolean(l.aiPausedAt) || l.status === "REPLIED") &&
            !["WON", "LOST", "OPTED_OUT", "BLOCKED"].includes(l.status)
          );
        }
        if (chatFilter === "REPLIED") return ["REPLIED", "QUALIFIED", "MEETING", "WON"].includes(l.status);
        if (chatFilter === "SENT") return l.status === "SENT" || Boolean(l.initialSentAt);
        return true;
      })
      .slice()
      .sort((a, b) => {
        const tA = new Date(a.lastMessageAt || a.lastViewedAt || a.createdAt).getTime();
        const tB = new Date(b.lastMessageAt || b.lastViewedAt || b.createdAt).getTime();
        return tB - tA;
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
        notify("Link copiado com rastreio!");
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
    onToggleAiPause: toggleAiPause,
  };

  return (
    <div className="fd-main-wrapper">
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            left: "auto",
            maxWidth: "calc(100vw - 40px)",
            background: "#1c2d41",
            color: "#ffffff",
            padding: "12px 18px",
            borderRadius: 60,
            fontWeight: 500,
            fontSize: 13,
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.35)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Sparkles size={15} style={{ color: "#01caf1", flexShrink: 0 }} />
          <span>{toast}</span>
        </div>
      )}

      {/* Topbar Header */}
      <header className="fd-topbar">
        <div className="fd-navbar-header">
          <button
            type="button"
            className="fd-mobile-menu-btn"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            aria-label="Abrir menu lateral"
          >
            <Menu size={20} />
          </button>

          <a
            href="/"
            onClick={e => {
              e.preventDefault();
              navigateView("dashboard", "ALL");
            }}
            className="fd-navbar-brand"
          >
            <svg width="28" height="28" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M8.94981 23.8836C17.1535 22.0444 21.8606 18.63 23.1886 17.1527C25.1125 19.7791 23.5006 24.7713 22.4542 26.9391C19.9436 30.6278 9.57181 33.6852 9.35294 33.8456C5.33665 36.9488 9.0603 41.9613 9.23039 42.1733C9.23088 42.1734 9.23137 42.1735 9.23186 42.1737C9.23842 42.1826 9.23765 42.1823 9.23039 42.1733C5.05462 41.0619 2.48669 36.4087 1.72464 34.2207C0.0360044 28.059 5.83782 24.7619 8.94981 23.8836Z"
                fill="#00B0FF"
              />
              <path
                d="M19.2543 18.6806C5.84573 22.0456 2.3459 26.3581 2.27206 28.0937C0.567018 20.2601 3.11893 17.16 4.67094 15.0703C5.75714 13.0639 13.9224 10.8693 17.506 9.86971C23.1659 8.41418 27.6286 5.09151 29.5156 3.76525C32.8828 13.1366 24.0777 17.6135 19.2543 18.6806Z"
                fill="#615DFF"
              />
            </svg>
            <span style={{ fontSize: 19, fontWeight: 700, color: "var(--fd-dark)", letterSpacing: "-0.02em" }}>
              Prospecta
            </span>
          </a>
        </div>

        <div className="fd-navbar-collapse">
          <div className="fd-topbar-left">
            <button
              className="fd-btn"
              style={{ border: 0, background: "transparent", padding: "0 6px", position: "relative" }}
              onClick={() => {
                setPriorityTab(waitingHumanLeads.length > 0 ? "HUMAN" : hotLeads.length > 0 ? "HOT" : "FOLLOWUP");
                navigateView("dashboard", "ALL");
              }}
              title="Ver prioridades de hoje"
            >
              <Bell size={20} style={{ color: "var(--fd-body-color)" }} />
              <span
                className="fd-badge-pill primary"
                style={{ position: "absolute", top: -2, right: -4, fontSize: 10, padding: "2px 6px", lineHeight: 1 }}
              >
                {hotLeads.length + waitingHumanLeads.length + followUpCount}
              </span>
            </button>

            <span
              className={`fd-badge-pill fd-hide-sm ${
                !systemStatus
                  ? "warning"
                  : systemStatus.whatsapp?.connected
                    ? "success"
                    : "danger"
              }`}
              style={{ fontSize: 12 }}
              title={systemStatus?.whatsapp?.error || "Estado real da conexão com o WhatsApp"}
            >
              {!systemStatus
                ? "Verificando WhatsApp..."
                : systemStatus.whatsapp?.connected
                  ? "WhatsApp Conectado"
                  : "WhatsApp Desconectado"}
            </span>

            {systemStatus && (
              <button
                type="button"
                disabled={togglingMessaging}
                onClick={() => toggleMessagingEnabled(!systemStatus.automationEnabled)}
                className={`fd-btn fd-btn-sm fd-btn-rounded ${systemStatus.automationEnabled ? "" : "fd-btn-primary"}`}
                style={{
                  height: 30,
                  padding: "0 11px",
                  fontSize: 12,
                  borderColor: systemStatus.automationEnabled ? "rgba(34, 202, 128, 0.45)" : undefined,
                  color: systemStatus.automationEnabled ? "#22ca80" : undefined,
                  background: systemStatus.automationEnabled ? "rgba(34, 202, 128, 0.14)" : undefined,
                }}
                title={
                  systemStatus.automationEnabled
                    ? "Pausa somente os envios de mensagem. A captura de leads no Maps continua ativa."
                    : "Retoma os envios de mensagens no WhatsApp."
                }
              >
                {systemStatus.automationEnabled ? <Pause size={12} /> : <Play size={12} />}
                <span className="fd-hide-sm">
                  {togglingMessaging
                    ? "Salvando..."
                    : systemStatus.automationEnabled
                      ? "Envios Ativos (Pausar)"
                      : "Envios Pausados (Retomar)"}
                </span>
              </button>
            )}
          </div>

          <div className="fd-topbar-right">
            <div className="fd-customize-input fd-desktop-search">
              <input
                className="fd-pill-input"
                type="search"
                placeholder="Pesquisar empresa"
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setVisibleCount(25);
                }}
              />
              <Search
                size={18}
                style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: "var(--fd-body-color)" }}
              />
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="fd-btn"
              style={{ border: 0, background: "transparent", padding: 6 }}
              title={theme === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}
              aria-label="Alternar tema claro e escuro"
            >
              {theme === "dark" ? <Sun size={18} style={{ color: "#fdc16a" }} /> : <Moon size={18} style={{ color: "var(--fd-body-color)" }} />}
            </button>

            <button
              onClick={() => {
                loadLeads();
                loadStatus();
                notify("Dados atualizados.");
              }}
              className="fd-btn"
              style={{ border: 0, background: "transparent", padding: 6 }}
              title="Atualizar empresas e conexão WhatsApp"
            >
              <RefreshCw size={18} style={{ color: "var(--fd-body-color)" }} />
            </button>

            <div className="fd-hide-sm" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img
                src="/freedash/profile-pic.jpg"
                alt="Operador"
                width={38}
                height={38}
                style={{ borderRadius: "50%", objectFit: "cover" }}
              />
              <div style={{ lineHeight: 1.2 }}>
                <span style={{ fontSize: 13, color: "var(--fd-body-color)" }}>Olá, </span>
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fd-dark)" }}>Innovary</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Backdrop Mobile Sidebar */}
      <div
        className={`fd-sidebar-backdrop ${mobileMenuOpen ? "open" : ""}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Left Sidebar (5 Menus Simples e Objetivos) */}
      <aside className={`fd-left-sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <nav className="fd-sidebar-nav">
          <ul className="fd-sidebar-ul">
            <li className={`fd-sidebar-item ${activeView === "dashboard" ? "selected" : ""}`}>
              <button
                type="button"
                className="fd-sidebar-link"
                onClick={() => navigateView("dashboard", "ALL")}
              >
                <HomeIcon />
                <span className="fd-hide-menu">Início</span>
              </button>
            </li>

            <li className="fd-list-divider" />
            <li className="fd-nav-small-cap">
              <span className="fd-hide-menu">Atendimento</span>
            </li>

            <li className={`fd-sidebar-item ${activeView === "pipeline" ? "selected" : ""}`}>
              <button
                type="button"
                className="fd-sidebar-link"
                onClick={() => navigateView("pipeline", stageFilter)}
              >
                <Building2 />
                <span className="fd-hide-menu">Empresas</span>
                <span className="fd-nav-pill-count">{totalLeads}</span>
              </button>
            </li>

            <li className={`fd-sidebar-item ${activeView === "chat" ? "selected" : ""}`}>
              <button
                type="button"
                className="fd-sidebar-link"
                onClick={() => navigateView("chat")}
              >
                <MessageSquare />
                <span className="fd-hide-menu">Conversas</span>
                {(waitingHumanLeads.length > 0 || repliedCount > 0) && (
                  <span className="fd-nav-pill-count">
                    {waitingHumanLeads.length > 0 ? waitingHumanLeads.length : repliedCount}
                  </span>
                )}
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
                <span className="fd-hide-menu">Buscar no Maps</span>
              </button>
            </li>

            <li className={`fd-sidebar-item ${activeView === "suppressions" ? "selected" : ""}`}>
              <button
                type="button"
                className="fd-sidebar-link"
                onClick={() => navigateView("suppressions")}
              >
                <ShieldBan />
                <span className="fd-hide-menu">Bloqueados</span>
                <span className="fd-nav-pill-count">{suppressions.length}</span>
              </button>
            </li>

            <li className="fd-list-divider" />
            <li className="fd-nav-small-cap">
              <span className="fd-hide-menu">Conta</span>
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
                ? "Resumo de Hoje"
                : activeView === "pipeline"
                  ? "Lista de Empresas"
                  : activeView === "chat"
                    ? "Conversas no WhatsApp"
                    : activeView === "campaigns"
                      ? "Buscar Empresas no Maps"
                      : "Contatos Bloqueados"}
            </h3>
            <div className="fd-breadcrumb">
              <span>
                {activeView === "dashboard"
                  ? "Início"
                  : activeView === "pipeline" || activeView === "chat"
                    ? "Atendimento"
                    : "Captação"}
              </span>
              <span>/</span>
              <span>
                {activeView === "dashboard"
                  ? "Visão Geral"
                  : activeView === "pipeline"
                    ? "Empresas"
                    : activeView === "chat"
                      ? "Conversas"
                      : activeView === "campaigns"
                        ? "Google Maps"
                        : "Bloqueados"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="fd-btn fd-btn-primary fd-btn-rounded fd-btn-sm" onClick={() => setShowAddModal(true)}>
              <Plus size={15} />
              <span>Nova Empresa</span>
            </button>
          </div>
        </div>

        {/* Main Fluid Container */}
        <div className="fd-container-fluid">
          {activeView === "dashboard" && (
            <DashboardOverview
              systemStatus={systemStatus}
              togglingMessaging={togglingMessaging}
              onToggleMessaging={toggleMessagingEnabled}
              totalLeads={totalLeads}
              noRealSiteCount={noRealSiteCount}
              goldCount={goldCount}
              goldPct={goldPct}
              readyWithoutPreviewCount={readyWithoutPreviewCount}
              readyToSendCount={readyToSendCount}
              demoCount={demoCount}
              sentCount={sentCount}
              viewedLeadsCount={viewedLeadsCount}
              totalPreviewViews={totalPreviewViews}
              repliedCount={repliedCount}
              wonCount={wonCount}
              monthlyRevenue={monthlyRevenue}
              hotLeads={hotLeads}
              waitingHumanLeads={waitingHumanLeads}
              followUpLeads={followUpLeads}
              priorityTab={priorityTab}
              onChangePriorityTab={setPriorityTab}
              realCities={realCities}
              onNavigateStage={st => navigateView("pipeline", st)}
              onOpenLead={id => openConversation(id)}
            />
          )}

          {(activeView === "dashboard" || activeView === "pipeline") && (
            <div className="fd-card">
              <div className="fd-card-body">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                  <h4 className="fd-card-title" style={{ margin: 0 }}>
                    Empresas ({filtered.length})
                  </h4>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", width: "auto", maxWidth: "100%" }}>
                    {[
                      { id: "ALL", label: "Todas" },
                      { id: "GOLD", label: "Sem site" },
                      { id: "DEMO", label: "Prévia pronta" },
                      { id: "SENT", label: "Enviadas" },
                      { id: "FOLLOWUP", label: `Retorno 2d e 5d${followUpCount ? ` (${followUpCount})` : ""}` },
                      { id: "REPLIED", label: "Em conversa" },
                      { id: "WON", label: "Fechadas" },
                    ].map(st => (
                      <button
                        key={st.id}
                        onClick={() => {
                          setStageFilter(st.id);
                          setVisibleCount(25);
                        }}
                        className={`fd-btn fd-btn-sm fd-btn-rounded ${stageFilter === st.id ? "fd-btn-primary" : ""}`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Busca rapida visivel no mobile dentro da lista */}
                <div style={{ marginBottom: 14, position: "relative" }}>
                  <input
                    className="fd-input"
                    type="search"
                    placeholder="Buscar empresa por nome, telefone ou cidade..."
                    value={query}
                    onChange={e => {
                      setQuery(e.target.value);
                      setVisibleCount(25);
                    }}
                    style={{ paddingRight: 34 }}
                  />
                  <Search
                    size={15}
                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--fd-body-color)" }}
                  />
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table className="fd-table">
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th className="fd-col-hide-sm">Site e Nota</th>
                        <th className="fd-col-hide-sm">WhatsApp</th>
                        <th className="fd-col-hide-sm" style={{ textAlign: "center" }}>Status</th>
                        <th style={{ textAlign: "center" }}>Cliques</th>
                        <th>Etapa</th>
                        <th style={{ textAlign: "right" }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: "36px 14px", color: "var(--fd-body-color)" }}>
                            Nenhuma empresa encontrada neste filtro. Cadastre em <strong>Nova Empresa</strong> ou busque no Google Maps.
                          </td>
                        </tr>
                      ) : (
                        filtered.slice(0, visibleCount).map((l, idx) => {
                          const conf = statusConfig[l.status] || { label: l.status, shortLabel: l.status, color: "#b8c3d5" };
                          const gold = getLeadGoldScore(l);
                          const followUp = getFollowUpStage(l);
                          const realSite = hasRealWebsite(l.website);
                          const displayName = l.company || l.name;
                          const avColor = avatarPalette[idx % avatarPalette.length];

                          return (
                            <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => openConversation(l.id)}>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span className="fd-avatar-circle fd-col-hide-sm" style={{ background: avColor }}>
                                    {getInitials(displayName)}
                                  </span>
                                  <div>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fd-dark)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                      <span>{displayName}</span>
                                      {gold.isGold && <span className="fd-badge-pill warning">Destaque</span>}
                                      {l.previewUrl && <span className="fd-badge-pill primary">Prévia</span>}
                                      {l.aiPausedAt && <span className="fd-badge-pill warning">IA pausada</span>}
                                    </div>
                                    <span style={{ fontSize: 12, color: "var(--fd-body-color)" }}>{l.address || l.category || l.phone}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="fd-col-hide-sm">
                                <div style={{ fontSize: 13, color: realSite ? "var(--fd-gray-700)" : "#ff4f70", fontWeight: realSite ? 400 : 500 }}>
                                  {realSite && l.website ? l.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 26) : "Sem site próprio"}
                                </div>
                                {typeof l.rating === "number" && (
                                  <div style={{ fontSize: 12, color: "#fdc16a", fontWeight: 500, marginTop: 2 }}>
                                    ★ {l.rating.toFixed(1)} ({l.reviewsCount ?? 0} avaliações)
                                  </div>
                                )}
                              </td>
                              <td className="fd-col-hide-sm" style={{ fontWeight: 500, color: "var(--fd-dark)" }}>{l.phone}</td>
                              <td className="fd-col-hide-sm" style={{ textAlign: "center" }}>
                                <span className="fd-status-dot" style={{ background: conf.color }} title={conf.label} />
                              </td>
                              <td style={{ textAlign: "center", fontWeight: 500, color: "var(--fd-dark)" }}>
                                {l.previewViews ?? 0}
                              </td>
                              <td>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fd-dark)" }}>{conf.shortLabel}</span>
                                  {followUp.due && (
                                    <span className="fd-badge-pill warning">
                                      Retorno {followUp.due === "DAY_5" ? "5d" : "2d"}
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

                {filtered.length > visibleCount && (
                  <div style={{ textAlign: "center", marginTop: 18 }}>
                    <button
                      type="button"
                      className="fd-btn fd-btn-rounded"
                      onClick={() => setVisibleCount(prev => prev + 25)}
                    >
                      Mostrar mais empresas ({filtered.length - visibleCount} restantes)
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView === "chat" && (
            <div className={`fd-chat-workspace ${mobileChatActive ? "has-active-chat" : ""}`}>
              <div className="fd-chat-contacts">
                <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid var(--fd-border-color)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <h4 className="fd-card-title" style={{ margin: 0, fontSize: 16 }}>Conversas</h4>
                    <span className="fd-badge-pill primary">{chatContacts.length}</span>
                  </div>
                  <input
                    className="fd-input"
                    type="search"
                    placeholder="Buscar conversa..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    style={{ height: 34, fontSize: 13, marginBottom: 10 }}
                  />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { id: "ALL", label: "Todas" },
                      { id: "WAIT_HUMAN", label: `Sua vez (${waitingHumanLeads.length})` },
                      { id: "REPLIED", label: "Responderam" },
                      { id: "SENT", label: "Enviadas" },
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setChatFilter(f.id as "ALL" | "WAIT_HUMAN" | "REPLIED" | "SENT")}
                        className={`fd-btn fd-btn-sm fd-btn-rounded ${chatFilter === f.id ? "fd-btn-primary" : ""}`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: "auto" }}>
                  {chatContacts.length === 0 ? (
                    <div style={{ padding: 28, textAlign: "center", fontSize: 13, color: "var(--fd-body-color)" }}>
                      Nenhuma conversa encontrada neste filtro.
                    </div>
                  ) : (
                    chatContacts.map((l, idx) => {
                      const displayName = l.company || l.name;
                      const conf = statusConfig[l.status] || { label: l.status, shortLabel: l.status, color: "#b8c3d5" };
                      const lastMsg = l.messages?.[0]?.body;
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => openConversation(l.id, true)}
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
                                  color: "var(--fd-dark)",
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
                                color: "var(--fd-body-color)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                marginTop: 3,
                              }}
                            >
                              {lastMsg || l.phone}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 11, color: "var(--fd-body-color)" }}>{conf.shortLabel}</span>
                              {l.aiPausedAt && (
                                <span className="fd-badge-pill warning" style={{ fontSize: 10, padding: "1px 6px" }}>
                                  Sua vez
                                </span>
                              )}
                              {(l.previewViews ?? 0) > 0 && (
                                <span className="fd-badge-pill primary" style={{ fontSize: 10, padding: "1px 6px" }}>
                                  {l.previewViews} cliques
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
                <LeadConversationPane
                  {...conversationPaneProps}
                  onBackMobile={() => setMobileChatActive(false)}
                />
              </div>
            </div>
          )}

          {activeView === "campaigns" && <CampaignsPanel onNotify={notify} />}

          {activeView === "suppressions" && (
            <div className="fd-card">
              <div className="fd-card-body">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                  <h4 className="fd-card-title" style={{ margin: 0 }}>Contatos Bloqueados</h4>
                  <button className="fd-btn fd-btn-primary fd-btn-rounded fd-btn-sm" onClick={() => setShowAddSuppressionModal(true)}>
                    <Plus size={14} /> Bloquear Número
                  </button>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table className="fd-table">
                    <thead>
                      <tr>
                        <th>Telefone</th>
                        <th>Motivo</th>
                        <th className="fd-col-hide-sm">Data</th>
                        <th style={{ textAlign: "right" }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppressions.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: "center", padding: "40px 16px", color: "var(--fd-body-color)" }}>
                            Nenhum número bloqueado no momento.
                          </td>
                        </tr>
                      ) : (
                        suppressions.map(s => (
                          <tr key={s.phone}>
                            <td style={{ fontWeight: 500, color: "var(--fd-dark)" }}>{s.phone}</td>
                            <td><span className="fd-badge-pill danger">{s.reason}</span></td>
                            <td className="fd-col-hide-sm">{new Date(s.createdAt).toLocaleDateString("pt-BR")}</td>
                            <td style={{ textAlign: "right" }}>
                              <button className="fd-btn fd-btn-sm fd-btn-rounded" onClick={() => unblockPhone(s.phone)}>
                                Desbloquear
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
          Prospecta WA para Prospecção Comercial no WhatsApp.
        </footer>
      </div>

      {/* Offcanvas Drawer WhatsApp e Previa */}
      {selectedLeadId && activeView !== "chat" && (
        <div className="fd-drawer-backdrop" onClick={() => setSelectedLeadId(null)}>
          <div className="fd-drawer" onClick={e => e.stopPropagation()}>
            <LeadConversationPane {...conversationPaneProps} onClose={() => setSelectedLeadId(null)} />
          </div>
        </div>
      )}

      {/* Modal Cadastrar Empresa */}
      {showAddModal && (
        <div className="fd-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="fd-modal" onClick={e => e.stopPropagation()}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--fd-border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 18, fontWeight: 500, color: "var(--fd-dark)", margin: 0 }}>Cadastrar Empresa</h3>
              <button onClick={() => setShowAddModal(false)} className="fd-btn fd-btn-sm" style={{ padding: "0 8px" }}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={addLead} style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>Nome da Empresa</label>
                <input className="fd-input" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Ex.: Locadora Forte Equipamentos" />
              </div>

              <div className="fd-form-grid-2">
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>Contato ou Responsável</label>
                  <input className="fd-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Comercial" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>WhatsApp (com DDD)</label>
                  <input className="fd-input" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="5519999999999" />
                </div>
              </div>

              <div className="fd-form-grid-3">
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>Segmento</label>
                  <input className="fd-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>Nota Google</label>
                  <input className="fd-input" value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })} placeholder="4.8" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>Avaliações</label>
                  <input className="fd-input" type="number" min={0} value={form.reviewsCount} onChange={e => setForm({ ...form, reviewsCount: e.target.value })} placeholder="35" />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>Cidade e Endereço</label>
                <input className="fd-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Campinas, SP" />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>Site Atual (deixe vazio se não tiver)</label>
                <input className="fd-input" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="Vazio ou https://..." />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>Link da Prévia (opcional)</label>
                <input className="fd-input" value={form.previewUrl} onChange={e => setForm({ ...form, previewUrl: e.target.value })} placeholder="https://previa.seudominio.com" />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" className="fd-btn fd-btn-rounded" onClick={() => setShowAddModal(false)}>Cancelar</button>
                <button type="submit" className="fd-btn fd-btn-primary fd-btn-rounded" disabled={loading}>
                  {loading ? "Salvando..." : "Salvar Empresa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Bloquear Numero */}
      {showAddSuppressionModal && (
        <div className="fd-modal-backdrop" onClick={() => setShowAddSuppressionModal(false)}>
          <div className="fd-modal" style={{ width: "min(440px, 100%)" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--fd-border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 18, fontWeight: 500, color: "var(--fd-dark)", margin: 0 }}>Bloquear Número</h3>
              <button onClick={() => setShowAddSuppressionModal(false)} className="fd-btn fd-btn-sm" style={{ padding: "0 8px" }}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={addSuppression} style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>WhatsApp para Bloqueio</label>
                <input className="fd-input" required value={suppressionForm.phone} onChange={e => setSuppressionForm({ ...suppressionForm, phone: e.target.value })} placeholder="5511999999999" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 4 }}>Motivo</label>
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
