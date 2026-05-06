import { useCallback } from "react";
import { useFinance } from "@/lib/finance/store.jsx";
import { useToast } from "@/components/common/ToastProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

/**
 * Soft-delete an item from a finance collection and surface a toast with
 * an "Undo" action that restores it. The toast stays visible for 5
 * seconds; after that the item still lives in Trash for 30 days.
 *
 * @returns {(collection: string, id: string, label?: string) => void}
 */
export function useDeleteWithUndo() {
  const { remove, restore } = useFinance();
  const { push } = useToast();
  const { t } = useI18n();

  return useCallback(
    (collection, id, label) => {
      remove(collection, id);
      push({
        kind: "success",
        title: label || t("toasts.deleted"),
        action: {
          label: t("trash.restore"),
          onClick: () => restore(collection, id),
        },
        duration: 5000,
      });
    },
    [remove, restore, push, t]
  );
}
