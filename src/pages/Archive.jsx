import React, { useMemo, useState } from "react";
import Header from "@/components/common/Header.jsx";
import { Card, CardContent } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { AvatarPill } from "@/components/common/Avatar.jsx";
import Press from "@/components/common/Press.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { ArchiveRestore, Search, Trash2 } from "lucide-react";
import { fmtMoney, clampNum } from "@/lib/utils";
import { HOVER_GLOW } from "@/lib/ui.js";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function Archive({ accounts, onUnarchive, onTrash, reduceMotion, toast }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return accounts || [];
    return (accounts || []).filter((a) => `${a.name ?? ""} ${a.status ?? ""} ${a.currency ?? ""}`.toLowerCase().includes(s));
  }, [accounts, q]);

  return (
    <div className="space-y-4">
      <Header
        title={t("pages.archive.title")}
        subtitle={t("pages.archive.subtitle")}
        reduceMotion={reduceMotion}
        right={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pages.trades.searchPlaceholder")} className="pl-9 w-full sm:w-[260px]" />
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={t("pages.archive.emptyTitle")}
          description={t("pages.archive.emptyHint")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((a) => {
            const archivedDate = new Date(a.archivedAt || Date.now()).toLocaleDateString();
            return (
              <Card key={a.id} className={`rounded-xl overflow-hidden ${HOVER_GLOW}`}>
                <CardContent className="px-4 pt-[20px] pb-10 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <AvatarPill
                      avatar={a.avatar}
                      color={a.color}
                      label={a.name || "Untitled"}
                      sub={t("pages.archive.labels.archived", { date: archivedDate })}
                      className=""
                    />
                    <Badge variant="secondary" className="rounded-full">{a.currency || "$"}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <div className="text-[11px] text-muted-foreground">{t("pages.archive.labels.starting")}</div>
                      <div className="mt-1 text-base font-semibold truncate">{fmtMoney(a.startingEquity, a.currency || "$")}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <div className="text-[11px] text-muted-foreground">{t("pages.archive.labels.current")}</div>
                      <div className="mt-1 text-base font-semibold truncate">{fmtMoney(a.currentEquity ?? a.startingEquity, a.currency || "$")}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/40 px-3 pt-[15px] pb-[9px]">
                    <div className="text-sm">
                      {t("common.risk")}: <b>{clampNum(a.defaultRiskPct)}%</b>
                    </div>
                    <div className="flex gap-2">
                      <Press reduceMotion={reduceMotion} className="inline-block">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            onUnarchive?.(a.id);
                            toast?.push?.({ title: t("common.unarchived"), description: a.name });
                          }}
                        >
                          <ArchiveRestore className="h-4 w-4" /> {t("pages.archive.actions.restore")}
                        </Button>
                      </Press>
                      <Press reduceMotion={reduceMotion} className="inline-block">
                        <Button
                          variant="outline"
                          onClick={() => {
                            onTrash?.(a.id);
                            toast?.push?.({ title: t("common.movedToTrashToast"), description: a.name });
                          }}
                        >
                          <Trash2 className="h-4 w-4" /> {t("pages.archive.actions.toTrash")}
                        </Button>
                      </Press>
                    </div>
                  </div>

                  {a.notes ? <div className="text-xs text-muted-foreground line-clamp-2">{String(a.notes).slice(0, 220)}</div> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
