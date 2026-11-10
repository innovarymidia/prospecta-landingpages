"use client";

import {
  Bot,
  Copy,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  Link2,
  MessageSquare,
  Send,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { getFollowUpStage } from "@/lib/sniper";

export type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  purpose?: string | null;
  status: "QUEUED" | "SENT" | "DELIVERED" | "FAILED";
  body: string;
  mediaUrl?: string | null;
  createdAt: string;
};

export type Lead = {
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

export type LeadDetail = Omit<Lead, "messages"> & {
  messages: Message[];
};

export const statusConfig: Record<string, { label: string; color: string }> = {
  NEW: { label: "Novo Lead", color: "#b8c3d5" },
  READY: { label: "Selecionado", color: "#5f76e8" },
  BUILDING: { label: "Montando Prévia", color: "#01caf1" },
  DEMO_READY: { label: "Prévia Pronta", color: "#5f76e8" },
  SENT: { label: "Prévia Enviada", color: "#fdc16a" },
  REPLIED: { label: "Respondeu", color: "#22ca80" },
  QUALIFIED: { label: "Qualificado", color: "#01caf1" },
  MEETING: { label: "Reunião Marcada", color: "#5f76e8" },
  WON: { label: "Cliente Fechado", color: "#22ca80" },
  LOST: { label: "Encerrado", color: "#b8c3d5" },
  OPTED_OUT: { label: "Opt out", color: "#ff4f70" },
  BLOCKED: { label: "Bloqueado", color: "#ff4f70" },
};

export const avatarPalette = ["#5f76e8", "#ff4f70", "#22ca80", "#01caf1", "#fdc16a", "#1c2d41"];

export function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "LE";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

type Props = {
  lead: LeadDetail | null;
  loading: boolean;
  trackedUrl: string | null;
  previewUrlInput: string;
  onPreviewUrlInputChange: (val: string) => void;
  savingPreview: boolean;
  onSavePreviewUrl: (e?: React.FormEvent) => void;
  onCopyTrackedUrl: () => void;
  onUploadPreviewImage: (file: File) => void;
  onRemovePreviewImage: () => void;
  updatingStatus: boolean;
  onUpdateStatus: (newStatus: string) => void;
  generatingDraft: boolean;
  onRequestAiDraft: () => void;
  onLoadFollowUp: (stage: "DAY_2" | "DAY_5") => void;
  composerText: string;
  onComposerTextChange: (val: string) => void;
  includePreviewImage: boolean;
  onIncludePreviewImageChange: (val: boolean) => void;
  sendingMsg: boolean;
  onSendMessage: (e: React.FormEvent) => void;
  onPasteImage: (e: React.ClipboardEvent) => void;
  onClose?: () => void;
};

export default function LeadConversationPane({
  lead,
  loading,
  trackedUrl,
  previewUrlInput,
  onPreviewUrlInputChange,
  savingPreview,
  onSavePreviewUrl,
  onCopyTrackedUrl,
  onUploadPreviewImage,
  onRemovePreviewImage,
  updatingStatus,
  onUpdateStatus,
  generatingDraft,
  onRequestAiDraft,
  onLoadFollowUp,
  composerText,
  onComposerTextChange,
  includePreviewImage,
  onIncludePreviewImageChange,
  sendingMsg,
  onSendMessage,
  onPasteImage,
  onClose,
}: Props) {
  if (!lead && !loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
          textAlign: "center",
          color: "#7c8798",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#eef5ff",
            color: "#5f76e8",
            display: "grid",
            placeItems: "center",
            marginBottom: 14,
          }}
        >
          <MessageSquare size={24} />
        </div>
        <h4 style={{ fontSize: 16, fontWeight: 500, color: "#1c2d41", margin: "0 0 6px" }}>
          Central de Atendimento WhatsApp
        </h4>
        <p style={{ fontSize: 13, margin: 0, maxWidth: 340 }}>
          Selecione uma empresa na lista ao lado para visualizar as mensagens, anexar print da prévia e responder pelo WhatsApp.
        </p>
      </div>
    );
  }

  const followUp = lead ? getFollowUpStage(lead) : { due: false as const, daysSinceSent: 0 };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, height: "100%" }}
      onPaste={onPasteImage}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 22px",
          borderBottom: "1px solid #edf2f9",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3
              style={{
                fontSize: 17,
                fontWeight: 500,
                color: "#1c2d41",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {lead?.company || lead?.name || "Carregando..."}
            </h3>
            {lead?.phone && (
              <a
                href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#5f76e8", display: "inline-flex" }}
                title="Abrir no WhatsApp Oficial"
              >
                <ExternalLink size={15} />
              </a>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#7c8798", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>{lead?.phone}</span>
            {lead?.category && <span>· {lead.category}</span>}
            {typeof lead?.rating === "number" && (
              <span style={{ color: "#fb8c00", fontWeight: 500 }}>
                ★ {lead.rating.toFixed(1)} ({lead.reviewsCount ?? 0})
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <select
            value={lead?.status || "READY"}
            onChange={e => onUpdateStatus(e.target.value)}
            disabled={updatingStatus || !lead}
            className="fd-input"
            style={{ width: "auto", fontSize: 13, padding: "6px 10px" }}
          >
            {Object.entries(statusConfig).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>

          {onClose && (
            <button onClick={onClose} className="fd-btn fd-btn-sm" style={{ padding: "0 8px" }} title="Fechar">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Bloco Prévia Manual e Print */}
      {lead && (
        <div
          style={{
            padding: "14px 22px",
            background: "#f9fbfd",
            borderBottom: "1px solid #edf2f9",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <form onSubmit={onSavePreviewUrl} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Link2
                size={14}
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#5f76e8" }}
              />
              <input
                className="fd-input"
                style={{ paddingLeft: 32, fontSize: 13 }}
                value={previewUrlInput}
                onChange={e => onPreviewUrlInputChange(e.target.value)}
                placeholder="Cole aqui o link externo da prévia manual (https://...)"
              />
            </div>
            <button type="submit" className="fd-btn fd-btn-primary fd-btn-sm" disabled={savingPreview}>
              {savingPreview ? "..." : "Salvar Prévia"}
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            {trackedUrl ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                <span className="fd-badge-pill primary">
                  <Eye size={11} style={{ marginRight: 4 }} /> {lead.previewViews ?? 0}{" "}
                  {lead.previewViews === 1 ? "clique" : "cliques"}
                </span>
                <button
                  type="button"
                  className="fd-btn fd-btn-sm"
                  style={{ height: 26, padding: "0 10px" }}
                  onClick={onCopyTrackedUrl}
                >
                  <Copy size={11} /> Copiar /v/{lead.previewSlug}
                </button>
                <a
                  href={trackedUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "#5f76e8",
                    fontSize: 12,
                    fontWeight: 500,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  Testar <ExternalLink size={11} />
                </a>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: "#7c8798" }}>
                Salve a URL da prévia manual para gerar o link rastreado <code>/v/slug</code>.
              </span>
            )}

            <div>
              {lead.previewImage ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#ffffff",
                    border: "1px solid #e9ecef",
                    borderRadius: 4,
                    padding: "3px 8px",
                  }}
                >
                  <img
                    src={lead.previewImage}
                    alt="Print da prévia"
                    style={{ width: 28, height: 20, objectFit: "cover", borderRadius: 2 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#22ca80" }}>Print pronto</span>
                  <button
                    type="button"
                    onClick={onRemovePreviewImage}
                    style={{
                      border: 0,
                      background: "transparent",
                      cursor: "pointer",
                      color: "#7c8798",
                      padding: 0,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <label
                  className="fd-btn fd-btn-sm"
                  style={{ height: 28, borderStyle: "dashed", cursor: "pointer" }}
                  title="Ou dê Ctrl+V em um print capturado!"
                >
                  <Upload size={12} />
                  <span>Anexar Print ou Ctrl+V</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) onUploadPreviewImage(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alerta Follow up */}
      {followUp.due && (
        <div
          style={{
            padding: "10px 22px",
            background: "rgba(253, 193, 106, 0.25)",
            borderBottom: "1px solid #edf2f9",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: "#1c2d41" }}>
            Sem resposta há {followUp.daysSinceSent} dias, toque recomendado ({followUp.due === "DAY_5" ? "Dia 5" : "Dia 2"})
          </span>
          <button
            type="button"
            className="fd-btn fd-btn-sm fd-btn-dark"
            onClick={() => onLoadFollowUp(followUp.due as "DAY_2" | "DAY_5")}
          >
            Carregar Follow up
          </button>
        </div>
      )}

      {/* Chat Bubbles */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "18px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#7c8798", fontSize: 14 }}>
            Carregando conversa...
          </div>
        ) : lead?.messages?.length === 0 ? (
          <div
            style={{
              padding: 24,
              background: "#f9fbfd",
              borderRadius: 4,
              border: "1px dashed #dee2e6",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 500, fontSize: 15, color: "#1c2d41", marginBottom: 4 }}>
              {lead.previewUrl ? "Prévia pronta para envio direto!" : "Nenhuma mensagem enviada ainda"}
            </div>
            <p style={{ fontSize: 13, color: "#7c8798", margin: "0 0 14px" }}>
              {lead.previewUrl
                ? "Gere a mensagem direta já com o link rastreado e o print da página."
                : "Cole o link da prévia acima e opcionalmente o print para gerar a abordagem direta."}
            </p>
            <button
              className="fd-btn fd-btn-primary fd-btn-rounded fd-btn-sm"
              onClick={onRequestAiDraft}
              disabled={generatingDraft}
            >
              <Sparkles size={13} />
              <span>{generatingDraft ? "Gerando..." : "Gerar Abordagem Direta"}</span>
            </button>
          </div>
        ) : (
          lead?.messages?.map(msg => (
            <div key={msg.id} className={msg.direction === "OUTBOUND" ? "fd-chat-outbound" : "fd-chat-inbound"}>
              {msg.mediaUrl && (
                <img
                  src={msg.mediaUrl}
                  alt="Print enviado"
                  style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 4, marginBottom: 8, display: "block" }}
                />
              )}
              <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
              <div style={{ fontSize: 10, color: "#7c8798", marginTop: 4, textAlign: "right" }}>
                {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                {msg.direction === "OUTBOUND" && ` · ${msg.status}`}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div
        style={{
          padding: "14px 22px",
          borderTop: "1px solid #edf2f9",
          background: "#f9fbfd",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 500, color: "#5f76e8" }}>
              <Bot size={15} /> Abordagem Sniper
            </span>
            {lead?.previewImage && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, cursor: "pointer", color: "#1c2d41" }}>
                <input
                  type="checkbox"
                  checked={includePreviewImage}
                  onChange={e => onIncludePreviewImageChange(e.target.checked)}
                  style={{ accentColor: "#5f76e8" }}
                />
                <ImageIcon size={13} />
                <span>Enviar print junto</span>
              </label>
            )}
          </div>

          <button
            type="button"
            className="fd-btn fd-btn-sm fd-btn-rounded"
            onClick={onRequestAiDraft}
            disabled={generatingDraft || !lead}
          >
            <Sparkles size={12} style={{ color: "#5f76e8" }} />
            {generatingDraft ? "Gerando..." : "Sugerir Pitch Direto"}
          </button>
        </div>

        <form onSubmit={onSendMessage} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            className="fd-textarea"
            rows={3}
            value={composerText}
            onChange={e => onComposerTextChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onSendMessage(e);
            }}
            placeholder="Digite a mensagem do WhatsApp (Ctrl+Enter para enviar)..."
          />
          <button
            type="submit"
            className="fd-btn fd-btn-primary fd-btn-rounded"
            style={{ height: 40, padding: "0 18px", flexShrink: 0 }}
            disabled={sendingMsg || !composerText.trim() || !lead}
          >
            <Send size={14} />
            <span>{sendingMsg ? "..." : "Enviar"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
