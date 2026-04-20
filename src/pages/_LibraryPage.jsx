import React, { useMemo, useRef, useState, useEffect, memo, useCallback } from "react";
import Header from "@/components/common/Header.jsx";
import { Card, CardContent } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Modal from "@/components/common/Modal.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { AvatarPill } from "@/components/common/Avatar.jsx";
import SessionBadge from "@/components/common/SessionBadge.jsx";
import Press from "@/components/common/Press.jsx";
import Skeleton from "@/components/common/Skeleton.jsx";
import useSoftLoading from "@/components/common/useSoftLoading.js";
import { AnimatePresence, motion, Reorder, useDragControls } from "framer-motion";
import { GripVertical, Plus, Search, Trash2, Upload, X, Layers } from "lucide-react";
import { uid, resizeImageFileToDataUrl } from "@/lib/utils";
import { HOVER_GLOW } from "@/lib/ui.js";
import { useI18n } from "@/i18n/I18nProvider.jsx";

// Default emoji options for pairs
const PAIR_EMOJIS = ["📈", "📉", "💹", "💰", "🪙", "💎", "🛢️", "🌾", "🏦", "📊"];

// Default emoji options for sessions  
const SESSION_EMOJIS = ["🕒", "🌅", "🌆", "🌃", "🌏", "🗽", "🏛️", "🌐", "⏰", "📍"];

// Default emoji options for models
const MODEL_EMOJIS = ["🧠", "📐", "🎯", "⚡", "🔮", "📊", "🧩", "🔑", "💡", "🏹"];

// Default emoji options for tags
const TAG_EMOJIS = ["🏷️", "🔖", "📌", "⭐", "🔄", "📋", "🎯", "⚡", "💡", "🔥"];

// Default colors for accent color selection
const DEFAULT_COLORS = [
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#dcc218", // gold
];

