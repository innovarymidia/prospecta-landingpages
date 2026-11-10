"use client";

import { AlertTriangle, DollarSign, FilePlus, Globe, UserPlus } from "lucide-react";
import { avatarPalette, getInitials, Lead } from "@/components/LeadConversationPane";
import { extractRegionLabel, formatRelativeTimeBr, getFollowUpStage } from "@/lib/sniper";

export type SystemStatus = {
  automationEnabled: boolean;
  businessName: string;
  whatsapp?: {
    configured: boolean;
    connected: boolean;
    state: string;
    error?: string;
  };
  publicAppUrl?: string;
  isLocalhostUrl?: boolean;
  aiConfigured?: boolean;
  searchConfigured?: boolean;
  searchProvider?: "serper" | "outscraper" | null;
};

type Props = {
  systemStatus: SystemStatus | null;
  togglingMessaging: boolean;
  onToggleMessaging: (enabled: boolean) => void;
  totalLeads: number;
  noRealSiteCount: number;
  goldCount: number;
  goldPct: number;
  readyWithoutPreviewCount: number;
  readyToSendCount: number;
  demoCount: number;
  sentCount: number;
  viewedLeadsCount: number;
  totalPreviewViews: number;
  repliedCount: number;
  wonCount: number;
  monthlyRevenue: number;
  hotLeads: Lead[];
  waitingHumanLeads: Lead[];
  followUpLeads: Lead[];
  priorityTab: "HOT" | "HUMAN" | "FOLLOWUP";
  onChangePriorityTab: (tab: "HOT" | "HUMAN" | "FOLLOWUP") => void;
  realCities: Array<{ label: string; count: number; pct: number }>;
  onNavigateStage: (stage: string) => void;
  onOpenLead: (leadId: string) => void;
};

