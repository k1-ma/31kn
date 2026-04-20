import React, { useMemo } from "react";
import LibraryPage from "@/pages/_LibraryPage.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function Sessions(props) {
  const { t } = useI18n();
  const defaults = useMemo(() => ({
    emoji: "🕒",
    color: "#3b82f6",
    placeholder: t("pages.library.placeholders.session"),
    sub: t("pages.library.kinds.session"),
    kindLabel: t("pages.library.kinds.session"),
  }), [t]);
  return (
    <LibraryPage
      {...props}
      kind="session"
      title={t("pages.sessions.title")}
      subtitle={t("pages.sessions.subtitle")}
      defaults={defaults}
    />
  );
}
