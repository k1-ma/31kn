import React, { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import ConfirmDialog from "@/components/ui/ConfirmDialog.jsx";
import { useFinance } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { formatMoney } from "@/lib/money.js";

const COLLECTIONS = ["transactions", "wallets", "categories", "budgets", "goals"];

export default function TrashPage() {
  const { t, lang } = useI18n();
  const { state, restore, purge } = useFinance();
  const [confirmDelete, setConfirmDelete] = useState(null);

  const items = useMemo(() => {
    const all = [];
    for (const c of COLLECTIONS) {
      for (const x of state[c] || []) {
        if (x.deletedAt) all.push({ collection: c, item: x });
      }
    }
    return all.sort((a, b) => new Date(b.item.deletedAt) - new Date(a.item.deletedAt));
  }, [state]);

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
        <Button size="sm" variant="secondary" onClick={() => restore(collection, item.id)}>
          {t("trash.restore")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete({ collection, id: item.id })}>
          {t("common.delete")}
        </Button>
      </div>
    );
  };

  return (
    <div className="page-enter space-y-4">
      <PageHeader title={t("nav.trash")} />
      <ConfirmDialog
        open={!!confirmDelete}
        title={t("common.purgeTitle")}
        message={t("common.purgeMessage")}
        confirmLabel={t("common.delete")}
        onConfirm={() => { purge(confirmDelete.collection, confirmDelete.id); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
      {items.length === 0 ? (
        <EmptyState icon={Trash2} title={t("trash.empty")} description={t("trash.emptyHint")} />
      ) : (
        <Card className="overflow-hidden">{items.map(renderItem)}</Card>
      )}
    </div>
  );
}
