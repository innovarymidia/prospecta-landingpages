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
import { AI_STOPPED_STATUSES } from "@/lib/safety";
import { formatRelativeTimeBr, getFollowUpStage } from "@/lib/sniper";

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
  aiPausedAt?: string | null;
  createdAt: string;
  messages: Array<{ body: string; createdAt?: string }>;
};

export type LeadDetail = Omit<Lead, "messages"> & {
  messages: Message[];
};

export const statusConfig: Record<string, { label: string; color: string; shortLabel: string }> = {
  NEW: { label: "1. Para fazer prévia", shortLabel: "Nova", color: "#b8c3d5" },
  READY: { label: "1. Para fazer prévia", shortLabel: "Fazer prévia", color: "#5f76e8" },
  BUILDING: { label: "1. Montando prévia", shortLabel: "Montando", color: "#01caf1" },
  DEMO_READY: { label: "2. Prévia pronta", shortLabel: "Prévia pronta", color: "#5f76e8" },
  SENT: { label: "3. Aguardando retorno", shortLabel: "Enviada", color: "#fdc16a" },
  REPLIED: { label: "4. Respondeu", shortLabel: "Respondeu", color: "#22ca80" },
  QUALIFIED: { label: "5. Interessado", shortLabel: "Interessado", color: "#01caf1" },
  MEETING: { label: "6. Reunião marcada", shortLabel: "Reunião", color: "#5f76e8" },
  WON: { label: "7. Venda fechada", shortLabel: "Fechado", color: "#22ca80" },
  LOST: { label: "Encerrado (sem interesse)", shortLabel: "Sem interesse", color: "#b8c3d5" },
  OPTED_OUT: { label: "Bloqueado (não enviar)", shortLabel: "Bloqueado", color: "#ff4f70" },
  BLOCKED: { label: "Bloqueado (não enviar)", shortLabel: "Bloqueado", color: "#ff4f70" },
};

const SELECTABLE_STATUSES = [
  "READY",
  "DEMO_READY",
  "SENT",
  "REPLIED",
  "QUALIFIED",
  "MEETING",
  "WON",
  "LOST",
  "BLOCKED",
];

export const avatarPalette = ["#5f76e8", "#ff4f70", "#22ca80", "#01caf1", "#fdc16a", "#1c2d41"];

