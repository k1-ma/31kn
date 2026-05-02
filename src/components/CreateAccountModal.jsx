import React, { useEffect, useState } from "react";
import Modal from "@/components/common/Modal.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import SelectDropdown from "@/components/common/SelectDropdown.jsx";
import { uid, clampNum } from "@/lib/utils";
import { monoNow } from "@/lib/syncDb.js";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import {
  mergePropTemplates,
  getTemplate,
  getPhase,
  phaseStatusLabel,
  getFirmBranding,
} from "@/lib/prop.js";

/**
 * Simplified modal for creating a trading account directly from TradeEditor.
 * Creates account and calls onSave callback without closing the parent trade modal.
 */
export default function CreateAccountModal({ 
  open, 
  onClose, 
  onSave, 
  propTemplates = [],
  existingAccounts = [],
  toast 
}) {
  const { t } = useI18n();
  
  const templates = mergePropTemplates(propTemplates);
  
  const [form, setForm] = useState({
    name: "",
    currency: "$",
    startingEquity: "",
    isProp: true,
    templateId: "",
    phaseId: "",
    propSize: "",
    challengeCost: "", // Cost paid for the challenge
  });
  
  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setForm({
        name: "",
        currency: "$",
        startingEquity: "",
        isProp: true,
        templateId: "",
        phaseId: "",
        propSize: "",
        challengeCost: "",
      });
    }
  }, [open]);
  
  // Get phases for selected template
  const selectedTemplate = form.templateId ? getTemplate(templates, form.templateId) : null;
  const phases = selectedTemplate?.phases || [];
  
  // Auto-select first phase when template changes
  useEffect(() => {
    if (form.templateId && phases.length > 0 && !form.phaseId) {
      const firstEvalPhase = phases.find(p => p.kind === "evaluation") || phases[0];
      setForm(f => ({ ...f, phaseId: firstEvalPhase.id }));
    }
  }, [form.templateId, phases]);
  
  const handleNumberInput = (field) => (e) => {
    const value = e.target.value.replace(/,/g, '.');
    setForm(f => ({ ...f, [field]: value }));
  };
  
  const handleCreate = () => {
    const startEq = clampNum(form.startingEquity);
    const propSize = form.propSize !== "" ? clampNum(form.propSize) : startEq;
    
    // Validate
    if (!form.isProp && startEq <= 0) {
      toast?.push({ 
        title: t("common.error"), 
        description: t("pages.accounts.errors.startingBalanceRequired") || "Starting balance is required"
      });
      return;
    }
    
    if (form.isProp && form.templateId && propSize <= 0) {
      toast?.push({ 
        title: t("common.error"), 
        description: t("pages.accounts.errors.accountSizeRequired") || "Account size is required"
      });
      return;
    }
    
    // Auto-generate name if empty
    let accountName = form.name.trim();
    if (!accountName) {
      if (form.isProp && form.templateId) {
        const tpl = getTemplate(templates, form.templateId);
        const ph = getPhase(tpl, form.phaseId);
        const size = propSize || startEq;
        const firmName = tpl?.firm || "Prop";
        const phaseName = ph?.label || "Phase 1";
        accountName = `${firmName} ${Math.round(size)} • ${phaseName}`;
      } else {
        const existingNumbers = (existingAccounts || [])
          .map(a => a.name)
          .filter(name => /^Account \d+$/.test(name))
          .map(name => {
            const match = name.match(/\d+/);
            return match ? parseInt(match[0], 10) : 0;
          });
        const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
        accountName = `Account ${nextNumber}`;
      }
    }
    
    // Get avatar - use prop firm logo if available
    let avatar = { type: "emoji", emoji: "💼" };
    if (form.isProp && form.templateId) {
      const tpl = getTemplate(templates, form.templateId);
      const branding = tpl ? getFirmBranding(tpl.firm) : null;
      if (branding?.logoSrc) {
        avatar = { type: "image", imageData: branding.logoSrc };
      }
    }
    
    const equityValue = form.isProp ? propSize : startEq;
    // For prop accounts, allow a custom starting balance (e.g. if user started
    // tracking after an initial drawdown). Defaults to prop account size.
    const startingBalance = form.isProp ? (startEq > 0 ? startEq : propSize) : startEq;
    
    let newAccount = {
      id: uid(),
      name: accountName,
      currency: form.currency || "$",
      startingEquity: startingBalance,
      currentEquity: startingBalance,
      status: "Live",
      notes: "",
      avatar: avatar,
      tags: [],
      color: "#6366f1",
      isHidden: false,
      manualTradingDays: 0,
      createdAt: monoNow(),
    };
    
    // Add prop settings if enabled
    if (form.isProp && form.templateId) {
      const tpl = getTemplate(templates, form.templateId);
      const ph = getPhase(tpl, form.phaseId);
      const isLivePhase = ph?.kind === "funded";
      
      newAccount.status = phaseStatusLabel(tpl, form.phaseId, []);
      
      const payoutPolicyOverride = isLivePhase ? {
        cycleDays: 14,
        firstPayoutAfterDays: 14,
        minPayoutTrader: 50,
      } : null;
      
      // Parse challenge cost
      const challengeCost = form.challengeCost ? clampNum(form.challengeCost) : null;
      
      newAccount.prop = {
        templateId: form.templateId,
        phaseId: form.phaseId || phases[0]?.id || "phase1",
        size: equityValue,
        startedAt: monoNow(),
        autoProgress: true,
        rulesOverride: {},
        profitSplitPctOverride: null,
        challengeCost: challengeCost,
        payoutPolicyOverride: payoutPolicyOverride,
        previousAccountId: null,
        nextAccountId: null,
        autoProgressDone: {},
        eval: null,
        payouts: [],
      };
    }
    
    onSave(newAccount);
    onClose();
    toast?.push({ 
      title: t("pages.accounts.toasts.created") || "Account created",
      tone: "success"
    });
  };
  
  // Build template options for dropdown
  const templateOptions = [
    { value: "", label: t("pages.accounts.labels.selectTemplate") || "Select prop firm..." },
    ...templates.map(tpl => ({
      value: tpl.id,
      label: `${tpl.firm} • ${tpl.name}`,
    }))
  ];
  
  // Build phase options for dropdown
  const phaseOptions = phases.map(ph => ({
    value: ph.id,
    label: ph.label || ph.id,
  }));
  
  // Currency options
  const currencyOptions = [
    { value: "$", label: "$ USD" },
    { value: "€", label: "€ EUR" },
    { value: "£", label: "£ GBP" },
    { value: "₽", label: "₽ RUB" },
  ];
  
  return (
    <Modal 
      open={open} 
      onClose={onClose} 
      title={t("pages.trades.editor.createAccount.title") || "Create Account"}
      size="md"
    >
      <div className="space-y-4">
        {/* Account Type Toggle */}
        <div className="p-1.5 rounded-xl bg-muted/30 border border-border/30">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, isProp: true, templateId: "", phaseId: "" }))}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
                form.isProp 
                  ? "bg-accent/20 text-accent border border-accent/30 shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t("pages.accounts.type.prop") || "Prop Firm"}
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, isProp: false, templateId: "", phaseId: "" }))}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
                !form.isProp 
                  ? "bg-accent/20 text-accent border border-accent/30 shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t("pages.accounts.type.personal") || "Personal"}
            </button>
          </div>
        </div>
        
        {/* Prop Firm Selection */}
        {form.isProp && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t("pages.accounts.type.prop") || "Prop Firm"}
              </label>
              <SelectDropdown
                value={form.templateId}
                options={templateOptions}
                onChange={(val) => setForm(f => ({ ...f, templateId: val, phaseId: "" }))}
                searchable
                placeholder={t("pages.accounts.selectProgram") || "Select prop firm..."}
              />
            </div>
            
            {form.templateId && phases.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {t("pages.accounts.selectPhase") || "Phase"}
                </label>
                <SelectDropdown
                  value={form.phaseId}
                  options={phaseOptions}
                  onChange={(val) => setForm(f => ({ ...f, phaseId: val }))}
                  placeholder={t("pages.accounts.selectPhase") || "Select phase..."}
                />
              </div>
            )}
            
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t("pages.accounts.accountSize") || "Account Size"}
              </label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="50000"
                value={form.propSize}
                onChange={handleNumberInput("propSize")}
              />
            </div>
            
            {/* Starting Balance (optional, for when actual balance differs from account size) */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t("pages.accounts.startingBalanceInput") || "Starting balance"} ({t("common.optional")})
              </label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder={t("pages.accounts.startingBalancePlaceholder") || "Leave empty to use account size"}
                value={form.startingEquity}
                onChange={handleNumberInput("startingEquity")}
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                {t("pages.accounts.startingBalanceHint") || "Set if your actual starting balance differs from account size"}
              </div>
            </div>
            
            {/* Challenge Cost field */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t("pages.accounts.challengeCostInput") || "Challenge cost"} ({t("common.optional")})
              </label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder={t("pages.accounts.challengeCostPlaceholder") || "Amount paid for the challenge"}
                value={form.challengeCost}
                onChange={handleNumberInput("challengeCost")}
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                {t("pages.accounts.challengeCostHint") || "Enter the amount you paid for this prop challenge"}
              </div>
            </div>
          </div>
        )}
        
        {/* Personal Account Fields */}
        {!form.isProp && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t("common.name")} ({t("common.optional")})
              </label>
              <Input
                type="text"
                placeholder={t("pages.accounts.placeholders.accountName") || "Account 1"}
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {t("common.currency")}
                </label>
                <SelectDropdown
                  value={form.currency}
                  options={currencyOptions}
                  onChange={(val) => setForm(f => ({ ...f, currency: val }))}
                />
              </div>
              
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {t("common.startingEquity")}
                </label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="10000"
                  value={form.startingEquity}
                  onChange={handleNumberInput("startingEquity")}
                />
              </div>
            </div>
          </div>
        )}
        
        {/* Account Name for Prop (optional override) */}
        {form.isProp && form.templateId && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("common.name")} ({t("common.optional")})
            </label>
            <Input
              type="text"
              placeholder={t("pages.accounts.placeholders.autoGenerated") || "Auto-generated from firm & phase"}
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
        )}
        
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
