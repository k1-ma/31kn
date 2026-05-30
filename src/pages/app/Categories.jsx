import React, { useMemo, useState } from "react";
import { Tags, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import ConfirmDialog from "@/components/ui/ConfirmDialog.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { reorderSiblings } from "@/lib/finance/reorder.js";

const ICONS = ["🍔", "🏠", "🚗", "👕", "💊", "🎬", "📚", "✈️", "🎁", "💼", "🐾", "📱", "🏦", "❓", "💻", "🔄", "📈", "🎉"];

function CategoryForm({ open, onClose, initial }) {
  const { t } = useI18n();
  const { upsert } = useFinance();
  const [name, setName] = useState(initial?.name || "");
  const [kind, setKind] = useState(initial?.kind || "expense");
  const [icon, setIcon] = useState(initial?.icon || "❓");

  React.useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setKind(initial?.kind || "expense");
      setIcon(initial?.icon || "❓");
    }
  }, [open, initial]);

  return (
    <BottomSheet open={open} onClose={onClose} title={initial ? t("common.edit") : t("categories.add")}>
      <div className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("wallets.name")} />
        <div className="grid grid-cols-2 gap-2">
          {["expense", "income"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`h-10 rounded-xl border font-medium ${
                kind === k
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              {t(`tx.${k}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-9 gap-2">
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIcon(i)}
              className={`h-10 rounded-xl text-xl border ${
                icon === i ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950" : "border-slate-200 dark:border-slate-700"
              }`}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              if (!name.trim()) return;
              upsert("categories", {
                id: initial?.id,
                name: name.trim(),
                kind,
                icon,
                color: initial?.color || "#10B981",
                sortOrder: initial?.sortOrder ?? 0,
              });
              onClose();
            }}
          >
            {t("common.save")}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}

export default function Categories() {
  const { t } = useI18n();
  const { state, upsert, remove } = useFinance();
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const cats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return active(state.categories)
      .filter((c) => !q || (c.name || "").toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id)));
  }, [state.categories, search]);
  const expense = cats.filter((c) => c.kind === "expense");
  const income = cats.filter((c) => c.kind === "income");

  const move = (cat, dir) => {
    const swap = reorderSiblings(state.categories, cat, dir, (x) => x.kind === cat.kind);
    if (!swap) return;
    swap.forEach((x) => upsert("categories", x));
  };

  const renderList = (list) => (
    <Card className="overflow-hidden">
      {list.map((c, idx) => (
        <div
          key={c.id}
          className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
        >
          <span className="text-2xl">{c.icon}</span>
          <button
            className="flex-1 text-left text-sm font-medium text-slate-900 dark:text-slate-100"
            onClick={() => { setEditing(c); setOpen(true); }}
          >
            {c.name}
          </button>
          <button
            disabled={idx === 0}
            onClick={() => move(c, -1)}
            className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
            aria-label="Move up"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            disabled={idx === list.length - 1}
            onClick={() => move(c, 1)}
            className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
            aria-label="Move down"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            onClick={() => setConfirmDelete(c.id)}
            className="p-2 text-slate-400 hover:text-red-500"
            aria-label={t("common.delete")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </Card>
  );

  return (
    <div className="page-enter space-y-5">
      <PageHeader
        title={t("nav.categories")}
        right={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            {t("categories.add")}
          </Button>
        }
      />
      <Input
        placeholder={t("common.search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {cats.length === 0 ? (
        <EmptyState icon={Tags} title={t("categories.empty")} />
      ) : (
        <>
          {expense.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-2 px-1">
                {t("categories.expense")}
              </div>
              {renderList(expense)}
            </div>
          )}
          {income.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-2 px-1">
                {t("categories.income")}
              </div>
              {renderList(income)}
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        title={t("common.deleteTitle")}
        message={t("common.deleteMessage")}
        confirmLabel={t("common.delete")}
        onConfirm={() => { remove("categories", confirmDelete); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
      <CategoryForm
        key={editing?.id || "new"}
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        initial={editing}
      />
    </div>
  );
}