function ItemForm({ initial, onSave, onDelete, reduceMotion, defaults, kind, toast }) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  
  // Determine avatar type from initial data
  const getInitialAvatarType = () => {
    if (initial?.avatar?.type === "image" && initial?.avatar?.imageData) {
      return "image";
    }
    return "emoji";
  };
  
  const [form, setForm] = useState(() => ({
    id: initial?.id || uid(),
    name: initial?.name || "",
    avatarType: getInitialAvatarType(),
    emoji: initial?.avatar?.emoji || defaults.emoji,
    imageData: initial?.avatar?.imageData || null,
    color: initial?.color || defaults.color,
    createdAt: initial?.createdAt || Date.now(),
  }));

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, { maxSize: 160, quality: 0.82 });
      setForm(f => ({ ...f, avatarType: "image", imageData: dataUrl }));
    } catch (err) {
      // Fallback to FileReader
      const reader = new FileReader();
      reader.onload = () =>
        setForm(f => ({ ...f, avatarType: "image", imageData: String(reader.result || "") }));
      reader.readAsDataURL(file);
    }
  };

  const save = () => {
    const name = String(form.name || "").trim();
    if (!name) {
      toast?.push?.({ title: t("common.error"), description: t("pages.library.nameRequired"), tone: "danger" });
      return;
    }
    
    // Build avatar object
    const avatar = form.avatarType === "image" && form.imageData
      ? { type: "image", imageData: form.imageData }
      : { type: "emoji", emoji: form.emoji };
    
    onSave({ 
      id: form.id,
      name, 
      avatar,
      color: form.color || defaults.color,
      createdAt: form.createdAt,
    });
  };

  // Get emoji options based on kind
  const emojiOptions = kind === "session" ? SESSION_EMOJIS : kind === "model" ? MODEL_EMOJIS : kind === "tag" ? TAG_EMOJIS : PAIR_EMOJIS;

  return (
    <div className="space-y-4">
      {/* Name Input */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t("common.name")} *
        </label>
        <Input
          type="text"
          placeholder={defaults.placeholder}
          value={form.name}
          onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
          autoFocus
        />
      </div>
      
      {/* Avatar Selection */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">
          {t("common.avatar")}
        </label>
        
        {/* Avatar Type Toggle */}
        <div className="p-1 rounded-xl bg-muted/30 border border-border/30 mb-3">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, avatarType: "emoji" }))}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                form.avatarType === "emoji" 
                  ? "bg-accent/20 text-accent border border-accent/30" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t("common.emoji")}
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, avatarType: "image" }))}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                form.avatarType === "image" 
                  ? "bg-accent/20 text-accent border border-accent/30" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t("pages.library.image")}
            </button>
          </div>
        </div>
        
        {/* Emoji Selection */}
        {form.avatarType === "emoji" && (
          <div className="flex flex-wrap gap-2">
            {emojiOptions.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setForm(f => ({ ...f, emoji }))}
                className={`w-10 h-10 text-xl rounded-lg flex items-center justify-center transition-all ${
                  form.emoji === emoji 
                    ? "bg-accent/20 border-2 border-accent" 
                    : "bg-muted/30 border border-border/30 hover:bg-muted/50"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        
        {/* Image Upload */}
        {form.avatarType === "image" && (
          <div className="space-y-2">
            {form.imageData ? (
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted/30 border border-border/30">
                  <img 
                    src={form.imageData} 
                    alt={form.name || "Avatar"} 
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, imageData: null }))}
                  className="p-2 rounded-lg bg-muted/30 hover:bg-red-500/20 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 rounded-xl border-2 border-dashed border-border/50 hover:border-accent/50 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-2"
              >
                <Upload className="h-4 w-4" />
                {t("common.upload")}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
        )}
      </div>
      
      {/* Accent Color */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">
          {t("common.accentColor")}
        </label>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setForm(f => ({ ...f, color }))}
              className={`w-8 h-8 rounded-lg transition-all ${
                form.color === color 
                  ? "ring-2 ring-offset-2 ring-offset-background ring-accent" 
                  : "hover:scale-110"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
      
      {/* Preview */}
      <div className="p-3 rounded-xl bg-muted/20 border border-border/30">
        <div className="text-[10px] text-muted-foreground mb-2">
          {t("common.preview")}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
              style={{ 
                backgroundColor: `${form.color}20`,
                border: `1px solid ${form.color}40`
              }}
            >
              {form.avatarType === "image" && form.imageData ? (
                <img src={form.imageData} alt={form.name || "Preview"} className="w-full h-full object-cover rounded-lg" />
              ) : (
                form.emoji
              )}
            </div>
            <span className="font-medium">{form.name || defaults.kindLabel}</span>
          </div>
          {kind === "session" ? (
            <SessionBadge name={form.name || defaults.kindLabel} reduceMotion={reduceMotion} />
          ) : (
            <Badge variant="secondary" className="rounded-full">
              {t("common.active")}
            </Badge>
          )}
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-2">
        {onDelete && (
          <Button variant="ghost" onClick={onDelete} className="text-red-500 hover:text-red-600 hover:bg-red-500/10">
            <Trash2 className="h-4 w-4 mr-1" />
            {t("common.moveToTrash")}
          </Button>
        )}
        <Button onClick={save}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

// Stable row components — defined outside LibraryPageInner so React keeps
// the same component type across parent re-renders (prevents unmount/remount).
const StaticRow = memo(({ x, idx, onOpen, reduceMotion, sub, kind, activeLabel }) => (
  <motion.div
    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
    animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
    exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
    transition={reduceMotion ? { duration: 0 } : { duration: 0.18, delay: Math.min(idx * 0.02, 0.12) }}
    whileHover={reduceMotion ? {} : { y: -2 }}
  >
    <Card className={`rounded-xl cursor-pointer ${HOVER_GLOW}`} onClick={() => onOpen(x)}>
      <CardContent className="p-5 flex items-center justify-between gap-3">
        <AvatarPill avatar={x.avatar} color={x.color} label={x.name} sub={sub} />
        {kind === "session" ? (
          <SessionBadge name={x.name} reduceMotion={reduceMotion} />
        ) : (
          <Badge variant="secondary" className="rounded-full">
            {activeLabel}
          </Badge>
        )}
      </CardContent>
    </Card>
  </motion.div>
));

const DraggableRow = memo(({ x, idx, onOpen, reduceMotion, sub, kind, activeLabel, dragTitle }) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={x}
      id={x.id}
      dragListener={false}
      dragControls={controls}
      whileDrag={reduceMotion ? {} : { scale: 1.02 }}
      className="relative"
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.18, delay: Math.min(idx * 0.02, 0.12) }}
      >
        <Card className={`rounded-xl ${HOVER_GLOW}`}>
          <CardContent className="p-4 pt-5 flex items-center gap-3">
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                controls.start(e);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--muted))]/35 text-muted-foreground hover:text-[rgb(var(--fg))]"
              title={dragTitle}
            >
              <GripVertical className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => onOpen(x)}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))]/35 glass px-3 py-3 text-left hover:bg-[rgb(var(--card))]/45"
            >
              <AvatarPill avatar={x.avatar} color={x.color} label={x.name} sub={sub} />
              <div className="shrink-0">
                {kind === "session" ? (
                  <SessionBadge name={x.name} reduceMotion={reduceMotion} />
                ) : (
                  <Badge variant="secondary" className="rounded-full">
                    {activeLabel}
                  </Badge>
                )}
              </div>
            </button>
          </CardContent>
        </Card>
      </motion.div>
    </Reorder.Item>
  );
});

