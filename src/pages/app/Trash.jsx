import React, { useMemo } from "react";
import { Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { useFinance } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { formatMoney } from "@/lib/money.js";
import { useConfirm } from "@/components/common/ConfirmProvider.jsx";
import { useToast } from "@/components/common/ToastProvider.jsx";

const COLLECTIONS = ["transactions", "wallets", "categories", "budgets", "goals", "recurring", "debts"];

export default function TrashPage() {
  const { t, lang } = useI18n();
  const { state, restore, purge } = useFinance();
  const confirm = useConfirm();
  const toast = useToast();

  const items = useMemo(() => {
    const all = [];
    for (const c of COLLECTIONS) {
      for (const x of state[c] || []) {
        if (x.deletedAt) all.push({ collection: c, item: x });
      }
    }
    return all.sort((a, b) => new Date(b.item.deletedAt) - new Date(a.item.deletedAt));
  }, [state]);

  const onPurge = async (collection, item) => {
    const ok = await confirm({
      title: t("common.delete"),
      body: t("trash.purgeConfirm"),
      danger: true,
      label: t("common.delete"),
    });
    if (!ok) return;
    purge(collection, item.id);
    toast.push({ kind: "success", title: t("toasts.deleted") });
  };

  const onRestore = (collection, item) => {
    restore(collection, item.id);
    toast.push({ kind: "success", title: t("toasts.restored") });
  };

  const renderItem = ({ collection, item }) => {
    let label = item.name || "—";
    if (collection === "transactions") {
      label = `${item.type} · ${formatMoney(item.amount_cents, item.currency, lang)}`;
    }
    return (
      <div
        key={item.id}
        className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{label}</div>
          <div className="text-xs text-slate-500">{collection}</div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => onRestore(collection, item)}>
          {t("trash.restore")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onPurge(collection, item)}>
          {t("common.delete")}
        </Button>
      </div>
    );
  };

  return (
    <div className="page-enter space-y-4">
      <PageHeader title={t("nav.trash")} />
      {items.length === 0 ? (
        <EmptyState icon={Trash2} title={t("trash.empty")} description={t("trash.emptyHint")} />
      ) : (
        <Card className="overflow-hidden">{items.map(renderItem)}</Card>
      )}
    </div>
  );
}
