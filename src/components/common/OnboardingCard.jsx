import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

const DISMISS_KEY = "koshyk:onboarded";

/**
 * First-run welcome card shown on the dashboard until dismissed. Brand-new
 * accounts are seeded with default wallets/categories, so the next useful step
 * is recording a transaction — that is what the CTA drives. Dismissal is
 * persisted in localStorage so it never reappears.
 */
export default function OnboardingCard() {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(() => {
    try {
      return !!localStorage.getItem(DISMISS_KEY);
    } catch {
      return false;
    }
  });
  if (hidden) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore storage failures — worst case the card shows again next load
    }
    setHidden(true);
  };

  const steps = [t("onboarding.step1"), t("onboarding.step2"), t("onboarding.step3")];

  return (
    <div className="relative rounded-3xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("common.close")}
        className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
        <Sparkles className="w-5 h-5" />
        <h3 className="font-display font-semibold">{t("onboarding.title")}</h3>
      </div>
      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 max-w-prose">{t("onboarding.body")}</p>
      <ol className="mt-3 space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500 text-white text-xs font-semibold shrink-0">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <Link
        to="/app/transactions/new"
        onClick={dismiss}
        className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold transition-colors"
      >
        {t("onboarding.cta")} <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