function LibraryPageInner({
  title,
  subtitle,
  items,
  onUpsert,
  onRemove,
  onReorder,
  reduceMotion,
  toast,
  defaults,
  kind = "pair",
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [active, setActive] = useState(null);

  const searching = q.trim().length > 0;
  // Use title and search query only for loading key - items.length changes shouldn't trigger loading skeleton
  const key = `${title}|${q}`;
  const loading = useSoftLoading(key, reduceMotion ? 0 : 180);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((x) => String(x.name).toLowerCase().includes(s));
  }, [items, q]);

  // local reorder state for Reorder.Group — only update when items actually change
  const [rv, setRv] = useState(items);
  const prevItemsRef = useRef(items);
  useEffect(() => {
    const prev = prevItemsRef.current;
    if (prev !== items) {
      // Skip update if array contents are identical (same ids in same order)
      const same = prev.length === items.length && prev.every((p, i) => p.id === items[i]?.id);
      if (!same) setRv(items);
      prevItemsRef.current = items;
    }
  }, [items]);

  const openItem = useCallback((x) => {
    setActive(x);
    setOpenEdit(true);
  }, []);

  const activeLabel = t("common.active");
  const dragTitle = t("common.dragToReorder");

  return (
    <div className="space-y-4">
      {/* Enhanced Header Section */}
      <div className="rounded-xl border border-accent/15 bg-gradient-to-r from-card via-muted/10 to-card p-6 relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute -left-16 -bottom-16 h-36 w-36 rounded-full bg-accent/10 blur-2xl" />
        
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center border border-accent/20">
              <Layers className="h-7 w-7 text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-xl bg-[#0B1220]/40 border border-accent/20">
              <div className="text-2xl font-bold">{items?.length || 0}</div>
              <div className="text-xs text-muted-foreground">{t("common.total")}</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Search and Add Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-card/50 border border-accent/15">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            value={q} 
            onChange={(e) => setQ(e.target.value)} 
            placeholder={t("pages.library.searchPlaceholder")} 
            className="pl-9 h-10 rounded-xl" 
          />
        </div>

        <Press reduceMotion={reduceMotion} className="inline-block">
          <Button onClick={() => setOpenCreate(true)} className="gap-2 h-10 px-5 rounded-xl shadow-lg shadow-accent/20">
            <Plus className="h-4 w-4" /> {t("pages.library.add")}
          </Button>
        </Press>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-xl border border-[rgb(var(--border))]" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {!searching ? (
            <Reorder.Group
              axis="y"
              values={rv}
              onReorder={(next) => {
                setRv(next);
                // Only propagate to parent when the order actually changed
                const changed = next.length !== rv.length || next.some((item, i) => item.id !== rv[i]?.id);
                if (changed) onReorder?.(next);
              }}
              className="space-y-3"
            >
              {/* initial={false} prevents re-animation when items are already present */}
              <AnimatePresence initial={false}>
                {rv.map((x, idx) => (
                  <DraggableRow key={x.id} x={x} idx={idx} onOpen={openItem} reduceMotion={reduceMotion} sub={defaults.sub} kind={kind} activeLabel={activeLabel} dragTitle={dragTitle} />
                ))}
              </AnimatePresence>
            </Reorder.Group>
          ) : (
            <div className="space-y-3">
              {/* initial={false} prevents re-animation when items are already present */}
              <AnimatePresence initial={false}>
                {filtered.map((x, idx) => (
                  <StaticRow key={x.id} x={x} idx={idx} onOpen={openItem} reduceMotion={reduceMotion} sub={defaults.sub} kind={kind} activeLabel={activeLabel} />
                ))}
              </AnimatePresence>
            </div>
          )}

          {filtered.length === 0 ? <div className="text-sm text-muted-foreground">{t("common.nothingFound")}</div> : null}
        </div>
      )}

      <Modal open={openCreate} onOpenChange={setOpenCreate} title={t("pages.library.modalAdd", { kind: defaults.kindLabel })} reduceMotion={reduceMotion}>
        <ItemForm
          defaults={defaults}
          kind={kind}
          reduceMotion={reduceMotion}
          toast={toast}
          onSave={(v) => {
            onUpsert(v);
            setOpenCreate(false);
            toast?.push?.({ title: t("pages.library.saved"), description: v.name, tone: "success" });
          }}
        />
      </Modal>

      <Modal
        open={openEdit}
        onOpenChange={(v) => {
          setOpenEdit(v);
          if (!v) setActive(null);
        }}
        title={t("pages.library.modalEdit", { kind: defaults.kindLabel })}
        reduceMotion={reduceMotion}
      >
        {active ? (
          <ItemForm
            initial={active}
            defaults={defaults}
            kind={kind}
            reduceMotion={reduceMotion}
            toast={toast}
            onSave={(v) => {
              onUpsert(v);
              setOpenEdit(false);
              setActive(null);
              toast?.push?.({ title: t("pages.library.saved"), description: v.name, tone: "success" });
            }}
            onDelete={() => {
              onRemove(active.id);
              setOpenEdit(false);
              setActive(null);
              toast?.push?.({ title: t("common.movedToTrashToast"), description: active.name });
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}

// Memoize LibraryPage to prevent rerenders when props haven't changed
// Uses shallow comparison for items array (reference equality)
const LibraryPage = memo(LibraryPageInner);

export default LibraryPage;