export function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "EM";
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
  onToggleAiPause?: (paused: boolean) => void;
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
  onToggleAiPause,
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
          Atendimento no WhatsApp
        </h4>
        <p style={{ fontSize: 13, margin: 0, maxWidth: 340 }}>
          Escolha uma empresa na lista ao lado para preparar a prévia do site, ver cliques no link e responder no WhatsApp.
        </p>
      </div>
    );
  }

  const followUp = lead ? getFollowUpStage(lead) : { due: false as const, daysSinceSent: 0 };
  const statusOptions = Array.from(
    new Set(lead?.status ? [lead.status, ...SELECTABLE_STATUSES] : SELECTABLE_STATUSES)
  );
  const lastViewLabel = lead?.lastViewedAt ? formatRelativeTimeBr(lead.lastViewedAt) : "";

  return (
    <div
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, height: "100%" }}
      onPaste={onPasteImage}
    >
      {/* Cabecalho da Empresa */}
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
                title="Abrir no WhatsApp Web"
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
                ★ {lead.rating.toFixed(1)} ({lead.reviewsCount ?? 0} avaliações)
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
            aria-label="Etapa da empresa"
          >
            {statusOptions.map(k => (
              <option key={k} value={k}>
                {statusConfig[k]?.label || k}
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

      {/* Passo 1 e Passo 2: Link da Previa + Imagem Opcional */}
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
          <div style={{ fontSize: 12, fontWeight: 500, color: "#1c2d41" }}>
            Passo 1: Link da prévia do site para este cliente
          </div>

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
                placeholder="Cole aqui o endereço do site modelo (https://...)"
              />
            </div>
            <button type="submit" className="fd-btn fd-btn-primary fd-btn-sm" disabled={savingPreview}>
              {savingPreview ? "Salvando..." : "Salvar Link"}
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            {trackedUrl ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                <span className={`fd-badge-pill ${(lead.previewViews ?? 0) > 0 ? "success" : "primary"}`}>
                  <Eye size={11} style={{ marginRight: 4 }} />
                  {lead.previewViews ?? 0} {lead.previewViews === 1 ? "clique" : "cliques"}
                  {lastViewLabel ? ` (${lastViewLabel})` : ""}
                </span>
                <button
                  type="button"
                  className="fd-btn fd-btn-sm"
                  style={{ height: 26, padding: "0 10px" }}
                  onClick={onCopyTrackedUrl}
                  title="Copia o link com contagem de cliques para você testar ou mandar manual"
                >
                  <Copy size={11} /> Copiar link com rastreio
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
                  Abrir site <ExternalLink size={11} />
                </a>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: "#7c8798" }}>
                Depois de salvar o link, o sistema cria automaticamente o contador de cliques.
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
                    alt="Foto do site modelo"
                    style={{ width: 28, height: 20, objectFit: "cover", borderRadius: 2 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#22ca80" }}>Foto pronta (Passo 2)</span>
                  <button
                    type="button"
                    onClick={onRemovePreviewImage}
                    title="Remover imagem"
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
                  title="Passo 2 (opcional): escolha uma imagem ou cole com Ctrl+V"
                >
                  <Upload size={12} />
                  <span>Passo 2: Enviar foto do site (opcional)</span>
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

      {/* Alerta Retorno 2d e 5d */}
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
            Sem resposta há {followUp.daysSinceSent} dias, sugerimos enviar o retorno de {followUp.due === "DAY_5" ? "5 dias" : "2 dias"}.
          </span>
          <button
            type="button"
            className="fd-btn fd-btn-sm fd-btn-dark"
            onClick={() => onLoadFollowUp(followUp.due as "DAY_2" | "DAY_5")}
          >
            Preparar Retorno
          </button>
        </div>
      )}

      {/* Historico da Conversa */}
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
              {lead.previewUrl ? "Passo 3: Tudo pronto para enviar no WhatsApp" : "Nenhuma mensagem enviada ainda"}
            </div>
            <p style={{ fontSize: 13, color: "#7c8798", margin: "0 0 14px" }}>
              {lead.previewUrl
                ? "Clique abaixo para montar a mensagem de apresentação já com o link da empresa."
                : "Salve o link da prévia no Passo 1 e depois clique abaixo para criar a mensagem."}
            </p>
            <button
              className="fd-btn fd-btn-primary fd-btn-rounded fd-btn-sm"
              onClick={onRequestAiDraft}
              disabled={generatingDraft}
            >
              <Sparkles size={13} />
              <span>{generatingDraft ? "Criando texto..." : "Criar Primeira Mensagem"}</span>
            </button>
          </div>
        ) : (
          lead?.messages?.map(msg => (
            <div key={msg.id} className={msg.direction === "OUTBOUND" ? "fd-chat-outbound" : "fd-chat-inbound"}>
              {msg.mediaUrl && (
                <img
                  src={msg.mediaUrl}
                  alt="Imagem enviada"
                  style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 4, marginBottom: 8, display: "block" }}
                />
              )}
              <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
              <div style={{ fontSize: 10, color: "#7c8798", marginTop: 4, textAlign: "right" }}>
                {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                {msg.direction === "OUTBOUND" && ` · ${msg.status === "SENT" ? "Enviada" : msg.status === "QUEUED" ? "Na fila" : msg.status}`}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Passo 3: Mensagem e Controle da IA */}
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
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 500, color: "#5f76e8" }}>
              <Bot size={15} /> Passo 3: Mensagem
            </span>
            {lead && (
              AI_STOPPED_STATUSES.has(lead.status) ? (
                <span className={`fd-badge-pill ${["OPTED_OUT", "BLOCKED"].includes(lead.status) ? "danger" : "warning"}`}>
                  IA encerrada nesta etapa
                </span>
              ) : lead.aiPausedAt ? (
                <>
                  <span className="fd-badge-pill warning">IA pausada (você assumiu)</span>
                  {onToggleAiPause && (
                    <button
                      type="button"
                      className="fd-btn fd-btn-sm fd-btn-rounded"
                      style={{ height: 24, padding: "0 10px", fontSize: 11 }}
                      disabled={updatingStatus}
                      onClick={() => onToggleAiPause(false)}
                    >
                      Ativar IA
                    </button>
                  )}
                </>
              ) : lead.initialSentAt ? (
                <>
                  <span className="fd-badge-pill success">IA respondendo automático</span>
                  {onToggleAiPause && (
                    <button
                      type="button"
                      className="fd-btn fd-btn-sm fd-btn-rounded"
                      style={{ height: 24, padding: "0 10px", fontSize: 11 }}
                      disabled={updatingStatus}
                      onClick={() => onToggleAiPause(true)}
                    >
                      Pausar IA
                    </button>
                  )}
                </>
              ) : null
            )}
            {lead?.previewImage && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, cursor: "pointer", color: "#1c2d41" }}>
                <input
                  type="checkbox"
                  checked={includePreviewImage}
                  onChange={e => onIncludePreviewImageChange(e.target.checked)}
                  style={{ accentColor: "#5f76e8" }}
                />
                <ImageIcon size={13} />
                <span>Enviar foto junto</span>
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
            {generatingDraft ? "Criando..." : "Sugerir Mensagem"}
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
            placeholder="Escreva a mensagem para o WhatsApp da empresa..."
          />
          <button
            type="submit"
            className="fd-btn fd-btn-primary fd-btn-rounded"
            style={{ height: 40, padding: "0 18px", flexShrink: 0 }}
            disabled={sendingMsg || !composerText.trim() || !lead}
          >
            <Send size={14} />
            <span>{sendingMsg ? "Enviando..." : "Enviar"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
