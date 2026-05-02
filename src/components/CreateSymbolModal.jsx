import React, { useEffect, useState, useRef } from "react";
import Modal from "@/components/common/Modal.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import { uid, resizeImageFileToDataUrl } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { isDeleted, monoNow } from "@/lib/syncDb.js";
import { Upload, X } from "lucide-react";

// Default emoji options for quick selection
const DEFAULT_EMOJIS = ["📈", "📉", "💹", "💰", "🪙", "💎", "🛢️", "🌾", "🏦", "📊"];

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

/**
 * Modal for creating a new trading symbol/asset directly from TradeEditor.
 * Creates symbol and calls onSave callback without closing the parent trade modal.
 */
export default function CreateSymbolModal({ 
  open, 
  onClose, 
  onSave, 
  existingSymbols = [],
  toast 
}) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  
  const [form, setForm] = useState({
    name: "",
    avatarType: "emoji", // "emoji" or "image"
    emoji: "📈",
    imageData: null,
    color: "#6366f1",
  });
  
  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setForm({
        name: "",
        avatarType: "emoji",
        emoji: "📈",
        imageData: null,
        color: "#6366f1",
      });
    }
  }, [open]);
  
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, { maxSize: 160, quality: 0.82 });
      setForm(f => ({ ...f, avatarType: "image", imageData: dataUrl }));
    } catch (err) {
      toast?.push({ 
        title: t("common.error"), 
        description: t("pages.trades.editor.createSymbol.imageError") || "Failed to upload image"
      });
    }
  };
  
  const handleCreate = () => {
    const name = form.name.trim();
    
    // Validate name
    if (!name) {
      toast?.push({ 
        title: t("common.error"), 
        description: t("pages.trades.editor.createSymbol.nameRequired") || "Symbol name is required"
      });
      return;
    }
    
    // Check for duplicates
    const isDuplicate = existingSymbols.some(
      s => s.name.toLowerCase() === name.toLowerCase() && !isDeleted(s)
    );
    if (isDuplicate) {
      toast?.push({ 
        title: t("common.error"), 
        description: t("pages.trades.editor.createSymbol.duplicateName") || "A symbol with this name already exists"
      });
      return;
    }
    
    // Build avatar object
    const avatar = form.avatarType === "image" && form.imageData
      ? { type: "image", imageData: form.imageData }
      : { type: "emoji", emoji: form.emoji };
    
    const newSymbol = {
      id: uid(),
      name: name.toUpperCase(),
      avatar: avatar,
      color: form.color,
      createdAt: monoNow(),
      deletedAt: null,
    };
    
    onSave(newSymbol);
    onClose();
    toast?.push({ 
      title: t("pages.trades.editor.createSymbol.created") || "Symbol created",
      tone: "success"
    });
  };
  
  return (
    <Modal 
      open={open} 
      onClose={onClose} 
      title={t("pages.trades.editor.createSymbol.title") || "Create Symbol"}
      size="md"
    >
      <div className="space-y-4">
        {/* Symbol Name */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            {t("pages.trades.editor.createSymbol.name") || "Symbol Name"} *
          </label>
          <Input
            type="text"
            placeholder={t("pages.trades.editor.createSymbol.namePlaceholder") || "e.g., EURUSD, BTCUSD, AAPL"}
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            autoFocus
          />
        </div>
        
        {/* Avatar Selection */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">
            {t("common.avatar") || "Avatar"}
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
                {t("common.emoji") || "Emoji"}
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
                {t("pages.trades.editor.createSymbol.image") || "Image"}
              </button>
            </div>
          </div>
          
          {/* Emoji Selection */}
          {form.avatarType === "emoji" && (
            <div className="flex flex-wrap gap-2">
              {DEFAULT_EMOJIS.map((emoji) => (
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
                      alt={form.name || "Symbol avatar"} 
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
                  {t("common.upload") || "Upload"}
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
            {t("common.accentColor") || "Accent Color"}
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
            {t("common.preview") || "Preview"}
          </div>
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
              style={{ 
                backgroundColor: `${form.color}20`,
                border: `1px solid ${form.color}40`
              }}
            >
              {form.avatarType === "image" && form.imageData ? (
                <img src={form.imageData} alt={form.name || "Symbol preview"} className="w-full h-full object-cover rounded-lg" />
              ) : (
                form.emoji
              )}
            </div>
            <span className="font-medium">{form.name || "SYMBOL"}</span>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleCreate}>
            {t("common.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
