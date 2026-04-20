import React from "react";
import Modal from "@/components/common/Modal.jsx";
import Button from "@/components/ui/Button.jsx";

/**
 * Reusable confirm dialog (replaces window.confirm).
 * Keeps UI consistent with the premium modal style.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  tone = "danger", // danger | primary | secondary
  onConfirm,
  reduceMotion,
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} reduceMotion={reduceMotion}>
      <div className="space-y-4">
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onOpenChange?.(false)}>
            {cancelText}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : tone === "secondary" ? "secondary" : "default"}
            onClick={() => {
              onOpenChange?.(false);
              onConfirm?.();
            }}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
