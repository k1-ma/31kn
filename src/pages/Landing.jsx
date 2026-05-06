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

function PhoneFrame({ children, className = "" }) {
  return (
    <div
      className={`relative mx-auto w-[260px] h-[520px] rounded-[40px] bg-slate-950 p-2 shadow-2xl shadow-emerald-500/20 ring-1 ring-slate-900/20 ${className}`}
    >
      <div className="h-full w-full rounded-[32px] bg-gradient-to-b from-emerald-50 to-white dark:from-slate-900 dark:to-slate-950 p-4 flex flex-col gap-3 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function HeroPhoneMock() {
  return (
    <PhoneFrame>
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
              className={`text-sm tabular-nums ${
                row.a.startsWith("+") ? "text-emerald-600" : "text-slate-700 dark:text-slate-300"
              }`}
            >
              {row.a}
            </span>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

function BudgetsPhoneMock() {
  const budgets = [
    { name: "Їжа", pct: 62, color: "bg-emerald-500" },
    { name: "Транспорт", pct: 35, color: "bg-emerald-500" },
    { name: "Розваги", pct: 88, color: "bg-amber-500" },
    { name: "Підписки", pct: 100, color: "bg-red-500" },
  ];
  return (
    <PhoneFrame>
      <div className="text-xs font-medium text-slate-500">Бюджети · Березень</div>
      <div className="space-y-3 mt-1">
        {budgets.map((b, i) => (
          <div key={i} className="rounded-2xl bg-white dark:bg-slate-900 p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{b.name}</span>
              <span className="text-xs font-semibold tabular-nums">{b.pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${b.color}`}
                style={{ width: `${Math.min(100, b.pct)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

function GoalsPhoneMock() {
  return (
    <PhoneFrame>
      <div className="text-xs font-medium text-slate-500">Цілі</div>
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✈️</span>
          <div>
            <div className="text-sm font-semibold">Подорож до Японії</div>
            <div className="text-[10px] text-slate-500">До серпня 2026</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500">28 500 з 60 000 ₴</div>
        <div className="mt-2 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: "47%" }} />
        </div>
        <div className="mt-2 text-sm font-semibold tabular-nums">47%</div>
      </div>
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏠</span>
          <div>
            <div className="text-sm font-semibold">Перший внесок</div>
            <div className="text-[10px] text-slate-500">До 2027</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500">125 000 з 300 000 ₴</div>
        <div className="mt-2 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div className="h-full bg-indigo-500" style={{ width: "42%" }} />
        </div>
        <div className="mt-2 text-sm font-semibold tabular-nums">42%</div>
      </div>
      <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950 p-3 shadow-sm">
        <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
          🎯 На цьому тижні: +1 500 ₴
        </div>
      </div>
    </PhoneFrame>
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

      {/* Screens carousel */}
      <Section className="py-12">
        <h2 className="font-display text-2xl md:text-4xl font-bold text-center mb-10 text-slate-900 dark:text-slate-100">
          {t("landing.screensTitle")}
        </h2>
        <div className="flex gap-6 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 md:justify-center md:flex-wrap md:overflow-visible">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.4 }}
            className="snap-center shrink-0 w-[280px] flex flex-col items-center gap-3"
          >
            <HeroPhoneMock />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("landing.screenDashboard")}
            </span>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="snap-center shrink-0 w-[280px] flex flex-col items-center gap-3"
          >
            <BudgetsPhoneMock />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("landing.screenBudgets")}
            </span>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="snap-center shrink-0 w-[280px] flex flex-col items-center gap-3"
          >
            <GoalsPhoneMock />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("landing.screenGoals")}
            </span>
          </motion.div>
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

      <footer className="border-t border-slate-100 dark:border-slate-900 py-10">
        <Section className="space-y-6">
          <div className="grid sm:grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-base font-bold text-emerald-600 mb-2">Koshyk</div>
              <div className="text-slate-500 dark:text-slate-400 leading-relaxed">
                {t("landing.heroSub")}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">
                {t("landing.product")}
              </div>
              <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                <li>
                  <Link to="/login" className="hover:text-emerald-600">
                    {t("auth.login")}
                  </Link>
                </li>
                <li>
                  <Link to="/register" className="hover:text-emerald-600">
                    {t("auth.register")}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">
                {t("legal.contact")}
              </div>
              <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                <li>
                  <Link to="/privacy" className="hover:text-emerald-600">
                    {t("legal.privacy")}
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-emerald-600">
                    {t("legal.terms")}
                  </Link>
                </li>
                <li>
                  <a
                    href="mailto:hello@koshyk.app"
                    className="hover:text-emerald-600"
                  >
                    hello@koshyk.app
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/k1-ma/31kn"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-emerald-600"
                  >
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-6 border-t border-slate-100 dark:border-slate-900 text-xs text-slate-400">
            <span>
              © {new Date().getFullYear()} Koshyk · Made with 💚 in Ukraine
            </span>
            <LanguageSwitcher />
          </div>
        </Section>
      </footer>
    </div>
  );
}
