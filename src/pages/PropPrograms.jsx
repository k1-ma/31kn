import React, { useMemo, useState, useEffect, useRef } from "react";
import Header from "@/components/common/Header.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Modal from "@/components/common/Modal.jsx";
import Badge from "@/components/ui/Badge.jsx";
import Switch from "@/components/ui/Switch.jsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, Search, Trash2, Edit2, Copy, ChevronRight, ChevronDown,
  Building2, Target, TrendingDown, Calendar, DollarSign, Percent,
  Check, X, AlertTriangle, Zap, Star, Settings2, RefreshCw,
  Crown, Sparkles, MoreHorizontal, ExternalLink, Award, Clock,
  ChevronUp, Image as ImageIcon
} from "lucide-react";
import { resizeImageFileToDataUrl } from "@/lib/utils";
import { uid, clampNum, fmtMoney } from "@/lib/utils";
import { monoNow } from "@/lib/syncDb.js";
import { HOVER_GLOW } from "@/lib/ui.js";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import {
  mergePropTemplates,
  normalizeTemplate,
  normalizePhase,
  makeTemplateSkeleton,
  BUILTIN_PROP_TEMPLATES,
  FEATURED_FIRMS,
  getFeaturedTemplates,
  getAdditionalTemplates,
  getFirmBranding,
} from "@/lib/prop.js";

