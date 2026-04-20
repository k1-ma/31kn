import React, { useMemo, useState } from "react";
import Header from "@/components/common/Header.jsx";
import { Card, CardContent } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { AvatarPill } from "@/components/common/Avatar.jsx";
import Press from "@/components/common/Press.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import ConfirmDialog from "@/components/common/ConfirmDialog.jsx";
import { Search, RotateCcw, Trash2, TrendingUp, TrendingDown, FileText, Lightbulb, Calendar, Target } from "lucide-react";
import { fmtMoney, isoDate } from "@/lib/utils";
import { HOVER_GLOW } from "@/lib/ui.js";
import { useI18n } from "@/i18n/I18nProvider.jsx";

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm border transition-all duration-200 ${
        active
          ? "border-[#3B82F6]/50 bg-gradient-to-r from-[#3B82F6] to-[#22D3EE] text-white shadow-[0_0_15px_rgba(59,130,246,0.25)]"
          : "border-accent/20 bg-card/40 hover:bg-card/60 hover:border-accent/35 hover:shadow-[0_0_10px_rgba(59,130,246,0.1)]"
      }`}
    >
      {children}
    </button>
  );
}

export default function Trash({
  trades,
  accounts,
  pairs,
  sessions,
  models,
  customTags,
  documents,
  ideas,
  onRestoreTrade,
  onDeleteTrade,
  onRestoreAccount,
  onDeleteAccount,
  onRestoreSymbol,
  onDeleteSymbol,
  onRestoreSession,
  onDeleteSession,
  onRestoreModel,
  onDeleteModel,
  onRestoreCustomTag,
  onDeleteCustomTag,
  onRestoreDocument,
  onDeleteDocument,
  onRestoreIdea,
  onDeleteIdea,
  reduceMotion,
  toast,
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("trades");

  const [confirm, setConfirm] = useState({ open: false, kind: null, id: null, name: "" });

  const data = useMemo(() => {
    const map = {
      trades: trades || [],
      accounts: accounts || [],
      pairs: pairs || [],
      sessions: sessions || [],
      models: models || [],
      customTags: customTags || [],
      documents: documents || [],
      ideas: ideas || [],
    };
    return map[tab] || [];
  }, [tab, trades, accounts, pairs, sessions, models, customTags, documents, ideas]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter((x) => {
      // Search in name, pair, title, or other relevant fields
      const searchFields = [
        x?.name,
        x?.pair,
        x?.title,
        x?.notes_text,
      ].filter(Boolean).join(" ").toLowerCase();
      return searchFields.includes(s);
    });
  }, [data, q]);

  const emptyDesc =
    tab === "trades"
      ? t("pages.trash.emptyTrades")
      : tab === "accounts"
        ? t("pages.trash.emptyAccounts")
        : tab === "documents"
          ? t("pages.trash.emptyDocuments")
          : tab === "ideas"
            ? t("pages.trash.emptyIdeas")
            : t("pages.trash.emptyItems");

  const openConfirm = (kind, id, name) => setConfirm({ open: true, kind, id, name: name || "" });

  const onConfirmDelete = () => {
    const { kind, id, name } = confirm;
    if (!kind || !id) return;

    if (kind === "trades") onDeleteTrade?.(id);
    if (kind === "accounts") onDeleteAccount?.(id);
    if (kind === "pairs") onDeleteSymbol?.(id);
    if (kind === "sessions") onDeleteSession?.(id);
    if (kind === "models") onDeleteModel?.(id);
    if (kind === "customTags") onDeleteCustomTag?.(id);
    if (kind === "documents") onDeleteDocument?.(id);
    if (kind === "ideas") onDeleteIdea?.(id);

    toast?.push?.({ title: t("common.deleted"), description: name || t("common.removedPermanently") });
  };

  const fmtDeleted = (d) => t("pages.trash.labels.deleted", { date: new Date(d || Date.now()).toLocaleDateString() });

  // Document type configuration for display
  const DOC_TYPE_CONFIG = {
    weekly_plan: { label: "Weekly Plan", icon: Calendar, color: "text-blue-400" },
    strategy: { label: "Strategy", icon: Target, color: "text-purple-400" },
    idea: { label: "Idea / Setup", icon: Lightbulb, color: "text-amber-400" },
    note: { label: "Note", icon: FileText, color: "text-slate-400" },
    weekly_review: { label: "Weekly Review", icon: TrendingUp, color: "text-emerald-400" },
  };

  return (
    <div className="space-y-4">
      <Header
        title={t("pages.trash.title")}
        subtitle={t("pages.trash.subtitle")}
        reduceMotion={reduceMotion}
        right={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pages.trades.searchPlaceholder")} className="pl-9 w-full sm:w-[260px]" />
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "trades"} onClick={() => setTab("trades")}>{t("pages.trash.tabs.trades")}</TabButton>
        <TabButton active={tab === "accounts"} onClick={() => setTab("accounts")}>{t("pages.trash.tabs.accounts")}</TabButton>
        <TabButton active={tab === "documents"} onClick={() => setTab("documents")}>{t("pages.trash.tabs.documents")}</TabButton>
        <TabButton active={tab === "ideas"} onClick={() => setTab("ideas")}>{t("pages.trash.tabs.ideas")}</TabButton>
        <TabButton active={tab === "pairs"} onClick={() => setTab("pairs")}>{t("pages.trash.tabs.pairs")}</TabButton>
        <TabButton active={tab === "sessions"} onClick={() => setTab("sessions")}>{t("pages.trash.tabs.sessions")}</TabButton>
        <TabButton active={tab === "models"} onClick={() => setTab("models")}>{t("pages.trash.tabs.models")}</TabButton>
        <TabButton active={tab === "customTags"} onClick={() => setTab("customTags")}>{t("pages.trash.tabs.customTags", null, "Tags")}</TabButton>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("pages.trash.emptyTitle")} description={emptyDesc} />
      ) : tab === "accounts" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((a) => (
            <Card key={a.id} className={`rounded-xl overflow-hidden ${HOVER_GLOW}`}>
              <CardContent className="px-4 pt-[20px] pb-10 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <AvatarPill avatar={a.avatar} color={a.color} label={a.name || t("common.untitled")} sub={fmtDeleted(a.deletedAt)} />
                  <Badge variant="secondary" className="rounded-full">{a.currency || "$"}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">{t("pages.trash.labels.starting")}</div>
                    <div className="mt-1 text-base font-semibold truncate">{fmtMoney(a.startingEquity, a.currency || "$")}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">{t("pages.trash.labels.current")}</div>
                    <div className="mt-1 text-base font-semibold truncate">{fmtMoney(a.currentEquity ?? a.startingEquity, a.currency || "$")}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/40 px-3 pt-[15px] pb-[9px]">
                  <div className="flex gap-2">
                    <Press reduceMotion={reduceMotion} className="inline-block">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          onRestoreAccount?.(a.id);
                          toast?.push?.({ title: t("common.restored"), description: a.name });
                        }}
                      >
                        <RotateCcw className="h-4 w-4" /> {t("common.restore")}
                      </Button>
                    </Press>
                    <Press reduceMotion={reduceMotion} className="inline-block">
                      <Button variant="danger" onClick={() => openConfirm("accounts", a.id, a.name)}>
                        <Trash2 className="h-4 w-4" /> {t("common.deleteForever")}
                      </Button>
                    </Press>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tab === "trades" ? (
        /* Trades - show pair, date, PnL for identification */
        <div className="space-y-3">
          {filtered.map((x) => {
            const isWin = (x.pnl ?? 0) > 0;
            const isLoss = (x.pnl ?? 0) < 0;
            const tradeDate = x.date ? new Date(x.date).toLocaleDateString() : "";
            return (
              <Card key={x.id} className={`rounded-xl ${HOVER_GLOW}`}>
                <CardContent className="px-5 pt-[30px] pb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Trade icon based on outcome */}
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                      isWin ? "bg-emerald-500/15" : isLoss ? "bg-red-500/15" : "bg-muted/30"
                    }`}>
                      {isWin ? (
                        <TrendingUp className="h-5 w-5 text-emerald-400" />
                      ) : isLoss ? (
                        <TrendingDown className="h-5 w-5 text-red-400" />
                      ) : (
                        <TrendingUp className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">
                        {x.pair || t("common.untitled")}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {tradeDate && <span>{tradeDate}</span>}
                        {tradeDate && x.pnl !== undefined && <span>•</span>}
                        {x.pnl !== undefined && (
                          <span className={isWin ? "text-emerald-400" : isLoss ? "text-red-400" : ""}>
                            {isWin ? "+" : ""}{fmtMoney(x.pnl)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground/60 mt-0.5">
                        {fmtDeleted(x.deletedAt)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Press reduceMotion={reduceMotion} className="inline-block">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          onRestoreTrade?.(x.id);
                          toast?.push?.({ title: t("common.restored"), description: x.pair || "Trade" });
                        }}
                      >
                        <RotateCcw className="h-4 w-4" /> {t("common.restore")}
                      </Button>
                    </Press>
                    <Press reduceMotion={reduceMotion} className="inline-block">
                      <Button variant="danger" onClick={() => openConfirm("trades", x.id, x.pair)}>
                        <Trash2 className="h-4 w-4" /> {t("common.deleteForever")}
                      </Button>
                    </Press>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : tab === "documents" ? (
        /* Documents - show type, title, date */
        <div className="space-y-3">
          {filtered.map((doc) => {
            const typeConfig = DOC_TYPE_CONFIG[doc.type] || DOC_TYPE_CONFIG.note;
            const TypeIcon = typeConfig.icon;
            const docDate = doc.updatedAt || doc.createdAt;
            return (
              <Card key={doc.id} className={`rounded-xl ${HOVER_GLOW}`}>
                <CardContent className="px-5 pt-[30px] pb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center bg-muted/30`}>
                      <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">
                        {doc.title || t("common.untitled")}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className={typeConfig.color}>{typeConfig.label}</span>
                        {docDate && (
                          <>
                            <span>•</span>
                            <span>{new Date(docDate).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground/60 mt-0.5">
                        {fmtDeleted(doc.archivedAt)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Press reduceMotion={reduceMotion} className="inline-block">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          onRestoreDocument?.(doc.id);
                          toast?.push?.({ title: t("common.restored"), description: doc.title || "Document" });
                        }}
                      >
                        <RotateCcw className="h-4 w-4" /> {t("common.restore")}
                      </Button>
                    </Press>
                    <Press reduceMotion={reduceMotion} className="inline-block">
                      <Button variant="danger" onClick={() => openConfirm("documents", doc.id, doc.title)}>
                        <Trash2 className="h-4 w-4" /> {t("common.deleteForever")}
                      </Button>
                    </Press>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : tab === "ideas" ? (
        /* Trading Ideas - show title, pair, date */
        <div className="space-y-3">
          {filtered.map((idea) => {
            const ideaDate = idea.deleted_at || idea.created_at;
            return (
              <Card key={idea.id} className={`rounded-xl ${HOVER_GLOW}`}>
                <CardContent className="px-5 pt-[30px] pb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-amber-500/15">
                      <Lightbulb className="h-5 w-5 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">
                        {idea.title || t("common.untitled")}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {idea.pair && <span>{idea.pair}</span>}
                        {idea.pair && idea.direction && <span>•</span>}
                        {idea.direction && <span>{idea.direction}</span>}
                        {ideaDate && (
                          <>
                            <span>•</span>
                            <span>{new Date(ideaDate).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground/60 mt-0.5">
                        {fmtDeleted(idea.deleted_at)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Press reduceMotion={reduceMotion} className="inline-block">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          onRestoreIdea?.(idea.id);
                          toast?.push?.({ title: t("common.restored"), description: idea.title || "Idea" });
                        }}
                      >
                        <RotateCcw className="h-4 w-4" /> {t("common.restore")}
                      </Button>
                    </Press>
                    <Press reduceMotion={reduceMotion} className="inline-block">
                      <Button variant="danger" onClick={() => openConfirm("ideas", idea.id, idea.title)}>
                        <Trash2 className="h-4 w-4" /> {t("common.deleteForever")}
                      </Button>
                    </Press>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Default: pairs, sessions */
        <div className="space-y-3">
          {filtered.map((x) => (
            <Card key={x.id} className={`rounded-xl ${HOVER_GLOW}`}>
              <CardContent className="px-5 pt-[30px] pb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AvatarPill
                    avatar={x.avatar}
                    color={x.color}
                    label={x.name || x.pair || t("common.untitled")}
                    sub={fmtDeleted(x.deletedAt)}
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Press reduceMotion={reduceMotion} className="inline-block">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (tab === "pairs") onRestoreSymbol?.(x.id);
                        if (tab === "sessions") onRestoreSession?.(x.id);
                        if (tab === "models") onRestoreModel?.(x.id);
                        if (tab === "customTags") onRestoreCustomTag?.(x.id);
                        toast?.push?.({ title: t("common.restored"), description: x.name || x.pair });
                      }}
                    >
                      <RotateCcw className="h-4 w-4" /> {t("common.restore")}
                    </Button>
                  </Press>
                  <Press reduceMotion={reduceMotion} className="inline-block">
                    <Button variant="danger" onClick={() => openConfirm(tab, x.id, x.name || x.pair)}>
                      <Trash2 className="h-4 w-4" /> {t("common.deleteForever")}
                    </Button>
                  </Press>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(v) => setConfirm((p) => ({ ...p, open: v }))}
        title={t("common.permanentDeleteTitle")}
        description={t("common.permanentDeleteDesc")}
        confirmText={t("common.deleteForever")}
        cancelText={t("common.cancel")}
        tone="danger"
        onConfirm={onConfirmDelete}
        reduceMotion={reduceMotion}
      />
    </div>
  );
}
