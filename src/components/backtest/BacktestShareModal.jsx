import React, { useState } from "react";
import Modal from "@/components/common/Modal.jsx";
import Button from "@/components/ui/Button.jsx";
import Switch from "@/components/ui/Switch.jsx";
import { Share2, FlaskConical, FileText, BarChart3, Shield, Info, ImageIcon } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { createShareWithToast, sanitizeBacktestForPublic, getBacktestShareUrl } from "@/lib/share.js";
import { isDeleted } from "@/lib/syncDb.js";

/**
 * Modal to select sharing options before creating a backtest share link.
 */
export default function BacktestShareModal({
  open,
  onOpenChange,
  backtest,
  libraries = {},
  toast,
  reduceMotion,
  onShareComplete,
  flushSync,
  setShareInFlight,
}) {
  const { t } = useI18n();
  const [includeTrades, setIncludeTrades] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeImages, setIncludeImages] = useState(true);
  const [sharing, setSharing] = useState(false);

  const tradesCount = (backtest?.trades || []).filter(tr => !isDeleted(tr)).length;
  const hasNotes = !!(backtest?.notes?.plan || backtest?.notes?.description);
  const imagesCount = (backtest?.trades || []).reduce((sum, tr) => sum + (Array.isArray(tr?.images) ? tr.images.length : 0), 0);

  const handleClose = () => {
    onOpenChange?.(false);
  };

  const handleConfirm = async () => {
    if (!backtest) return;
    setSharing(true);

    // CRITICAL: Mark share operation as in-flight to prevent visibility-change
    // fetchState from overwriting local state with stale server data.
    if (setShareInFlight) setShareInFlight(true);

    // Hard timeout to ensure share guard is always cleared
    const SHARE_GUARD_HARD_TIMEOUT_MS = 90000;
    const guardTimeout = setTimeout(() => {
      if (setShareInFlight) setShareInFlight(false);
    }, SHARE_GUARD_HARD_TIMEOUT_MS);

    try {
      // Force immediate sync to server before creating the share.
      // This ensures the server has the latest state, preventing the scenario
      // where visibility-change fetchState gets stale data and drops backtests.
      if (flushSync) {
        await flushSync();
      }

      const payload = sanitizeBacktestForPublic(backtest, libraries, { includeTrades, includeNotes, includeImages: includeTrades && includeImages });
      const url = await createShareWithToast({
        type: "backtest",
        payload,
        title: backtest.name || "Untitled Backtest",
        getUrl: getBacktestShareUrl,
        toast,
      });
      onShareComplete?.(url);
    } catch (err) {
      console.error("Failed to share backtest:", err);
    } finally {
      setSharing(false);
      // Clear share guard after share completes. Keep it active briefly
      // to cover the window where the user views the share link modal.
      clearTimeout(guardTimeout);
      if (setShareInFlight) {
        setTimeout(() => setShareInFlight(false), 10000);
      }
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title={t("backtests.share") || "Share Backtest"}
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
            {t("backtests.shareDescription") || "Choose what information to include in your shared backtest link."}
          </p>
        </div>

        {/* Privacy Notice */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <Shield className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-medium text-emerald-400">{t("share.privacyTitle") || "Your privacy is protected"}</span>
            <p className="text-muted-foreground mt-1">
              Only backtest metadata and selected information will be visible. Your account balances and live data are never shared.
            </p>
          </div>
        </div>

        {/* Share Options */}
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground mb-2">
            {t("share.includeTitle") || "Include in share:"}
          </div>

          {/* Always included: Metadata */}
          <div className="flex items-center justify-between p-4 rounded-xl border bg-card/60 border-accent/15">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/15 flex items-center justify-center">
                <FlaskConical className="h-5 w-5 text-accent" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("backtests.metadata") || "Backtest metadata"}</div>
                <div className="text-xs text-muted-foreground">Name, period, symbols, timeframes, deposit</div>
              </div>
            </div>
            <span className="text-[11px] text-accent font-semibold uppercase tracking-wider">{t("common.always") || "Always"}</span>
          </div>

          {/* Option: Include Trades */}
          <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
            tradesCount > 0 ? "bg-card/60 border-accent/15 hover:border-accent/30" : "bg-muted/20 border-accent/10 opacity-60"
          }`}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("backtests.trades") || "Trades"}</div>
                <div className="text-xs text-muted-foreground">
                  {tradesCount > 0 ? `${tradesCount} trade${tradesCount !== 1 ? "s" : ""}` : "No trades in this backtest"}
                </div>
              </div>
            </div>
            <Switch
              checked={includeTrades}
              onCheckedChange={setIncludeTrades}
              disabled={tradesCount === 0}
            />
          </div>

          {/* Option: Include Images */}
          <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
            includeTrades && imagesCount > 0 ? "bg-card/60 border-accent/15 hover:border-accent/30" : "bg-muted/20 border-accent/10 opacity-60"
          }`}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
                <ImageIcon className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <div className="text-sm font-medium">Photos</div>
                <div className="text-xs text-muted-foreground">
                  {imagesCount > 0 ? `${imagesCount} image${imagesCount !== 1 ? "s" : ""} across trades` : "No images in trades"}
                </div>
              </div>
            </div>
            <Switch
              checked={includeImages}
              onCheckedChange={setIncludeImages}
              disabled={!includeTrades || imagesCount === 0}
            />
          </div>

          {/* Option: Include Notes */}
          <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
            hasNotes ? "bg-card/60 border-accent/15 hover:border-accent/30" : "bg-muted/20 border-accent/10 opacity-60"
          }`}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <FileText className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("backtests.notes") || "Notes & Plan"}</div>
                <div className="text-xs text-muted-foreground">
                  {hasNotes ? "Strategy plan and description" : "No notes in this backtest"}
                </div>
              </div>
            </div>
            <Switch
              checked={includeNotes}
              onCheckedChange={setIncludeNotes}
              disabled={!hasNotes}
            />
          </div>
        </div>

        {/* Info Notice */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Anyone with the link can view your shared backtest. You can manage shared links in settings.
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={handleClose}>
            {t("common.cancel") || "Cancel"}
          </Button>
          <Button onClick={handleConfirm} disabled={sharing} className="gap-1.5">
            <Share2 className="h-4 w-4" />
            {sharing ? (t("common.loading") || "Creating...") : (t("share.createLink") || "Create Share Link")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