// ─────────────────────────────────────────────────────────────────────────────
// PHASE EDITOR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function PhaseEditor({ phase, onChange, onRemove, canRemove, isLast, t }) {
  const isFunded = phase.kind === "funded";
  
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      isFunded ? "border-[#3B82F6]/30 bg-[#3B82F6]/8" : "border-accent/15 bg-card/30"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isFunded ? (
            <div className="h-8 w-8 rounded-xl bg-[#3B82F6]/15 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
          ) : (
            <div className="h-8 w-8 rounded-xl bg-[#3B82F6]/15 flex items-center justify-center">
              <Target className="h-4 w-4 text-accent" />
            </div>
          )}
          <div>
            <Input
              value={phase.label}
              onChange={e => onChange({ ...phase, label: e.target.value })}
              placeholder={t("pages.programs.phase.label")}
              className="h-8 w-40 text-sm font-medium"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={phase.kind}
            onChange={e => onChange({ ...phase, kind: e.target.value })}
            className="h-8 rounded-xl border border-accent/15 bg-background/60 px-2 text-xs"
          >
            <option value="evaluation">{t("pages.programs.phase.evaluation")}</option>
            <option value="funded">{t("pages.programs.phase.funded")}</option>
          </select>
          
          {canRemove && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Profit Target */}
        {!isFunded && (
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
              <Target className="h-3 w-3" />
              {t("pages.programs.rules.profitTarget")}
            </label>
            <div className="relative">
              <Input
                type="number"
                step="0.1"
                value={phase.rules?.profitTargetPct ?? ""}
                onChange={e => onChange({
                  ...phase,
                  rules: { ...phase.rules, profitTargetPct: e.target.value === "" ? null : clampNum(e.target.value) }
                })}
                placeholder="10"
                className="h-8 pr-6"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </div>
        )}
        
        {/* Max Loss */}
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
            <TrendingDown className="h-3 w-3" />
            {t("pages.programs.rules.maxLoss")}
          </label>
          <div className="relative">
            <Input
              type="number"
              step="0.1"
              value={phase.rules?.maxLossPct ?? ""}
              onChange={e => onChange({
                ...phase,
                rules: { ...phase.rules, maxLossPct: e.target.value === "" ? null : clampNum(e.target.value) }
              })}
              placeholder="10"
              className="h-8 pr-6"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
        </div>
        
        {/* Daily Loss */}
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {t("pages.programs.rules.dailyLoss")}
          </label>
          <div className="relative">
            <Input
              type="number"
              step="0.1"
              value={phase.rules?.maxDailyLossPct ?? ""}
              onChange={e => onChange({
                ...phase,
                rules: { ...phase.rules, maxDailyLossPct: e.target.value === "" ? null : clampNum(e.target.value) }
              })}
              placeholder="5"
              className="h-8 pr-6"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
        </div>
        
        {/* Min Trading Days */}
        {!isFunded && (
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {t("pages.programs.rules.minDays")}
            </label>
            <Input
              type="number"
              value={phase.rules?.minTradingDays ?? ""}
              onChange={e => onChange({
                ...phase,
                rules: { ...phase.rules, minTradingDays: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0) }
              })}
              placeholder="3"
              className="h-8"
            />
          </div>
        )}
        
        {/* Profit Split (funded only) */}
        {isFunded && (
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
              <Percent className="h-3 w-3" />
              {t("pages.programs.rules.profitSplit")}
            </label>
            <div className="relative">
              <Input
                type="number"
                value={phase.profitSplitPct ?? ""}
                onChange={e => onChange({
                  ...phase,
                  profitSplitPct: e.target.value === "" ? null : clampNum(e.target.value)
                })}
                placeholder="80"
                className="h-8 pr-6"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Advanced options */}
      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-accent/20">
        <div className="flex items-center gap-2">
          <select
            value={phase.rules?.maxLossType || "static"}
            onChange={e => onChange({
              ...phase,
              rules: { ...phase.rules, maxLossType: e.target.value }
            })}
            className="h-7 rounded-lg border border-accent/15 bg-background/60 px-2 text-[11px]"
          >
            <option value="static">{t("pages.programs.rules.static")}</option>
            <option value="trailing">{t("pages.programs.rules.trailing")}</option>
          </select>
          <span className="text-[10px] text-muted-foreground">{t("pages.programs.rules.lossType")}</span>
        </div>
        
        {!isFunded && (
          <div className="flex items-center gap-2">
            <select
              value={phase.rules?.minDaysMode || "trading"}
              onChange={e => onChange({
                ...phase,
                rules: { ...phase.rules, minDaysMode: e.target.value }
              })}
              className="h-7 rounded-lg border border-accent/15 bg-background/60 px-2 text-[11px]"
            >
              <option value="trading">{t("pages.programs.rules.tradingDays")}</option>
              <option value="profitable">{t("pages.programs.rules.profitableDays")}</option>
            </select>
            <span className="text-[10px] text-muted-foreground">{t("pages.programs.rules.daysMode")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE EDITOR MODAL
// ─────────────────────────────────────────────────────────────────────────────

function TemplateEditor({ open, onClose, template, onSave, isNew, t, toast }) {
  const [form, setForm] = useState(null);
  const [sizesInput, setSizesInput] = useState("");
  const fileRef = useRef(null);
  
  useEffect(() => {
    if (open && template) {
      setForm({ ...template });
      setSizesInput((template.sizes || []).join(", "));
    } else if (!open) {
      // Reset form when modal closes
      setForm(null);
      setSizesInput("");
    }
  }, [open, template]);
  
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, { maxSize: 120, quality: 0.8 });
      setForm(f => ({ ...f, avatar: { type: "image", imageData: dataUrl } }));
    } catch (err) {
      toast?.push?.({ title: t("common.error"), description: String(err) });
    }
  };
  
  // Don't render modal content until form is ready, but always render the Modal wrapper
  if (!open) return null;
  
  const handleSave = () => {
    const sizes = sizesInput
      .split(/[,\s]+/)
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n > 0);
    
    const updated = normalizeTemplate({
      ...form,
      sizes,
      updatedAt: monoNow(),
    });
    
    onSave(updated);
    onClose();
  };
  
  const addPhase = () => {
    const newPhase = normalizePhase({
      id: uid(),
      label: `Phase ${form.phases.length + 1}`,
      kind: "evaluation",
      rules: {
        profitTargetPct: 8,
        maxLossPct: 10,
        maxDailyLossPct: 5,
        minTradingDays: 3,
      }
    });
    setForm(f => ({ ...f, phases: [...f.phases, newPhase] }));
  };
  
  const updatePhase = (idx, updated) => {
    setForm(f => ({
      ...f,
      phases: f.phases.map((p, i) => i === idx ? normalizePhase(updated) : p)
    }));
  };
  
  const removePhase = (idx) => {
    if (form.phases.length <= 1) return;
    setForm(f => ({ ...f, phases: f.phases.filter((_, i) => i !== idx) }));
  };
  
  return (
    <Modal open={open} onClose={onClose} title={isNew ? t("pages.programs.createProgram") : t("pages.programs.editProgram")} size="xl">
      {!form ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">{t("common.loading")}</div>
        </div>
      ) : (
      <div className="space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium">{t("pages.programs.firmName")}</label>
            <Input
              value={form.firm}
              onChange={e => setForm(f => ({ ...f, firm: e.target.value }))}
              placeholder="FTMO, Funding Pips..."
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t("pages.programs.programName")}</label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Classic 2-Step"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t("common.currency")}</label>
            <Input
              value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value.slice(0, 4) }))}
              placeholder="$"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t("pages.programs.profitSplit")}</label>
            <div className="relative">
              <Input
                type="number"
                value={form.profitSplitPct ?? ""}
                onChange={e => setForm(f => ({ ...f, profitSplitPct: e.target.value === "" ? null : clampNum(e.target.value) }))}
                placeholder="80"
                className="pr-6"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </div>
        
        {/* Avatar & Color */}
        <div className="space-y-2">
          <label className="text-xs font-medium">{t("common.avatar")} & {t("common.accentColor")}</label>
          <div className="flex items-center gap-3">
            <div 
              className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 overflow-hidden"
              style={{ 
                background: form.avatar?.type === "image" && form.avatar?.imageData 
                  ? `url(${form.avatar.imageData}) center/cover` 
                  : `linear-gradient(135deg, ${form.color || getFirmBranding(form.firm).color}, ${form.color ? form.color + '99' : getFirmBranding(form.firm).accent})` 
              }}
            >
              {form.avatar?.type === "emoji" && form.avatar?.emoji ? (
                form.avatar.emoji
              ) : form.avatar?.type !== "image" ? (
                form.firm?.charAt(0) || "P"
              ) : null}
            </div>
            <input
              type="file"
              ref={fileRef}
              className="hidden"
              accept="image/*"
              onChange={handleImageUpload}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImageIcon className="h-4 w-4 mr-2" />
              {t("common.upload")}
            </Button>
            <Input
              value={form.avatar?.type === "emoji" ? form.avatar?.emoji || "" : ""}
              onChange={e => setForm(f => ({ ...f, avatar: e.target.value ? { type: "emoji", emoji: e.target.value } : null }))}
              placeholder={t("common.emoji")}
              className="w-20"
            />
            <input
              type="color"
              value={form.color || getFirmBranding(form.firm).color}
              onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              className="h-10 w-10 rounded-xl cursor-pointer"
            />
            {(form.avatar || form.color) && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setForm(f => ({ ...f, avatar: null, color: null }))}
              >
                {t("common.clear")}
              </Button>
            )}
          </div>
        </div>
        
        {/* Account Sizes */}
        <div className="space-y-1">
          <label className="text-xs font-medium">{t("pages.programs.accountSizes")}</label>
          <Input
            value={sizesInput}
            onChange={e => setSizesInput(e.target.value)}
            placeholder="10000, 25000, 50000, 100000, 200000"
          />
          <p className="text-[10px] text-muted-foreground">{t("pages.programs.sizesHint")}</p>
        </div>
        
        {/* Phases */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">{t("pages.programs.phases")}</label>
            <Button variant="secondary" size="sm" onClick={addPhase} className="gap-1">
              <Plus className="h-3 w-3" /> {t("pages.programs.addPhase")}
            </Button>
          </div>
          
          <div className="space-y-3">
            {form.phases.map((phase, idx) => (
              <PhaseEditor
                key={phase.id}
                phase={phase}
                onChange={updated => updatePhase(idx, updated)}
                onRemove={() => removePhase(idx)}
                canRemove={form.phases.length > 1}
                isLast={idx === form.phases.length - 1}
                t={t}
              />
            ))}
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-accent/15">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave}>
            {isNew ? t("common.create") : t("common.save")}
          </Button>
        </div>
      </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PREMIUM PROGRAM CARD
// ─────────────────────────────────────────────────────────────────────────────

function ProgramCard({ template, onEdit, onDuplicate, onDelete, isBuiltin, isFeatured, t }) {
  const [expanded, setExpanded] = useState(false);
  const phases = template.phases || [];
  const evalPhases = phases.filter(p => p.kind === "evaluation");
  const fundedPhase = phases.find(p => p.kind === "funded");
  const branding = getFirmBranding(template.firm);
  
  // Type label
  const typeLabel = template.type === "instant" ? t("pages.programs.typeInstant") :
    template.type === "one_phase" ? t("pages.programs.type1Step") :
    template.type === "two_phase" ? t("pages.programs.type2Step") :
    template.type === "three_phase" ? t("pages.programs.type3Step") :
    `${evalPhases.length} ${t("pages.programs.phase.multiple")}`;
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`group relative rounded-xl border bg-gradient-to-br from-card/80 to-card/40 overflow-hidden transition-all duration-300 ${HOVER_GLOW} ${
        isFeatured ? "border-accent/30 shadow-lg shadow-accent/5" : "border-accent/15 hover:border-accent/30"
      }`}
    >
      {/* Featured indicator */}
      {isFeatured && (
        <div className="absolute top-0 right-0 w-20 h-20 overflow-hidden">
          <div className="absolute top-2 right-[-30px] w-[100px] bg-gradient-to-r from-amber-500 to-amber-400 text-white text-[9px] font-bold py-0.5 text-center transform rotate-45">
            FEATURED
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Firm Logo/Icon */}
          <div 
            className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 overflow-hidden"
            style={{ 
              background: template.avatar?.type === "image" && template.avatar?.imageData 
                ? `url(${template.avatar.imageData}) center/cover` 
                : `linear-gradient(135deg, ${template.color || branding.color}, ${template.color ? template.color + '99' : branding.accent})` 
            }}
          >
            {template.avatar?.type === "emoji" && template.avatar?.emoji ? (
              template.avatar.emoji
            ) : template.avatar?.type !== "image" ? (
              template.firm?.charAt(0) || "P"
            ) : null}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm truncate">{template.firm}</h3>
                <p className="text-xs text-muted-foreground truncate">{template.name}</p>
              </div>
              {isBuiltin && (
                <Badge variant="secondary" className="text-[9px] shrink-0">
                  <Star className="h-2.5 w-2.5 mr-0.5" fill="currentColor" />
                  {t("pages.programs.builtin")}
                </Badge>
              )}
            </div>
            
            {/* Quick Stats */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge 
                variant="outline" 
                className="text-[10px] border-accent/30 bg-accent/5"
              >
                {typeLabel}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                <DollarSign className="h-2.5 w-2.5 mr-0.5" />
                {fundedPhase?.profitSplitPct || template.profitSplitPct || 80}%
              </Badge>
              {template.sizes?.length > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  {fmtMoney(Math.min(...template.sizes), template.currency)} - {fmtMoney(Math.max(...template.sizes), template.currency)}
                </Badge>
              )}
            </div>
          </div>
        </div>
        
        {/* Description */}
        {template.description && (
          <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2">
            {template.description}
          </p>
        )}
      </div>
      
      {/* Rules Preview */}
      <div className="px-4 py-2 bg-[#0B1220]/30 border-t border-accent/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-[10px]">
            {evalPhases[0]?.rules?.profitTargetPct && (
              <div className="flex items-center gap-1">
                <Target className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-500 font-medium">{evalPhases[0].rules.profitTargetPct}%</span>
                <span className="text-muted-foreground">{t("pages.programs.rules.profitTarget")}</span>
              </div>
            )}
            {evalPhases[0]?.rules?.maxLossPct && (
              <div className="flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-rose-500" />
                <span className="text-rose-600 font-medium">{evalPhases[0].rules.maxLossPct}%</span>
                <span className="text-muted-foreground">{t("pages.programs.rules.maxLoss")}</span>
              </div>
            )}
            {evalPhases[0]?.rules?.minTradingDays > 0 && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-blue-500" />
                <span className="font-medium">{evalPhases[0].rules.minTradingDays}</span>
                <span className="text-muted-foreground">{t("common.days")}</span>
              </div>
            )}
          </div>
          
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? t("pages.programs.hideDetails") : t("pages.programs.showDetails")}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>
      
      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-3 bg-muted/10 border-t border-accent/20">
              {/* All Phases */}
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase text-muted-foreground font-medium">{t("pages.programs.phases")}</h4>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {phases.map((phase, idx) => (
                    <div 
                      key={phase.id} 
                      className={`shrink-0 rounded-xl p-3 min-w-[140px] ${
                        phase.kind === "funded" 
                          ? "bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-[#3B82F6]/30" 
                          : "bg-[#0B1220]/50"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {phase.kind === "funded" ? (
                          <Award className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <div className="h-4 w-4 rounded-full bg-[#3B82F6]/15 flex items-center justify-center text-[10px] font-bold text-accent">
                            {idx + 1}
                          </div>
                        )}
                        <span className="text-xs font-medium">{phase.label}</span>
                      </div>
                      <div className="space-y-1 text-[10px]">
                        {phase.rules?.profitTargetPct && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("pages.programs.rules.profitTarget")}</span>
                            <span className="font-medium text-emerald-500">{phase.rules.profitTargetPct}%</span>
                          </div>
                        )}
                        {phase.rules?.maxLossPct && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("pages.programs.rules.maxLoss")}</span>
                            <span className="font-medium text-rose-600">{phase.rules.maxLossPct}%</span>
                          </div>
                        )}
                        {phase.rules?.maxDailyLossPct && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("pages.programs.rules.dailyLoss")}</span>
                            <span className="font-medium">{phase.rules.maxDailyLossPct}%</span>
                          </div>
                        )}
                        {phase.kind !== "funded" && phase.rules?.minTradingDays > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("pages.programs.rules.minDays")}</span>
                            <span className="font-medium">{phase.rules.minTradingDays}</span>
                          </div>
                        )}
                        {phase.kind === "funded" && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("pages.programs.rules.profitSplit")}</span>
                            <span className="font-medium text-emerald-500">{phase.profitSplitPct || template.profitSplitPct}%</span>
                          </div>
                        )}
                        {phase.rules?.maxLossType === "trailing" && (
                          <Badge variant="outline" className="text-[9px] mt-1">{t("pages.programs.rules.trailing")}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Sizes */}
              {template.sizes?.length > 0 && (
                <div>
                  <h4 className="text-[10px] uppercase text-muted-foreground font-medium mb-2">{t("pages.programs.accountSizes")}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {template.sizes.map(size => (
                      <span key={size} className="px-2 py-1 rounded-lg bg-muted/50 text-xs font-medium">
                        {fmtMoney(size, template.currency)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-accent/20">
                <Button variant="secondary" size="sm" onClick={() => onDuplicate(template)} className="gap-1 text-xs">
                  <Copy className="h-3 w-3" /> {t("pages.programs.duplicate")}
                </Button>
                {!isBuiltin && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => onEdit(template)} className="gap-1 text-xs">
                      <Edit2 className="h-3 w-3" /> {t("common.edit")}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onDelete(template.id)} className="gap-1 text-xs text-rose-600 hover:bg-rose-500/10">
                      <Trash2 className="h-3 w-3" /> {t("common.delete")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function PropPrograms({ propTemplates = [], onSetPropTemplates, toast }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all"); // all, featured, custom
  
  // Merge user templates with builtins
  const allTemplates = useMemo(() => mergePropTemplates(propTemplates), [propTemplates]);
  
  // Separate featured and additional
  const { featuredTemplates, additionalTemplates, customTemplates } = useMemo(() => {
    const featured = allTemplates.filter(t => FEATURED_FIRMS.includes(t.firm) && t.isBuiltin);
    const additional = allTemplates.filter(t => !FEATURED_FIRMS.includes(t.firm) && t.isBuiltin);
    const custom = allTemplates.filter(t => !t.isBuiltin);
    return { featuredTemplates: featured, additionalTemplates: additional, customTemplates: custom };
  }, [allTemplates]);
  
  // Filter templates
  const displayedTemplates = useMemo(() => {
    let list = [];
    
    if (activeFilter === "featured") {
      list = featuredTemplates;
    } else if (activeFilter === "custom") {
      list = customTemplates;
    } else {
      list = [...featuredTemplates, ...customTemplates];
      if (showMore) {
        list = [...list, ...additionalTemplates];
      }
    }
    
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => 
        t.firm?.toLowerCase().includes(q) ||
        t.name?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
      );
    }
    
    return list;
  }, [featuredTemplates, additionalTemplates, customTemplates, activeFilter, showMore, search]);
  
  // Group by firm
  const groupedTemplates = useMemo(() => {
    const groups = new Map();
    
    for (const tpl of displayedTemplates) {
      const firm = tpl.firm || "Custom";
      if (!groups.has(firm)) {
        groups.set(firm, []);
      }
      groups.get(firm).push(tpl);
    }
    
    // Sort: Featured firms first, then alphabetically
    return Array.from(groups.entries()).sort((a, b) => {
      const aFeatured = FEATURED_FIRMS.includes(a[0]);
      const bFeatured = FEATURED_FIRMS.includes(b[0]);
      if (aFeatured && !bFeatured) return -1;
      if (!aFeatured && bFeatured) return 1;
      if (a[0] === "Custom") return 1;
      if (b[0] === "Custom") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [displayedTemplates]);
  
  const handleCreate = () => {
    const skeleton = makeTemplateSkeleton("two_phase");
    setEditingTemplate(skeleton);
    setIsNewTemplate(true);
    setEditorOpen(true);
  };
  
  const handleEdit = (template) => {
    setEditingTemplate(template);
    setIsNewTemplate(false);
    setEditorOpen(true);
  };
  
  const handleDuplicate = (template) => {
    const copy = {
      ...template,
      id: uid(),
      name: `${template.name} (Copy)`,
      isBuiltin: false,
      featured: false,
      createdAt: monoNow(),
      updatedAt: monoNow(),
      sourceBuiltinId: template.isBuiltin ? template.id : template.sourceBuiltinId,
    };
    setEditingTemplate(normalizeTemplate(copy));
    setIsNewTemplate(true);
    setEditorOpen(true);
  };
  
  const handleSave = (template) => {
    const userTemplates = propTemplates.filter(t => t.id !== template.id);
    onSetPropTemplates([...userTemplates, template]);
    toast?.push({ title: t("common.done"), description: isNewTemplate ? t("pages.programs.toasts.created") : t("pages.programs.toasts.updated") });
  };
  
  const handleDelete = (id) => {
    const userTemplates = propTemplates.filter(t => t.id !== id);
    onSetPropTemplates(userTemplates);
    toast?.push({ title: t("common.done"), description: t("pages.programs.toasts.deleted") });
  };
  
  return (
    <div className="space-y-4 sm:space-y-6">
      <Header
        title={t("pages.programs.title")}
        subtitle={t("pages.programs.subtitle")}
        action={
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("pages.programs.createProgram")}
          </Button>
        }
      />
      
      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="pl-9"
          />
        </div>
        
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0B1220]/50">
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              activeFilter === "all" ? "bg-card shadow font-medium" : "hover:bg-muted/50 text-muted-foreground"
            }`}
            onClick={() => setActiveFilter("all")}
          >
            {t("pages.accounts.filter.all")}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-sm transition flex items-center gap-1 ${
              activeFilter === "featured" ? "bg-card shadow font-medium" : "hover:bg-muted/50 text-muted-foreground"
            }`}
            onClick={() => setActiveFilter("featured")}
          >
            <Crown className="h-3 w-3" />
            {t("pages.programs.featured")}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              activeFilter === "custom" ? "bg-card shadow font-medium" : "hover:bg-muted/50 text-muted-foreground"
            }`}
            onClick={() => setActiveFilter("custom")}
          >
            {t("pages.programs.customPrograms")}
          </button>
        </div>
      </div>
      
      {/* "Can't find your prop firm?" CTA — under filter tabs */}
      {(activeFilter === "all" || activeFilter === "featured") && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-dashed border-accent/25 bg-accent/5 p-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-accent/10 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-accent" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t("pages.programs.cantFindFirm") || "Нету вашей проп фирмы?"}</div>
              <div className="text-xs text-muted-foreground">{t("pages.programs.cantFindFirmHint") || "Добавьте свою проп-программу с нуля"}</div>
            </div>
          </div>
          <Button onClick={handleCreate} size="sm" className="gap-2 shrink-0">
            <Plus className="h-3.5 w-3.5" />
            {t("pages.programs.addYourOwn") || "Добавьте свою"}
          </Button>
        </div>
      )}
      
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-accent/15 bg-card/50 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Crown className="h-4 w-4 text-amber-500" />
            <span className="text-xs">{t("pages.programs.featured")}</span>
          </div>
          <div className="text-2xl font-bold">{featuredTemplates.length}</div>
        </div>
        <div className="rounded-xl border border-accent/15 bg-card/50 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Building2 className="h-4 w-4" />
            <span className="text-xs">{t("pages.programs.otherFirms")}</span>
          </div>
          <div className="text-2xl font-bold">{additionalTemplates.length}</div>
        </div>
        <div className="rounded-xl border border-accent/15 bg-card/50 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Settings2 className="h-4 w-4 text-accent" />
            <span className="text-xs">{t("pages.programs.customPrograms")}</span>
          </div>
          <div className="text-2xl font-bold">{customTemplates.length}</div>
        </div>
        <div className="rounded-xl border border-accent/15 bg-card/50 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <span className="text-xs">{t("pages.programs.totalPrograms")}</span>
          </div>
          <div className="text-2xl font-bold">{allTemplates.length}</div>
        </div>
      </div>
      
      {/* Templates */}
      {displayedTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <div className="text-lg font-medium">{t("pages.programs.empty")}</div>
          <div className="text-sm text-muted-foreground mt-1">{t("pages.programs.emptyHint")}</div>
          <Button onClick={handleCreate} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            {t("pages.programs.createProgram")}
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedTemplates.map(([firm, templates]) => (
            <div key={firm}>
              <div className="flex items-center gap-3 mb-4">
                <div 
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: `linear-gradient(135deg, ${getFirmBranding(firm).color}, ${getFirmBranding(firm).accent})` }}
                >
                  {firm.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold">{firm}</h3>
                  <p className="text-xs text-muted-foreground">{templates.length} {t("pages.programs.programs")}</p>
                </div>
                {FEATURED_FIRMS.includes(firm) && (
                  <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px]">
                    <Crown className="h-3 w-3 mr-1" />
                    FEATURED
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {templates.map(tpl => (
                  <ProgramCard
                    key={tpl.id}
                    template={tpl}
                    onEdit={handleEdit}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    isBuiltin={tpl.isBuiltin}
                    isFeatured={FEATURED_FIRMS.includes(tpl.firm)}
                    t={t}
                  />
                ))}
              </div>
            </div>
          ))}
          
          {/* Show More Button */}
          {activeFilter === "all" && additionalTemplates.length > 0 && !showMore && (
            <div className="flex justify-center pt-4">
              <Button 
                variant="secondary" 
                onClick={() => setShowMore(true)}
                className="gap-2"
              >
                <ChevronDown className="h-4 w-4" />
                {t("pages.programs.showMore")} ({additionalTemplates.length} {t("pages.programs.programs")})
              </Button>
            </div>
          )}
          
          {activeFilter === "all" && showMore && additionalTemplates.length > 0 && (
            <div className="flex justify-center pt-4">
              <Button 
                variant="ghost" 
                onClick={() => setShowMore(false)}
                className="gap-2 text-muted-foreground"
              >
                <ChevronUp className="h-4 w-4" />
                {t("pages.programs.showLess")}
              </Button>
            </div>
          )}
        </div>
      )}
      
      {/* Editor Modal */}
      <TemplateEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        template={editingTemplate}
        onSave={handleSave}
        isNew={isNewTemplate}
        t={t}
        toast={toast}
      />
    </div>
  );
}
