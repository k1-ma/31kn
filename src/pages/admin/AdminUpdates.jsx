import React, { useEffect, useState, useCallback } from "react";
import { apiJson, updatesApi } from "@/lib/api.js";
import Header from "@/components/common/Header.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Switch from "@/components/ui/Switch.jsx";
import ToastViewport from "@/components/common/ToastViewport.jsx";
import { useToasts } from "@/components/common/toast.js";
import AdminLayout from "./AdminLayout.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import {
  Sparkles, RefreshCcw, Plus, Edit2, Trash2, Eye, EyeOff,
  Calendar, Tag, Package, Check, X, AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const UPDATE_CATEGORIES = ["Feature", "Bugfix", "Improvement", "Security", "Performance", "UI", "Other"];

const CATEGORY_COLORS = {
  Feature: "bg-purple-500/20 text-purple-400",
  Bugfix: "bg-red-500/20 text-red-400",
  Improvement: "bg-amber-500/20 text-amber-400",
  Security: "bg-emerald-500/20 text-emerald-400",
  Performance: "bg-blue-500/20 text-blue-400",
  UI: "bg-pink-500/20 text-pink-400",
  Other: "bg-slate-500/20 text-slate-400",
};

function UpdateForm({ update, onSave, onCancel, saving }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(update?.title || "");
  const [description, setDescription] = useState(update?.description || "");
  const [category, setCategory] = useState(update?.category || "Other");
  const [version, setVersion] = useState(update?.version || "");
  const [isPublished, setIsPublished] = useState(update?.is_published || false);
  const [publishedAt, setPublishedAt] = useState(() => {
    if (update?.published_at) {
      return new Date(update.published_at).toISOString().split("T")[0];
    }
    return "";
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      category,
      version: version.trim() || null,
      is_published: isPublished,
      published_at: publishedAt || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-1 block">{t("admin.updates.form.title")}</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("admin.updates.form.titlePlaceholder")}
          maxLength={200}
          className="rounded-xl"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block">{t("admin.updates.form.description")}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("admin.updates.form.descriptionPlaceholder")}
          maxLength={5000}
          rows={4}
          className="w-full px-4 py-3 rounded-xl bg-muted/20 border border-border/50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium mb-1 block">{t("admin.updates.form.category")}</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-2 rounded-xl bg-muted/20 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            {UPDATE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">{t("admin.updates.form.version")}</label>
          <Input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0.0"
            maxLength={50}
            className="rounded-xl"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block">{t("admin.updates.form.publishDate", null, "Publish Date")}</label>
        <Input
          type="date"
          value={publishedAt}
          onChange={(e) => setPublishedAt(e.target.value)}
          className="rounded-xl"
        />
        <p className="text-xs text-muted-foreground mt-1">{t("admin.updates.form.publishDateHint", null, "Leave empty for current date when publishing")}</p>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/10 p-4">
        <div>
          <div className="font-medium text-sm">{t("admin.updates.form.publish")}</div>
          <div className="text-xs text-muted-foreground">{t("admin.updates.form.publishHint")}</div>
        </div>
        <Switch checked={isPublished} onCheckedChange={setIsPublished} />
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} className="rounded-xl">
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!title.trim() || saving} className="rounded-xl">
          {saving ? t("common.working") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

function UpdateRow({ update, onEdit, onDelete, onTogglePublish }) {
  const { t } = useI18n();
  const date = update.published_at 
    ? new Date(update.published_at).toLocaleDateString() 
    : new Date(update.created_at).toLocaleDateString();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border/50 bg-muted/10 hover:bg-muted/20 transition"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-medium text-sm truncate">{update.title}</h4>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[update.category] || CATEGORY_COLORS.Other}`}>
            {update.category}
          </span>
          {update.version && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
              v{update.version}
            </span>
          )}
          {update.is_published ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
              <Eye className="h-2.5 w-2.5" />
              {t("admin.updates.status.published", null, "Published")}
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 flex items-center gap-1">
              <EyeOff className="h-2.5 w-2.5" />
              {t("admin.updates.status.draft", null, "Draft")}
            </span>
          )}
        </div>
        {update.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{update.description}</p>
        )}
        <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
          <Calendar className="h-2.5 w-2.5" />
          {date}
          {update.admin_nickname && (
            <span className="ml-2">{t("admin.updates.by", null, "by")} {update.admin_nickname}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl h-8 w-8"
          onClick={() => onTogglePublish(update)}
          title={update.is_published ? t("admin.updates.unpublish", null, "Unpublish") : t("admin.updates.publish", null, "Publish")}
        >
          {update.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl h-8 w-8"
          onClick={() => onEdit(update)}
          title={t("common.edit")}
        >
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl h-8 w-8 text-rose-400 hover:text-rose-500"
          onClick={() => onDelete(update)}
          title={t("common.delete")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}

export default function AdminUpdates() {
  const { t } = useI18n();
  const toast = useToasts();
  
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState(null);

  const loadUpdates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await updatesApi.adminList();
      setUpdates(data.updates || []);
    } catch (e) {
      setError(e?.message || "Failed to load updates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUpdates();
  }, [loadUpdates]);

  const handleSave = async (data) => {
    setSaving(true);
    try {
      if (editingUpdate) {
        await updatesApi.adminUpdate(editingUpdate.id, data);
        toast.push({ title: t("common.done"), description: t("admin.updates.toasts.saved", null, "Update saved"), tone: "success" });
      } else {
        await updatesApi.adminCreate(data);
        toast.push({ title: t("common.done"), description: t("admin.updates.toasts.created", null, "Update created"), tone: "success" });
      }
      setShowForm(false);
      setEditingUpdate(null);
      loadUpdates();
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || t("admin.updates.toasts.saveFailed", null, "Failed to save"), tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (update) => {
    setEditingUpdate(update);
    setShowForm(true);
  };

  const handleDelete = async (update) => {
    if (!confirm(`${t("common.delete")} "${update.title}"?`)) return;
    try {
      await updatesApi.adminDelete(update.id);
      toast.push({ title: t("common.done"), description: t("admin.updates.toasts.deleted", null, "Update deleted"), tone: "success" });
      loadUpdates();
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || t("admin.updates.toasts.deleteFailed", null, "Failed to delete"), tone: "danger" });
    }
  };

  const handleTogglePublish = async (update) => {
    try {
      await updatesApi.adminUpdate(update.id, { is_published: !update.is_published });
      toast.push({ 
        title: t("common.done"), 
        description: update.is_published 
          ? t("admin.updates.toasts.unpublished", null, "Unpublished") 
          : t("admin.updates.toasts.published", null, "Published"), 
        tone: "success" 
      });
      loadUpdates();
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || t("admin.updates.toasts.updateFailed", null, "Failed to update"), tone: "danger" });
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingUpdate(null);
  };

  const headerActions = (
    <>
      <Button variant="ghost" className="rounded-xl" onClick={loadUpdates} title={t("common.refresh")}>
        <RefreshCcw className="h-4 w-4" />
      </Button>
      {!showForm && (
        <Button onClick={() => setShowForm(true)} className="rounded-xl">
          <Plus className="h-4 w-4 mr-2" />
          {t("admin.updates.addButton", null, "Add Update")}
        </Button>
      )}
    </>
  );

  return (
    <AdminLayout
      title={t("admin.nav.updates", null, "Updates")}
      subtitle={t("admin.updates.subtitle", null, "Manage project updates and changelog")}
      actions={headerActions}
    >
      {/* Error message */}
      {error && (
        <Card className="mb-6 rounded-2xl border-2 border-dashed border-rose-500/30">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-rose-400/50" />
            <h3 className="text-base font-semibold mb-1 text-rose-400">{t("admin.updates.error.title", null, "Failed to load")}</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {error}
            </p>
            <Button onClick={loadUpdates} className="rounded-xl">
              <RefreshCcw className="h-4 w-4 mr-2" />
              {t("common.refresh")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6"
          >
            <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {editingUpdate ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                  {editingUpdate 
                    ? t("admin.updates.editTitle", null, "Edit Update")
                    : t("admin.updates.createTitle", null, "New Update")
                  }
                </CardTitle>
              </CardHeader>
              <CardContent>
                <UpdateForm
                  update={editingUpdate}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  saving={saving}
                />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Updates List */}
      <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {t("admin.updates.listTitle", null, "Project Updates")}
            <span className="text-sm font-normal text-muted-foreground">({updates.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : updates.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              {t("admin.updates.empty", null, "No updates yet. Create your first one!")}
            </div>
          ) : (
            updates.map((update) => (
              <UpdateRow
                key={update.id}
                update={update}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onTogglePublish={handleTogglePublish}
              />
            ))
          )}
        </CardContent>
      </Card>

      <ToastViewport toasts={toast.toasts} onClose={toast.remove} />
    </AdminLayout>
  );
}
