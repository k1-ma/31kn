import React, { useState, useEffect } from "react";
import Modal from "@/components/common/Modal.jsx";
import Button from "@/components/ui/Button.jsx";
import Switch from "@/components/ui/Switch.jsx";
import { Share2, FileText, Lightbulb, Shield, Info, Image, BarChart3 } from "lucide-react";

/**
 * Modal to select sharing options before creating a share link.
 * Allows user to choose whether to include linked documents and ideas.
 */
export default function ShareOptionsModal({
  open,
  onOpenChange,
  onConfirm,
  tradeCount = 1,
  hasLinkedDocs = false,
  hasLinkedIdeas = false,
  hasImages = false,
  reduceMotion,
  t = (key) => key,
}) {
  const [includeDocs, setIncludeDocs] = useState(false);
  const [includeIdeas, setIncludeIdeas] = useState(false);
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [includeAnalytics, setIncludeAnalytics] = useState(false);

  // Reset state when modal opens to ensure fresh state each time
  useEffect(() => {
    if (open) {
      setIncludeDocs(false);
      setIncludeIdeas(false);
      setIncludeScreenshot(false);
      setIncludeAnalytics(tradeCount > 5);
    }
  }, [open, tradeCount]);

  const handleConfirm = () => {
    onConfirm?.({ includeDocs, includeIdeas, includeScreenshot, includeAnalytics });
    onOpenChange?.(false);
  };

  const handleClose = () => {
    onOpenChange?.(false);
  };

  // Determine modal title based on trade count
  const title = tradeCount === 1 
    ? (t("share.optionsTitle") || "Share Trade")
    : (t("share.optionsTitleMultiple") || `Share ${tradeCount} Trades`);

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title={title}
      reduceMotion={reduceMotion}
      size="md"
    >
      <div className="space-y-5">
        {/* Icon + Message */}
        <div className="flex flex-col items-center text-center pb-2">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-accent/20 to-accent-2/20 flex items-center justify-center mb-4 shadow-lg shadow-accent/10">
            <Share2 className="h-7 w-7 text-accent" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t("share.optionsDescription") || "Choose what information to include in your shared link."}
          </p>
        </div>

        {/* Privacy Notice */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <Shield className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-medium text-emerald-400">{t("share.privacyTitle") || "Your privacy is protected"}</span>
            <p className="text-muted-foreground mt-1">
              {t("share.privacyDescription") || "Only the selected information will be visible. Your account balances and other sensitive data are never shared."}
            </p>
          </div>
        </div>

        {/* Share Options */}
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground mb-2">
            {t("share.includeTitle") || "Include in share:"}
          </div>
          
          {/* Option: Include Documents */}
          <div 
            className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
              hasLinkedDocs 
                ? "bg-card/60 border-accent/15 hover:border-accent/30" 
                : "bg-muted/20 border-accent/10 opacity-60"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("share.includeDocs") || "Documents & Plans"}</div>
                <div className="text-xs text-muted-foreground">
                  {hasLinkedDocs 
                    ? (t("share.includeDocsDesc") || "Include linked trading plans and strategies")
                    : (t("share.noLinkedDocs") || "No documents linked to these trades")
                  }
                </div>
              </div>
            </div>
            <Switch
              checked={includeDocs}
              onCheckedChange={setIncludeDocs}
              disabled={!hasLinkedDocs}
            />
          </div>

          {/* Option: Include Ideas */}
          <div 
            className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
              hasLinkedIdeas 
                ? "bg-card/60 border-accent/15 hover:border-accent/30" 
                : "bg-muted/20 border-accent/10 opacity-60"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Lightbulb className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("share.includeIdeas") || "Trading Ideas"}</div>
                <div className="text-xs text-muted-foreground">
                  {hasLinkedIdeas 
                    ? (t("share.includeIdeasDesc") || "Include linked trading ideas and setups")
                    : (t("share.noLinkedIdeas") || "No ideas linked to these trades")
                  }
                </div>
              </div>
            </div>
            <Switch
              checked={includeIdeas}
              onCheckedChange={setIncludeIdeas}
              disabled={!hasLinkedIdeas}
            />
          </div>

          {/* Option: Include Screenshot in OG Preview */}
          <div 
            className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
              hasImages 
                ? "bg-card/60 border-accent/15 hover:border-accent/30" 
                : "bg-muted/20 border-accent/10 opacity-60"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-pink-500/15 flex items-center justify-center">
                <Image className="h-5 w-5 text-pink-400" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("share.includeScreenshot") || "Screenshot in Preview"}</div>
                <div className="text-xs text-muted-foreground">
                  {hasImages 
                    ? (t("share.includeScreenshotDesc") || "Show trade screenshot in link preview (OG image)")
                    : (t("share.noImages") || "No images attached to these trades")
                  }
                </div>
              </div>
            </div>
            <Switch
              checked={includeScreenshot}
              onCheckedChange={setIncludeScreenshot}
              disabled={!hasImages}
            />
          </div>

          {/* Option: Include Analytics */}
          <div 
            className="flex items-center justify-between p-4 rounded-xl border transition-all bg-card/60 border-accent/15 hover:border-accent/30"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("share.includeAnalytics") || "Analytics & Statistics"}</div>
                <div className="text-xs text-muted-foreground">
                  {t("share.includeAnalyticsDesc") || "Show win rate, profit factor, streaks and other metrics"}
                </div>
              </div>
            </div>
            <Switch
              checked={includeAnalytics}
              onCheckedChange={setIncludeAnalytics}
            />
          </div>
        </div>

        {/* Info Notice */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {t("share.infoNotice") || "By default, only trade data is shared (date, direction, outcome, PnL, notes, images, and links)."}
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={handleClose}>
            {t("common.cancel") || "Cancel"}
          </Button>
          <Button onClick={handleConfirm} className="gap-1.5">
            <Share2 className="h-4 w-4" />
            {t("share.createLink") || "Create Share Link"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
