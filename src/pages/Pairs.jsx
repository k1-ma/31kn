import React, { useMemo } from "react";
import LibraryPage from "@/pages/_LibraryPage.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function Pairs(props) {
  const { t } = useI18n();
  const defaults = useMemo(() => ({
    emoji: "💠",
    color: "#22c55e",
    placeholder: t("pages.library.placeholders.pair"),
    sub: t("pages.library.kinds.pair"),
    kindLabel: t("pages.library.kinds.pair"),
  }), [t]);
  return (
    <LibraryPage
      {...props}
      kind="pair"
      title={t("pages.pairs.title")}
      subtitle={t("pages.pairs.subtitle")}
      defaults={defaults}
    />
  );
}
