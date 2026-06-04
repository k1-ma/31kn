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
  Check,
  X as XIcon,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.jsx";
import { useCountUp } from "@/lib/useCountUp.js";

function Section({ children, className = "" }) {
  return (
    <section className={`max-w-5xl mx-auto px-5 ${className}`}>{children}</section>
  );
}

function Eyebrow({ children, className = "" }) {
  return (
    <p
      className={`font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 ${className}`}
    >
      {children}
    </p>
  );
}

function FeatureRow({ index, title, body, side, vignette }) {
  const isLeft = side === "left";
  return (
    <div
      className={`grid md:grid-cols-2 gap-8 md:gap-12 items-center py-8 ${
        index < 2 ? "border-b border-slate-100 dark:border-slate-800" : ""
      }`}
    >
      <div className={`${isLeft ? "md:order-1" : "md:order-2"}`}>
        <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
          0{index + 1}
        </span>
        <h3 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 mt-3 mb-2">
          {title}
        </h3>
        <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed max-w-prose">
          {body}
        </p>
      </div>
      <div
        className={`${isLeft ? "md:order-2" : "md:order-1"} h-64 md:h-72 rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center p-6 shadow-[0_1px_2px_rgba(20,20,40,0.04)]`}
      >
        {vignette}
      </div>
    </div>
  );
}

