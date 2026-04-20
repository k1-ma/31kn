import React, { useMemo } from "react";
import LibraryPage from "@/pages/_LibraryPage.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function Models(props) {
  const { t } = useI18n();
  const defaults = useMemo(() => ({
    emoji: "🧠",
    color: "#8b5cf6",
    placeholder: t("pages.library.placeholders.model"),
    sub: t("pages.library.kinds.model"),
    kindLabel: t("pages.library.kinds.model"),
  }), [t]);
  return (
    <LibraryPage
      {...props}
      kind="model"
      title={t("pages.models.title")}
      subtitle={t("pages.models.subtitle")}
      defaults={defaults}
    />
  );
}