export default function DashboardOverview({
  systemStatus,
  togglingMessaging,
  onToggleMessaging,
  totalLeads,
  noRealSiteCount,
  goldCount,
  goldPct,
  readyWithoutPreviewCount,
  readyToSendCount,
  demoCount,
  sentCount,
  viewedLeadsCount,
  totalPreviewViews,
  repliedCount,
  wonCount,
  monthlyRevenue,
  hotLeads,
  waitingHumanLeads,
  followUpLeads,
  priorityTab,
  onChangePriorityTab,
  realCities,
  onNavigateStage,
  onOpenLead,
}: Props) {
  const funnelSteps = [
    { label: "Empresas cadastradas", count: totalLeads, color: "#5f76e8" },
    { label: "Sem site próprio", count: noRealSiteCount, color: "#01caf1" },
    { label: "Com prévia pronta", count: demoCount, color: "#5f76e8" },
    { label: "Abordagem enviada", count: sentCount, color: "#fdc16a" },
    { label: "Clicaram no link", count: viewedLeadsCount, color: "#22ca80" },
    { label: "Responderam", count: repliedCount, color: "#22ca80" },
    { label: "Vendas fechadas", count: wonCount, color: "#1c2d41" },
  ];

  const activeList =
    priorityTab === "HOT"
      ? hotLeads
      : priorityTab === "HUMAN"
        ? waitingHumanLeads
        : followUpLeads;

  return (
    <>
      {/* Alertas Reais de Prontidao */}
      {systemStatus && (!systemStatus.whatsapp?.connected || !systemStatus.automationEnabled || systemStatus.isLocalhostUrl) && (
        <div
          className="fd-card"
          style={{
            borderLeft: `4px solid ${!systemStatus.whatsapp?.connected || !systemStatus.automationEnabled ? "#ff4f70" : "#fdc16a"}`,
            padding: "14px 18px",
            marginBottom: 22,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: "var(--fd-dark)" }}>
            <AlertTriangle size={17} style={{ color: !systemStatus.whatsapp?.connected ? "#ff4f70" : "#fb8c00" }} />
            <span>Avisos antes de enviar mensagens reais</span>
          </div>
          {!systemStatus.whatsapp?.connected && (
            <div style={{ fontSize: 13, color: "var(--fd-gray-700)" }}>
              WhatsApp desconectado ({systemStatus.whatsapp?.error || `estado: ${systemStatus.whatsapp?.state}`}). Conecte o celular na instância antes de disparar.
            </div>
          )}
          {!systemStatus.automationEnabled && (
            <div style={{ fontSize: 13, color: "var(--fd-gray-700)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>Os envios de WhatsApp estão pausados pelo painel. As buscas de empresas no Maps continuam rodando normalmente.</span>
              <button
                type="button"
                disabled={togglingMessaging}
                onClick={() => onToggleMessaging(true)}
                className="fd-btn fd-btn-sm fd-btn-primary fd-btn-rounded"
                style={{ height: 26, padding: "0 12px", fontSize: 12 }}
              >
                Retomar Envios agora
              </button>
            </div>
          )}
          {systemStatus.isLocalhostUrl && (
            <div style={{ fontSize: 13, color: "var(--fd-gray-700)" }}>
              Você está acessando sem domínio público (localhost). Para o cliente abrir o link rastreado da prévia no celular, configure o domínio HTTPS em produção.
            </div>
          )}
        </div>
      )}

      {/* Row 1: 4 KPIs Reais Clicaveis */}
      <div className="fd-kpi-row">
        <div
          className="fd-kpi-cell"
          style={{ cursor: "pointer" }}
          onClick={() => onNavigateStage("GOLD")}
          title="Ver empresas sem site para criar prévia"
        >
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 className="fd-kpi-value">{readyWithoutPreviewCount}</h2>
              <span className="fd-badge-pill primary">{goldPct}% sem site</span>
            </div>
            <h6 className="fd-kpi-label">Fazer Prévia (Ouro: {goldCount})</h6>
          </div>
          <UserPlus size={24} style={{ color: "var(--fd-gray-500)", flexShrink: 0 }} />
        </div>

        <div
          className="fd-kpi-cell"
          style={{ cursor: "pointer" }}
          onClick={() => onNavigateStage("DEMO")}
          title="Ver empresas com prévia pronta para enviar"
        >
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 className="fd-kpi-value">{readyToSendCount}</h2>
              <span className="fd-badge-pill warning">{sentCount} enviadas</span>
            </div>
            <h6 className="fd-kpi-label">Prévias Prontas para Enviar</h6>
          </div>
          <FilePlus size={24} style={{ color: "var(--fd-gray-500)", flexShrink: 0 }} />
        </div>

        <div
          className="fd-kpi-cell"
          style={{ cursor: "pointer" }}
          onClick={() => onChangePriorityTab("HOT")}
          title="Ver quem abriu a prévia"
        >
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 className="fd-kpi-value">{viewedLeadsCount}</h2>
              <span className="fd-badge-pill success">{totalPreviewViews} cliques</span>
            </div>
            <h6 className="fd-kpi-label">Empresas que Abriram o Link</h6>
          </div>
          <Globe size={24} style={{ color: "var(--fd-gray-500)", flexShrink: 0 }} />
        </div>

        <div
          className="fd-kpi-cell"
          style={{ cursor: "pointer" }}
          onClick={() => onNavigateStage("WON")}
          title="Ver vendas fechadas"
        >
          <div>
            <h2 className="fd-kpi-value">
              <sup className="fd-sup-currency">R$</sup>
              {monthlyRevenue.toLocaleString("pt-BR")}
            </h2>
            <h6 className="fd-kpi-label">
              Faturamento Real ({wonCount} {wonCount === 1 ? "venda" : "vendas"})
            </h6>
          </div>
          <DollarSign size={24} style={{ color: "var(--fd-gray-500)", flexShrink: 0 }} />
        </div>
      </div>

      {/* Row 2: Prioridades de Hoje + Funil Real e Cidades */}
      <div className="fd-charts-2col">
        <div className="fd-card">
          <div className="fd-card-body">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
              <h4 className="fd-card-title" style={{ margin: 0 }}>Prioridades de Hoje</h4>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { id: "HOT", label: `Abriram o link (${hotLeads.length})` },
                  { id: "HUMAN", label: `Sua vez (${waitingHumanLeads.length})` },
                  { id: "FOLLOWUP", label: `Retorno 2d e 5d (${followUpLeads.length})` },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onChangePriorityTab(tab.id as "HOT" | "HUMAN" | "FOLLOWUP")}
                    className={`fd-btn fd-btn-sm fd-btn-rounded ${priorityTab === tab.id ? "fd-btn-primary" : ""}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {activeList.length === 0 ? (
              <div
                style={{
                  padding: "32px 18px",
                  textAlign: "center",
                  background: "var(--fd-surface-alt)",
                  borderRadius: 6,
                  border: "1px dashed var(--fd-gray-300)",
                  color: "var(--fd-body-color)",
                  fontSize: 14,
                }}
              >
                {priorityTab === "HOT"
                  ? "Nenhuma empresa abriu o link da prévia ainda. Assim que alguém clicar, aparecerá aqui em tempo real."
                  : priorityTab === "HUMAN"
                    ? "Nenhuma conversa aguardando resposta humana no momento."
                    : "Nenhuma empresa precisando de retorno de 2 ou 5 dias hoje."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {activeList.slice(0, 6).map((item, idx) => {
                  const displayName = item.company || item.name;
                  const fu = getFollowUpStage(item);
                  const lastClick = formatRelativeTimeBr(item.lastViewedAt);
                  const lastMsgTime = formatRelativeTimeBr(item.lastMessageAt);
                  return (
                    <div
                      key={item.id}
                      onClick={() => onOpenLead(item.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 6,
                        border: "1px solid var(--fd-border-color)",
                        cursor: "pointer",
                        background: "var(--fd-surface-alt)",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 200px" }}>
                        <span
                          className="fd-avatar-circle"
                          style={{ background: avatarPalette[idx % avatarPalette.length], width: 38, height: 38, fontSize: 12 }}
                        >
                          {getInitials(displayName)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fd-dark)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span>{displayName}</span>
                            {priorityTab === "HOT" && (
                              <span className="fd-badge-pill success">
                                {item.previewViews} {item.previewViews === 1 ? "clique" : "cliques"} {lastClick ? `(${lastClick})` : ""}
                              </span>
                            )}
                            {priorityTab === "HUMAN" && item.aiPausedAt && (
                              <span className="fd-badge-pill warning">IA pausada</span>
                            )}
                            {priorityTab === "FOLLOWUP" && fu.due && (
                              <span className="fd-badge-pill warning">
                                {fu.daysSinceSent} dias sem resposta
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--fd-body-color)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {priorityTab === "HUMAN" && item.messages?.[0]?.body
                              ? `${lastMsgTime ? `${lastMsgTime}: ` : ""}${item.messages[0].body}`
                              : extractRegionLabel(item.address, item.source)}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="fd-btn fd-btn-sm fd-btn-primary fd-btn-rounded"
                        onClick={e => {
                          e.stopPropagation();
                          onOpenLead(item.id);
                        }}
                      >
                        {priorityTab === "HUMAN" ? "Responder" : priorityTab === "FOLLOWUP" ? "Retornar" : "Abrir"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Funil Real e Cidades Reais */}
        <div className="fd-card">
          <div className="fd-card-body">
            <h4 className="fd-card-title" style={{ marginBottom: 18 }}>Funil Real</h4>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 22 }}>
              {funnelSteps.map(step => {
                const pct = totalLeads > 0 ? Math.round((step.count / totalLeads) * 100) : 0;
                return (
                  <div key={step.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                      <span style={{ color: "var(--fd-gray-700)" }}>{step.label}</span>
                      <span style={{ color: "var(--fd-dark)", fontWeight: 500 }}>
                        {step.count} ({pct}%)
                      </span>
                    </div>
                    <div className="fd-progress">
                      <div className="fd-progress-bar" style={{ width: `${pct}%`, background: step.color }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: "1px solid var(--fd-border-color)", paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fd-dark)", marginBottom: 10 }}>
                Principais Cidades na Base
              </div>
              {realCities.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--fd-body-color)" }}>
                  Nenhuma empresa cadastrada ainda. Use Buscar no Maps para captar empresas reais.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {realCities.map(city => (
                    <div key={city.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--fd-body-color)" }}>{city.label}</span>
                      <span style={{ color: "var(--fd-dark)", fontWeight: 500 }}>
                        {city.count} ({city.pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
