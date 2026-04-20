import React, { useMemo } from "react";
import LibraryPage from "@/pages/_LibraryPage.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function Tags(props) {
  const { t } = useI18n();
  const defaults = useMemo(() => ({
    emoji: "🏷️",
    color: "#f59e0b",
    placeholder: t("pages.library.placeholders.tag"),
    sub: t("pages.library.kinds.tag"),
    kindLabel: t("pages.library.kinds.tag"),
  }), [t]);
  return (
    <LibraryPage
      {...props}
      kind="tag"
      title={t("pages.tags.title")}
      subtitle={t("pages.tags.subtitle")}
      defaults={defaults}
    />
  );
}
