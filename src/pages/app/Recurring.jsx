import React from "react";
import { Repeat } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function Recurring() {
  const { t } = useI18n();
  return (
    <div className="page-enter space-y-4">
      <PageHeader title={t("nav.recurring")} />
      <EmptyState icon={Repeat} title={t("recurring.empty")} />
    </div>
  );
}
