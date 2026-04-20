import React, { useState } from "react";
import Modal from "./Modal.jsx";
import Button from "@/components/ui/Button.jsx";
import SocialLinks from "@/components/common/SocialLinks.jsx";
import { Link2, Copy, ExternalLink, Check } from "lucide-react";

/**
 * Modal to display a share link after creating a share bundle
 */
export default function ShareLinkModal({ open, onOpenChange, shareUrl, toast, reduceMotion }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // Try modern Clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        // Fallback: use a temporary textarea element
        const textArea = document.createElement("textarea");
        textArea.value = shareUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast?.push?.({ title: "Copied!", description: "Share link copied to clipboard", tone: "success" });
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast?.push?.({ title: "Failed to copy", description: String(e), tone: "error" });
    }
  };

  const handleOpen = () => {
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const handleClose = () => {
    onOpenChange?.(false);
    setCopied(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title="Share link ready"
      reduceMotion={reduceMotion}
      size="md"
    >
      <div className="space-y-5">
        {/* Icon + Message */}
        <div className="flex flex-col items-center text-center pb-2">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-accent/20 to-accent-2/20 flex items-center justify-center mb-4 shadow-lg shadow-accent/10">
            <Link2 className="h-7 w-7 text-accent" />
          </div>
          <p className="text-sm text-muted-foreground">
            Anyone with this link can view the selected trades.
          </p>
        </div>

        {/* Link Input */}
        <div className="relative">
          <input
            type="text"
            readOnly
            value={shareUrl || ""}
            className="w-full h-12 px-4 pr-24 rounded-xl border border-accent/20 bg-card/50 text-sm text-foreground font-mono truncate focus:outline-none focus:ring-2 focus:ring-accent/30"
            onClick={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="absolute right-2 top-2 h-8 px-3 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {/* Social Links */}
        <div className="pt-2 border-t border-accent/10">
          <p className="text-xs text-muted-foreground text-center mb-3">Follow us:</p>
          <SocialLinks variant="inline" className="justify-center" />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleOpen} className="gap-1.5">
            <ExternalLink className="h-4 w-4" />
            Open
          </Button>
          <Button onClick={handleClose} className="gap-1.5 px-6">
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
