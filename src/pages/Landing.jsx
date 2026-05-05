import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Wallet,
  Tags,
  PiggyBank,
  Target,
  Repeat,
  BarChart3,
  Shield,
  Smartphone,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.jsx";

function Section({ children, className = "" }) {
  return (
    <section className={`max-w-5xl mx-auto px-5 ${className}`}>{children}</section>
  );
}

function FeatureCard({ icon: Icon, title, body }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 shadow-[0_2px_18px_rgba(15,23,42,0.04)] flex flex-col gap-2">
      <div className="h-11 w-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
        <Icon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{body}</div>
    </div>
  );
}

function ProblemCard({ title, body }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{body}</div>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 dark:border-slate-800 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-base font-medium text-slate-900 dark:text-slate-100">{q}</span>
        <ChevronDown className={`h-5 w-5 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="pb-4 text-sm text-slate-500 dark:text-slate-400">{a}</p>}
    </div>
  );
}

function HeroPhoneMock() {
  return (
    <div className="relative mx-auto w-[260px] h-[520px] rounded-[40px] bg-slate-950 p-2 shadow-2xl shadow-emerald-500/20 ring-1 ring-slate-900/20">
      <div className="h-full w-full rounded-[32px] bg-gradient-to-b from-emerald-50 to-white dark:from-slate-900 dark:to-slate-950 p-4 flex flex-col gap-3 overflow-hidden">
        <div className="text-xs font-medium text-emerald-700">Привіт ✨</div>
        <div className="text-2xl font-bold tabular-nums">42 580 ₴</div>
        <div className="text-xs text-slate-500">Чисті активи</div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-3 shadow-sm">
            <div className="text-[10px] text-slate-500">Витрачено</div>
            <div className="text-sm font-semibold tabular-nums">8 240 ₴</div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-3 shadow-sm">
            <div className="text-[10px] text-slate-500">Заробив</div>
            <div className="text-sm font-semibold tabular-nums text-emerald-600">25 000 ₴</div>
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Їжа · бюджет</span>
            <span className="text-xs font-semibold tabular-nums">62%</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: "62%" }} />
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-3 shadow-sm space-y-2">
          {[
            { i: "🍔", t: "Їжа", a: "-280 ₴" },
            { i: "🚗", t: "Транспорт", a: "-110 ₴" },
            { i: "💼", t: "Зарплата", a: "+25 000 ₴" },
          ].map((row, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <span className="text-sm">
                {row.i} {row.t}
              </span>
              <span
                className={`text-sm tabular-nums ${row.a.startsWith("+") ? "text-emerald-600" : "text-slate-700 dark:text-slate-300"}`}
              >
                {row.a}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-emerald-50/30 to-white dark:from-slate-950 dark:via-emerald-950/10 dark:to-slate-950">
      {/* Top bar */}
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 dark:bg-slate-950/70 border-b border-slate-100 dark:border-slate-900">
        <Section className="flex items-center justify-between py-3">
          <Link to="/" className="text-xl font-bold text-emerald-600">Koshyk</Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              to="/login"
              className="hidden sm:inline-flex h-10 px-4 items-center rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t("auth.login")}
            </Link>
            <Link
              to="/register"
              className="inline-flex h-10 px-4 items-center rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {t("landing.ctaPrimary")}
            </Link>
          </div>
        </Section>
      </header>

      {/* Hero */}
      <Section className="pt-12 pb-16 md:pt-20 md:pb-24">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-[1.05]">
              {t("landing.heroTitle")}
            </h1>
            <p className="mt-5 text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-prose">
              {t("landing.heroSub")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/30"
              >
                {t("landing.ctaPrimary")} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center h-12 px-6 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 font-semibold"
              >
                {t("landing.ctaSecondary")}
              </Link>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex justify-center"
          >
            <HeroPhoneMock />
          </motion.div>
        </div>
      </Section>

      {/* Problem → solution */}
      <Section className="py-12">
        <h2 className="font-display text-2xl md:text-4xl font-bold text-center mb-8 text-slate-900 dark:text-slate-100">
          {t("landing.problemTitle")}
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <ProblemCard title={t("landing.p1Title")} body={t("landing.p1Body")} />
          <ProblemCard title={t("landing.p2Title")} body={t("landing.p2Body")} />
          <ProblemCard title={t("landing.p3Title")} body={t("landing.p3Body")} />
        </div>
      </Section>

      {/* Features */}
      <Section className="py-12">
        <h2 className="font-display text-2xl md:text-4xl font-bold text-center mb-8 text-slate-900 dark:text-slate-100">
          {t("landing.featuresTitle")}
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard icon={Wallet} title={t("landing.f1.t")} body={t("landing.f1.b")} />
          <FeatureCard icon={Tags} title={t("landing.f2.t")} body={t("landing.f2.b")} />
          <FeatureCard icon={PiggyBank} title={t("landing.f3.t")} body={t("landing.f3.b")} />
          <FeatureCard icon={Target} title={t("landing.f4.t")} body={t("landing.f4.b")} />
          <FeatureCard icon={Repeat} title={t("landing.f5.t")} body={t("landing.f5.b")} />
          <FeatureCard icon={BarChart3} title={t("landing.f6.t")} body={t("landing.f6.b")} />
        </div>
      </Section>

      {/* Security */}
      <Section className="py-12">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-7 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
            <Shield className="h-7 w-7 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-display text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t("landing.securityTitle")}
            </h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t("landing.securityBody")}
            </p>
          </div>
        </div>
      </Section>

      {/* PWA */}
      <Section className="py-12">
        <div className="rounded-3xl bg-emerald-500 text-white p-7 md:p-10 flex items-center gap-6">
          <Smartphone className="h-10 w-10 shrink-0" />
          <div>
            <h3 className="font-display text-xl md:text-2xl font-bold">{t("landing.pwaTitle")}</h3>
            <p className="mt-2 text-sm opacity-90">{t("landing.pwaBody")}</p>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section className="py-12">
        <h2 className="font-display text-2xl md:text-4xl font-bold text-center mb-6 text-slate-900 dark:text-slate-100">
          {t("landing.faqTitle")}
        </h2>
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 px-5">
          <FaqItem q={t("landing.faq1Q")} a={t("landing.faq1A")} />
          <FaqItem q={t("landing.faq2Q")} a={t("landing.faq2A")} />
          <FaqItem q={t("landing.faq3Q")} a={t("landing.faq3A")} />
          <FaqItem q={t("landing.faq4Q")} a={t("landing.faq4A")} />
        </div>
      </Section>

      {/* Final CTA */}
      <Section className="py-16">
        <div className="text-center">
          <h2 className="font-display text-3xl md:text-5xl font-bold text-slate-900 dark:text-slate-100">
            {t("landing.finalTitle")}
          </h2>
          <p className="mt-3 text-base text-slate-500 dark:text-slate-400 max-w-prose mx-auto">
            {t("landing.finalSub")}
          </p>
          <Link
            to="/register"
            className="mt-7 inline-flex items-center gap-2 h-14 px-8 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-base shadow-xl shadow-emerald-500/30"
          >
            {t("landing.ctaPrimary")} <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </Section>

      <footer className="py-10 text-center text-sm text-slate-400 border-t border-slate-100 dark:border-slate-900">
        © {new Date().getFullYear()} Koshyk
      </footer>
    </div>
  );
}