function BudgetVignette() {
  return (
    <div className="w-full max-w-xs space-y-4">
      <div className="flex justify-between">
        {[82, 45, 100].map((p, i) => (
          <div
            key={i}
            className="relative w-16 h-16 rounded-full"
            style={{
              background: `conic-gradient(var(--brand) ${p * 3.6}deg, var(--surface-3) 0)`,
            }}
          >
            <div className="absolute inset-1 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
              {p === 100 ? "✓" : `${p}%`}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-amber-50 dark:bg-amber-950 text-amber-600 font-bold">
          !
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
            Їжа · 80% витрачено
          </div>
          <div className="text-[11px] text-slate-500">Залишилось 410 ₴</div>
        </div>
      </div>
    </div>
  );
}

function GoalVignette() {
  const pct = 68;
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative w-32 h-32 rounded-full"
        style={{
          background: `conic-gradient(var(--brand) ${pct * 3.6}deg, var(--surface-3) 0)`,
        }}
      >
        <div className="absolute inset-2.5 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center font-mono text-xl font-bold text-slate-900 dark:text-slate-100">
          {pct}%
        </div>
      </div>
      <div className="font-display font-semibold text-slate-900 dark:text-slate-100">
        Відпустка ✈️
      </div>
      <div className="font-mono text-xs text-slate-500">34 000 ₴ з 50 000 ₴</div>
    </div>
  );
}

function AnalyticsVignette() {
  const bars = [40, 65, 30, 80, 55, 70, 45];
  return (
    <div className="w-full max-w-xs">
      <div className="flex items-end justify-between gap-1.5 h-40">
        {bars.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-md ${i === 3 ? "bg-indigo-500" : "bg-indigo-100 dark:bg-indigo-950"}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2 font-mono text-[10px] text-slate-400">
        {["П", "В", "С", "Ч", "П", "С", "Н"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
    </div>
  );
}

function StatCounter({ end, suffix = "", decimals = 0, label }) {
  const { ref, value } = useCountUp(end, { decimals });
  const display = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();
  return (
    <div ref={ref} className="text-center">
      <div className="font-display font-mono-tabular text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        {display}
        {suffix}
      </div>
      <div className="mt-1 text-xs font-mono uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
    </div>
  );
}

function TrustStats() {
  const { t } = useI18n();
  return (
    <Section className="py-12">
      <div className="rounded-3xl glass px-6 py-8 md:py-10 grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-4">
        <StatCounter end={7} suffix=" " label={t("landing.statCurrencies")} />
        <StatCounter end={100} suffix="%" label={t("landing.statOffline")} />
        <StatCounter end={0} suffix="₴" label={t("landing.statPrice")} />
        <StatCounter end={2} decimals={0} suffix="s" label={t("landing.statSpeed")} />
      </div>
    </Section>
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
        <span className="text-base font-medium text-slate-900 dark:text-slate-100">
          {q}
        </span>
        <ChevronDown
          className={`h-5 w-5 text-slate-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <p className="pb-4 text-sm text-slate-500 dark:text-slate-400">{a}</p>}
    </div>
  );
}

function HeroPhoneMock() {
  return (
    <div
      className="relative mx-auto w-[270px] h-[560px] rounded-[44px] bg-slate-950 p-2 ring-1 ring-slate-900/30"
      style={{ boxShadow: "var(--sh-5)", transform: "rotate(-2deg)" }}
    >
      <div className="h-full w-full rounded-[36px] bg-white dark:bg-slate-900 p-4 flex flex-col gap-2.5 overflow-hidden">
        <div className="flex justify-between font-mono text-[11px] text-slate-500">
          <span>9:41</span>
          <span>●●●</span>
        </div>
        <div className="text-xs font-medium text-slate-500">Привіт, Анно ✦</div>
        <div className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          42 580 <span className="text-base font-normal text-slate-500">₴</span>
        </div>
        <div className="text-[11px] text-slate-500 -mt-1">Чисті активи</div>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-2.5">
            <div className="text-[10px] text-slate-500">Витрачено</div>
            <div className="font-mono text-sm font-semibold mt-0.5 text-slate-900 dark:text-slate-100">
              8 240 ₴
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-2.5">
            <div className="text-[10px] text-slate-500">Заробив</div>
            <div className="font-mono text-sm font-semibold mt-0.5 text-emerald-600">
              +25 000 ₴
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-3 mt-1">
          <div className="flex justify-between text-[11px] mb-2">
            <span className="text-slate-600 dark:text-slate-300">Їжа · бюджет</span>
            <span className="font-mono font-semibold">62%</span>
          </div>
          <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: "62%" }} />
          </div>
        </div>
        {[
          ["🍔", "Кафе", "−280", false],
          ["🚗", "Транспорт", "−110", false],
          ["💼", "Зарплата", "+25 000", true],
        ].map((row, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 px-1 py-1.5 border-t border-slate-100 dark:border-slate-800 first:border-none"
          >
            <span className="text-lg">{row[0]}</span>
            <span className="flex-1 text-xs">{row[1]}</span>
            <span
              className={`font-mono text-xs font-semibold ${row[3] ? "text-emerald-600" : "text-slate-700 dark:text-slate-300"}`}
            >
              {row[2]} ₴
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompareCell({ value }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center text-emerald-600">
        <Check className="w-4 h-4" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center justify-center text-slate-400">
        <XIcon className="w-4 h-4 opacity-60" />
      </span>
    );
  }
  return <span className="font-mono text-[11px] text-slate-500">{value}</span>;
}

export default function Landing() {
  const { t } = useI18n();
  // Honest comparison against the two things people actually use to track
  // money: a spreadsheet and their bank's own app. No invented competitors.
  const compareRows = [
    ["Гаманці, бюджети й цілі в одному", true, "вручну", "частково"],
    ["Усі рахунки разом, не один банк", true, true, false],
    ["Працює офлайн (PWA)", true, true, false],
    ["Мульти-валюта з курсами", true, "вручну", "частково"],
    ["Без реклами й продажу даних", true, true, false],
    ["Open-source", true, false, false],
    ["Дані лишаються у вас", "локально", "локально", "у банку"],
  ];
  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--text)]">
      {/* Sticky topbar with backdrop blur */}
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-white/70 dark:bg-slate-950/70 border-b border-slate-100 dark:border-slate-900">
        <Section className="flex items-center justify-between py-3.5">
          <Link to="/" className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500 text-white font-display font-bold">
              К
            </span>
            <span className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Koshyk
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              to="/login"
              className="hidden sm:inline-flex h-10 px-4 items-center rounded-xl text-sm font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
            >
              {t("auth.login")}
            </Link>
            <Link
              to="/register"
              className="inline-flex h-10 px-4 items-center rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm shadow-indigo-500/25 transition-all"
            >
              {t("landing.ctaPrimary")}
            </Link>
          </div>
        </Section>
      </header>

      {/* Hero with gradient + grid */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{
            background:
              "radial-gradient(ellipse at top right, var(--brand-soft), transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-25 bg-grid-pattern"
          style={{
            maskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 70%)",
          }}
        />
        <Section className="relative pt-14 pb-20 md:pt-24 md:pb-28">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider">
                Безкоштовно · Open-source
              </span>
              <h1 className="font-display mt-4 text-4xl md:text-6xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-[1.02]">
                {t("landing.heroTitle")}
              </h1>
              <p className="mt-5 text-base md:text-lg text-slate-500 dark:text-slate-400 max-w-prose leading-relaxed">
                {t("landing.heroSub")}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold shadow-brand transition-all"
                >
                  {t("landing.ctaPrimary")} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center h-12 px-6 rounded-2xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 font-semibold transition-colors"
                >
                  {t("landing.ctaSecondary")}
                </Link>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-500" /> 30 секунд на реєстрацію
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-500" /> Працює офлайн
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-500" /> Open-source
                </span>
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
      </section>

      {/* Trust stats — animated count-up band */}
      <TrustStats />

      {/* Features – alternating rows */}
      <Section className="py-16 md:py-20">
        <div className="text-center mb-10">
          <Eyebrow>Можливості</Eyebrow>
          <h2 className="font-display mt-2 text-3xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {t("landing.featuresTitle")}
          </h2>
        </div>
        <FeatureRow
          index={0}
          side="left"
          title={t("landing.f3.t")}
          body={t("landing.f3.b")}
          vignette={<BudgetVignette />}
        />
        <FeatureRow
          index={1}
          side="right"
          title={t("landing.f4.t")}
          body={t("landing.f4.b")}
          vignette={<GoalVignette />}
        />
        <FeatureRow
          index={2}
          side="left"
          title={t("landing.f6.t")}
          body={t("landing.f6.b")}
          vignette={<AnalyticsVignette />}
        />
      </Section>

      {/* Other features grid */}
      <Section className="py-12">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: Wallet, t: t("landing.f1.t"), b: t("landing.f1.b") },
            { icon: Tags, t: t("landing.f2.t"), b: t("landing.f2.b") },
            { icon: Repeat, t: t("landing.f5.t"), b: t("landing.f5.b") },
            { icon: PiggyBank, t: t("landing.f3.t"), b: t("landing.f3.b") },
            { icon: Target, t: t("landing.f4.t"), b: t("landing.f4.b") },
            { icon: BarChart3, t: t("landing.f6.t"), b: t("landing.f6.b") },
          ].map(({ icon: Icon, t: title, b }, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 flex flex-col gap-2 shadow-[0_1px_2px_rgba(20,20,40,0.04)]"
            >
              <div className="h-11 w-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
                <Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {b}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Compare */}
      <Section className="py-16">
        <div className="text-center mb-8">
          <Eyebrow>Чому Koshyk</Eyebrow>
          <h2 className="font-display mt-2 text-2xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Порівняй сам
          </h2>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden max-w-3xl mx-auto">
          {compareRows.map((row, i) => (
            <div
              key={i}
              className={`grid grid-cols-[2fr,1fr,1fr,1fr] gap-2 px-5 py-3.5 items-center text-sm ${
                i ? "border-t border-slate-100 dark:border-slate-800" : ""
              }`}
            >
              <span className="font-medium text-slate-900 dark:text-slate-100">{row[0]}</span>
              <span className="text-center"><CompareCell value={row[1]} /></span>
              <span className="text-center"><CompareCell value={row[2]} /></span>
              <span className="text-center"><CompareCell value={row[3]} /></span>
            </div>
          ))}
          <div className="grid grid-cols-[2fr,1fr,1fr,1fr] gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 font-mono text-[11px] uppercase tracking-wider text-slate-500">
            <span />
            <span className="text-center text-indigo-600 dark:text-indigo-400">Koshyk</span>
            <span className="text-center">Таблиця</span>
            <span className="text-center">Банк-застосунок</span>
          </div>
        </div>
      </Section>

      {/* Security card */}
      <Section className="py-12">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-7 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="h-14 w-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center shrink-0">
            <Shield className="h-7 w-7 text-indigo-600" />
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

      {/* PWA card with brand gradient */}
      <Section className="py-12">
        <div className="rounded-3xl bg-brand-gradient text-white p-7 md:p-10 flex items-center gap-6 shadow-brand relative overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.15), transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.1), transparent 40%)",
            }}
          />
          <Smartphone className="h-10 w-10 shrink-0 relative" />
          <div className="relative">
            <h3 className="font-display text-xl md:text-2xl font-bold">
              {t("landing.pwaTitle")}
            </h3>
            <p className="mt-2 text-sm opacity-90">{t("landing.pwaBody")}</p>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section className="py-12">
        <div className="text-center mb-6">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="font-display mt-2 text-2xl md:text-4xl font-bold text-slate-900 dark:text-slate-100">
            {t("landing.faqTitle")}
          </h2>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 px-5 max-w-3xl mx-auto">
          <FaqItem q={t("landing.faq1Q")} a={t("landing.faq1A")} />
          <FaqItem q={t("landing.faq2Q")} a={t("landing.faq2A")} />
          <FaqItem q={t("landing.faq3Q")} a={t("landing.faq3A")} />
          <FaqItem q={t("landing.faq4Q")} a={t("landing.faq4A")} />
        </div>
      </Section>

      {/* Final CTA — gradient block */}
      <Section className="py-16">
        <div className="relative overflow-hidden rounded-[36px] bg-brand-gradient text-white px-8 py-14 md:px-12 md:py-16 text-center shadow-brand">
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.15), transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.1), transparent 40%)",
            }}
          />
          <h2 className="relative font-display text-3xl md:text-5xl font-bold tracking-tight leading-tight">
            {t("landing.finalTitle")}
          </h2>
          <p className="relative mt-3 text-base md:text-lg opacity-85 max-w-prose mx-auto">
            {t("landing.finalSub")}
          </p>
          <Link
            to="/register"
            className="relative mt-7 inline-flex items-center gap-2 h-12 px-7 rounded-2xl bg-white text-indigo-600 font-semibold hover:bg-indigo-50 transition-colors"
          >
            {t("landing.ctaPrimary")} <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </Section>

      <footer className="py-10 text-center text-sm text-slate-400 border-t border-slate-100 dark:border-slate-900">
        © {new Date().getFullYear()} Koshyk · Made with ♥ in Ukraine
      </footer>
    </div>
  );
}
