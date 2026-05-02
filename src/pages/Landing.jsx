import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { SUPPORTED_LANGS } from "@/i18n/translations";
import SocialLinks from "@/components/common/SocialLinks.jsx";
import hauntedLogo from "@/assets/haunted.png";
import ftmoLogo from "@/assets/ftmo.png";
import { SEED } from "@/lib/seed.js";
import {
  LayoutDashboard, BarChart3, BookOpen, Wallet, FileText,
  Lightbulb, Building2, Target, ExternalLink, Globe, Shield, MessageSquare,
  Flame, Heart, Cloud, Infinity, DollarSign, Timer, Unlock, Trophy,
  ChevronDown, Sparkles, Menu, X, Check, ChevronRight, Loader2, Languages, Eye, LogIn,
} from "lucide-react";

/* ─── helpers ─── */
const gradient = "bg-gradient-to-r from-[#3B82F6] via-[#60A5FA] to-[#22D3EE]";
const gradientText = `${gradient} bg-clip-text text-transparent`;
const ctaGradient = "bg-gradient-to-r from-[#3B82F6] to-[#22D3EE]";
const sectionDivider = "relative before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[#3B82F6]/20 before:to-transparent";
const glassBtn = "backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_24px_rgba(0,0,0,0.25)] hover:bg-white/[0.07] hover:border-white/[0.14] transition-all duration-300";
const glassBtnAccent = "backdrop-blur-xl bg-[#3B82F6]/[0.12] border border-[#3B82F6]/[0.25] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_24px_rgba(59,130,246,0.2)] hover:bg-[#3B82F6]/[0.18] hover:border-[#3B82F6]/[0.35] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_32px_rgba(59,130,246,0.3)] transition-all duration-300";
const glassCard = "backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_40px_rgba(0,0,0,0.2)] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all duration-300";

const FEATURES = [
  { icon: LayoutDashboard, color: "#3B82F6" },
  { icon: BarChart3,       color: "#60A5FA" },
  { icon: BookOpen,        color: "#22D3EE" },
  { icon: Wallet,          color: "#3B82F6" },
  { icon: FileText,        color: "#60A5FA" },
  { icon: Lightbulb,       color: "#22D3EE" },
  { icon: Building2,       color: "#3B82F6" },
  { icon: Target,          color: "#60A5FA" },
  { icon: ExternalLink,    color: "#22D3EE" },
  { icon: Globe,           color: "#3B82F6" },
  { icon: Shield,          color: "#60A5FA" },
  { icon: MessageSquare,   color: "#22D3EE" },
];

const STATS = [
  { icon: Flame,      color: "#3B82F6" },
  { icon: Heart,      color: "#60A5FA" },
  { icon: Cloud,      color: "#22D3EE" },
  { icon: Infinity,   color: "#3B82F6" },
  { icon: DollarSign, color: "#60A5FA" },
  { icon: Timer,      color: "#22D3EE" },
  { icon: Unlock,     color: "#3B82F6" },
  { icon: Trophy,     color: "#60A5FA" },
];

const PREVIEW_TABS = ["dashboard", "analytics", "trades", "propFirms"];
const PREVIEW_TAB_ICONS = [LayoutDashboard, BarChart3, BookOpen, Building2];
const PREVIEW_ACCENTS = ["#3B82F6", "#60A5FA", "#22D3EE", "#3B82F6"];

/* ─── animation presets ─── */
const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } };
const stagger = { visible: { transition: { staggerChildren: 0.07 } } };

/* ─── lazy page imports for interactive demo ─── */
const LazyDashboard = lazy(() => import("@/pages/DashboardPage.jsx"));
const LazyAnalytics = lazy(() => import("@/pages/Analytics.jsx"));
const LazyTrades = lazy(() => import("@/pages/Trades.jsx"));
const LazyPropPrograms = lazy(() => import("@/pages/PropPrograms.jsx"));

/* ─── demo mock data (read-only, nothing saves) ─── */
const DEMO_NOOP = () => {};
const DEMO_TOAST = { toasts: [], push: DEMO_NOOP, remove: DEMO_NOOP };
const DEMO_USER = { id: "demo", email: "demo@haunted.trade", username: "DemoTrader" };

const _seedSyms = SEED.libraries.symbols;
const DEMO_LIBRARIES = {
  symbols: [
    { id: "ds1", name: "EURUSD", avatar: _seedSyms[0].avatar, color: _seedSyms[0].color, deletedAt: null },
    { id: "ds2", name: "GBPUSD", avatar: _seedSyms[1].avatar, color: _seedSyms[1].color, deletedAt: null },
    { id: "ds3", name: "GER40",  avatar: _seedSyms[2].avatar, color: _seedSyms[2].color, deletedAt: null },
    { id: "ds4", name: "XAUUSD", avatar: _seedSyms[3].avatar, color: _seedSyms[3].color, deletedAt: null },
  ],
  sessions: [
    { id: "dss1", name: "London",   avatar: { type: "emoji", emoji: "🏛️" }, color: "#3B82F6", deletedAt: null },
    { id: "dss2", name: "New York", avatar: { type: "emoji", emoji: "🗽" }, color: "#22C55E", deletedAt: null },
  ],
};

const DEMO_ACCOUNTS = [
  { id: "da1", name: "Main Account", currency: "$", startingEquity: 10000, currentEquity: 11545, status: "Live", notes: "", avatar: { type: "emoji", emoji: "💰" }, tags: [], color: "#3B82F6", isHidden: false, manualTradingDays: 0, createdAt: Date.now() - 90 * 86400000 },
  { id: "da2", name: "FTMO 100K", currency: "$", startingEquity: 100000, currentEquity: 100800, status: "Live", notes: "", avatar: { type: "image", imageData: ftmoLogo }, tags: [], color: "#1a56db", isHidden: false, manualTradingDays: 0, createdAt: Date.now() - 30 * 86400000 },
];

const _mkTrade = (d, sym, dir, entry, exit, pnl, risk, acc, tags, sess) => ({
  id: `dt-${d}-${sym}`, date: `2026-02-${String(d).padStart(2, "0")}`,
  symbolId: sym, direction: dir, entryPrice: entry, exitPrice: exit,
  outcome: pnl > 0 ? "Profit" : pnl < 0 ? "Loss" : "Breakeven",
  pnl, riskUsd: risk, commission: 0, fees: "", tags: tags || [],
  allocations: [{ id: `al-${d}-${sym}`, accountId: acc, pnl, commission: 0, riskUsd: risk, riskPctOverride: null, rr: Math.round(Math.abs(pnl / risk) * 100) / 100, riskMode: "usd", pnlMode: "manual" }],
  ideaIds: [], deletedAt: null, link: "", sessionIds: sess ? [sess] : [],
  notesBefore: "", notesAfter: "", notesDuring: "", images: [],
  emotionEntry: "", emotionExit: "", followedPlan: pnl > 0,
});

const DEMO_TRADES = [
  _mkTrade(7, "ds1", "Long",  1.0845, 1.0890,  225, 100, "da1", ["trend"],    "dss1"),
  _mkTrade(7, "ds3", "Short", 18500,  18300,    350, 150, "da1", ["reversal"], "dss2"),
  _mkTrade(6, "ds4", "Long",  2025,   2042,     170, 100, "da1", ["breakout"], "dss1"),
  _mkTrade(6, "ds2", "Short", 1.2580, 1.2610,  -120, 120, "da1", [],          "dss2"),
  _mkTrade(5, "ds3", "Long",  18200,  18350,    300, 100, "da2", ["momentum"],"dss2"),
  _mkTrade(5, "ds1", "Short", 1.0870, 1.0855,   150, 100, "da2", [],          "dss1"),
  _mkTrade(4, "ds3", "Long",  18100,  18350,    250, 100, "da1", ["trend"],    "dss2"),
  _mkTrade(4, "ds4", "Short", 2050,   2045,     100, 100, "da2", [],          "dss1"),
  _mkTrade(3, "ds2", "Long",  1.2550, 1.2530,   -80,  80, "da1", [],          "dss2"),
  _mkTrade(3, "ds3", "Short", 18400,  18300,    200, 100, "da1", ["reversal"], "dss1"),
];

class DemoErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  render() {
    if (this.state.err) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Unable to load preview</div>;
    return this.props.children;
  }
}

function DemoRenderer({ tab }) {
  switch (tab) {
    case "dashboard":
      return <LazyDashboard trades={DEMO_TRADES} accounts={DEMO_ACCOUNTS} libraries={DEMO_LIBRARIES} propTemplates={[]} reduceMotion={false} onAddTrade={DEMO_NOOP} onTradeClick={DEMO_NOOP} ui={{}} demoMode />;
    case "analytics":
      return <LazyAnalytics trades={DEMO_TRADES} accounts={DEMO_ACCOUNTS} libraries={DEMO_LIBRARIES} reduceMotion={false} onTradeClick={DEMO_NOOP} ui={{}} />;
    case "trades":
      return <LazyTrades trades={DEMO_TRADES} accounts={DEMO_ACCOUNTS} documents={[]} ideas={[]} libraries={DEMO_LIBRARIES} onUpsert={DEMO_NOOP} onUpsertAccount={DEMO_NOOP} onUpsertSymbol={DEMO_NOOP} propTemplates={[]} onRemove={DEMO_NOOP} onRemoveBulk={DEMO_NOOP} onNavigateToDocument={DEMO_NOOP} onNavigateToIdea={DEMO_NOOP} reduceMotion={false} toast={DEMO_TOAST} user={DEMO_USER} />;
    case "propFirms":
      return <LazyPropPrograms propTemplates={[]} onSetPropTemplates={DEMO_NOOP} toast={DEMO_TOAST} />;
    default:
      return null;
  }
}

/* ════════════════════════════════════════════════════════════════ */
/*  NAVIGATION                                                     */
/* ════════════════════════════════════════════════════════════════ */
function Navbar() {
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const links = [
    { label: t("landing.nav.features"), href: "#features" },
    { label: t("landing.nav.faq"),      href: "#faq" },
    { label: t("landing.nav.updates"),  href: "/app" },
  ];

  const handleLink = (href) => {
    setOpen(false);
    if (href.startsWith("#")) {
      const el = document.querySelector(href);
      el?.scrollIntoView({ behavior: "smooth" });
    } else {
      nav(href);
    }
  };

  const currentLang = SUPPORTED_LANGS.find((l) => l.id === lang);

  return (
    <>
      <nav className="sticky top-0 z-50 bg-[#070A12]/60 backdrop-blur-2xl border-b border-white/[0.06] shadow-[0_1px_40px_rgba(0,0,0,0.3)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 sm:px-8 h-16">
          {/* Logo */}
          <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="flex items-center gap-2">
            <img src={hauntedLogo} alt="Haunted" width={32} height={32} className="h-8 w-8" />
            <span className={`text-sm font-display font-bold tracking-[0.2em] uppercase ${gradientText}`}>HAUNTED</span>
          </a>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {links.map((l) => (
              <button key={l.href} onClick={() => handleLink(l.href)}
                className="relative text-[13px] font-medium text-[#9FB3D9]/80 hover:text-white transition-colors duration-300 tracking-wide group">
                {l.label}
                <span className="absolute -bottom-1 left-0 w-0 h-[1.5px] bg-gradient-to-r from-[#3B82F6] to-[#22D3EE] group-hover:w-full transition-all duration-300" />
              </button>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Language selector */}
            <div ref={langRef} className="relative">
              <button onClick={() => setLangOpen(!langOpen)}
                className={`flex items-center gap-1.5 text-xs text-[#9FB3D9]/80 hover:text-white transition-all duration-300 px-3 py-1.5 rounded-[4px] ${glassBtn}`}>
                <Languages className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{currentLang?.label}</span>
              </button>
              <AnimatePresence>
                {langOpen && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    className="absolute right-0 mt-2 bg-[#131722]/95 backdrop-blur-2xl border border-white/[0.08] rounded-[4px] shadow-[0_12px_40px_rgba(0,0,0,0.5)] overflow-hidden min-w-[140px] z-50">
                    {SUPPORTED_LANGS.map((l) => (
                      <button key={l.id}
                        onClick={() => { setLang(l.id); setLangOpen(false); }}
                        className={`block w-full text-left px-4 py-2 text-xs transition-all duration-200
                          ${l.id === lang ? "text-white bg-[#3B82F6]/15" : "text-[#9FB3D9]/80 hover:text-white hover:bg-white/[0.05]"}`}>
                        {l.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Login */}
            <button onClick={() => nav("/login")}
              className={`hidden md:inline-flex items-center gap-1.5 text-[13px] font-medium text-[#9FB3D9]/80 hover:text-white px-4 py-2 rounded-[4px] ${glassBtn}`}>
              <LogIn className="h-3.5 w-3.5" />
              {t("landing.nav.login")}
            </button>

            {/* CTA */}
            <button onClick={() => nav("/register")}
              className={`hidden md:inline-flex items-center gap-1.5 text-[13px] font-semibold text-white px-5 py-2 rounded-[4px] ${glassBtnAccent}`}>
              {t("landing.nav.cta")}
            </button>

            {/* Mobile hamburger */}
            <button onClick={() => setOpen(true)} className="md:hidden text-[#9FB3D9] hover:text-white">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed top-0 right-0 z-50 h-full w-72 bg-[#070A12]/95 backdrop-blur-2xl border-l border-white/[0.06] p-6 flex flex-col gap-6">
              <button onClick={() => setOpen(false)} className="self-end text-[#9FB3D9] hover:text-white">
                <X className="h-5 w-5" />
              </button>
              {links.map((l) => (
                <button key={l.href} onClick={() => handleLink(l.href)}
                  className="text-base text-[#9FB3D9] hover:text-white transition-colors text-left">
                  {l.label}
                </button>
              ))}
              <button onClick={() => { setOpen(false); nav("/login"); }}
                className={`text-[13px] font-medium text-[#9FB3D9] hover:text-white px-5 py-2.5 rounded-[4px] ${glassBtn} flex items-center gap-2`}>
                <LogIn className="h-3.5 w-3.5" />
                {t("landing.nav.login")}
              </button>
              <button onClick={() => { setOpen(false); nav("/register"); }}
                className={`text-[13px] font-semibold text-white px-5 py-2.5 rounded-[4px] ${glassBtnAccent}`}>
                {t("landing.nav.cta")}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  HERO                                                           */
/* ════════════════════════════════════════════════════════════════ */
function Hero() {
  const { t } = useI18n();
  const nav = useNavigate();

  return (
    <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden pt-16 pb-10">
      {/* Premium glow orbs */}
      <div className="absolute top-[15%] -left-24 w-[500px] h-[500px] bg-gradient-to-br from-[#3B82F6]/12 to-[#1E3A8A]/8 rounded-full blur-[150px] animate-pulse" />
      <div className="absolute bottom-[10%] -right-24 w-[400px] h-[400px] bg-gradient-to-tl from-[#22D3EE]/8 to-[#3B82F6]/6 rounded-full blur-[130px] animate-pulse [animation-delay:1s]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[#1E3A8A]/[0.04] rounded-full blur-[180px]" />

      <div className="relative z-10 flex flex-col items-center text-center px-6 gap-6 max-w-4xl">
        {/* Logo — no box-shadow, only soft radial glow behind */}
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }} className="relative mb-2">
          <div className="absolute -inset-6 bg-[#3B82F6]/20 blur-[60px] rounded-full" />
          <img src={hauntedLogo} alt="Haunted" width={80} height={80} className="relative h-20 w-20 drop-shadow-[0_0_30px_rgba(59,130,246,0.3)]" />
        </motion.div>

        {/* Title — white + blue gradient keywords */}
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }}
          className="text-4xl sm:text-5xl md:text-7xl font-display font-bold tracking-tight leading-[1.1]">
          <span className="text-white">NEXT-GEN </span>
          <span className={gradientText}>{t("landing.hero.titleAccent")}</span>
        </motion.h1>

        {/* Subtitle — gray-blue */}
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.6 }}
          className="text-base md:text-lg text-[#9FB3D9]/80 max-w-2xl leading-relaxed font-light tracking-wide">
          {t("landing.hero.subtitle")}
        </motion.p>

        {/* CTAs */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-4 mt-3">
          <button onClick={() => nav("/register")}
            className={`inline-flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-[4px] ${glassBtnAccent} text-[15px]`}>
            {t("landing.hero.cta")} <ChevronRight className="h-4 w-4" />
          </button>
          <a href="#features" onClick={(e) => { e.preventDefault(); document.querySelector("#features")?.scrollIntoView({ behavior: "smooth" }); }}
            className={`inline-flex items-center gap-2 text-[#9FB3D9] hover:text-white px-8 py-3.5 rounded-[4px] text-[15px] ${glassBtn}`}>
            {t("landing.hero.learnMore")}
          </a>
        </motion.div>

        {/* Trust line */}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.6 }}
          className="mt-4 text-[11px] text-[#9FB3D9]/40 tracking-[0.15em] uppercase font-medium">
          {t("landing.hero.trust")}
        </motion.p>

        {/* Scroll indicator */}
        <motion.div animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 2.5 }}
          className="mt-2 text-[#3B82F6]/30">
          <ChevronDown className="h-5 w-5" />
        </motion.div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  DEVELOPMENT BANNER                                             */
/* ════════════════════════════════════════════════════════════════ */
function DevBanner() {
  const { t } = useI18n();
  const nav = useNavigate();

  return (
    <section className="relative px-6 pt-12 pb-8">
      <div className="max-w-4xl mx-auto">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className={`flex flex-col sm:flex-row items-center gap-4 p-6 rounded-[6px] ${glassCard}`}>
          <div className="flex items-center gap-3 flex-1">
            {/* LIVE badge */}
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3B82F6] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#3B82F6] shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#3B82F6] bg-[#3B82F6]/10 px-2.5 py-1 rounded-[3px] shadow-[0_0_10px_rgba(59,130,246,0.15)]">LIVE</span>
            <p className="text-sm">
              <span className="font-bold text-[#60A5FA]">{t("landing.devBanner.title")}</span>{" "}
              <span className="text-[#9FB3D9]">{t("landing.devBanner.text")}</span>
            </p>
          </div>
          <button onClick={() => nav("/register")}
            className={`text-xs font-semibold text-[#3B82F6] px-5 py-2 rounded-[4px] ${glassBtn} whitespace-nowrap`}>
            {t("landing.devBanner.cta")}
          </button>
        </motion.div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  WHAT IS / IS NOT                                                */
/* ════════════════════════════════════════════════════════════════ */
function WhatIs() {
  const { t } = useI18n();
  const isItems = Array.from({ length: 5 }, (_, i) => i);

  return (
    <section className={`relative py-28 px-6 ${sectionDivider}`}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="text-center mb-16">
          <h2 className={`text-3xl md:text-5xl font-bold text-white mb-5 tracking-tight`}>{t("landing.whatIs.title")}</h2>
          <p className="text-[#9FB3D9]/80 max-w-xl mx-auto text-[15px] leading-relaxed">{t("landing.whatIs.subtitle")}</p>
        </motion.div>

        {/* Two cards */}
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="grid md:grid-cols-2 gap-6">
          {/* IS — active, bright */}
          <div className={`rounded-[6px] p-7 ${glassCard} hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_50px_rgba(59,130,246,0.12)] hover:-translate-y-[2px]`}>
            <div className="absolute inset-0 bg-gradient-to-b from-[#3B82F6]/[0.03] to-transparent pointer-events-none rounded-[6px]" />
            <h3 className={`relative text-center text-[11px] font-bold uppercase tracking-[0.25em] mb-7 ${gradientText}`}>
              {t("landing.whatIs.is.title")}
            </h3>
            <div className="relative flex flex-col gap-3.5">
              {isItems.map((i) => (
                <div key={i} className="flex items-start gap-2.5 text-[13px] text-white/90 leading-relaxed">
                  <Check className="h-3.5 w-3.5 text-[#22D3EE] flex-shrink-0 mt-0.5" />
                  <span>{t(`landing.whatIs.is.${i}`)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* IS NOT — muted, darker */}
          <div className="rounded-[6px] border border-white/[0.04] bg-[#070A12]/60 p-7 opacity-60 hover:opacity-75 transition-all duration-300">
            <h3 className="text-center text-[11px] font-bold text-[#9FB3D9]/50 uppercase tracking-[0.25em] mb-7">
              {t("landing.whatIs.isNot.title")}
            </h3>
            <div className="flex flex-col gap-3.5">
              {isItems.map((i) => (
                <div key={i} className="flex items-start gap-2.5 text-[13px] text-[#9FB3D9]/50 leading-relaxed">
                  <X className="h-3.5 w-3.5 text-[#1E3A8A]/60 flex-shrink-0 mt-0.5" />
                  <span>{t(`landing.whatIs.isNot.${i}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Highlight phrase */}
        <motion.p variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="text-center text-sm text-[#9FB3D9]/70 mt-12 tracking-wide">
          {t("landing.whatIs.highlight")}<span className={gradientText + " font-semibold"}>{t("landing.whatIs.highlightAccent")}</span>
        </motion.p>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  FEATURES                                                       */
/* ════════════════════════════════════════════════════════════════ */
function Features() {
  const { t } = useI18n();

  return (
    <section id="features" className={`relative py-28 px-6 scroll-mt-16 ${sectionDivider}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="text-center mb-16">
          <span className={`inline-block text-[10px] font-bold uppercase tracking-[0.25em] text-[#3B82F6] px-4 py-1.5 rounded-[4px] mb-5 ${glassBtnAccent}`}>
            {t("landing.features.badge")}
          </span>
          <h2 className={`text-3xl md:text-5xl font-bold ${gradientText} mb-5 tracking-tight`}>{t("landing.features.title")}</h2>
          <p className="text-[#9FB3D9]/80 max-w-2xl mx-auto text-[15px] leading-relaxed">{t("landing.features.subtitle")}</p>
        </motion.div>

        {/* Grid */}
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            const iconStyle = { backgroundColor: `${f.color}10`, border: `1px solid ${f.color}18` };
            return (
              <motion.div key={i} variants={fadeUp}
                className={`group relative p-6 rounded-[6px] ${glassCard} hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_50px_rgba(59,130,246,0.08)] hover:-translate-y-[2px]`}>
                <div className="absolute inset-0 rounded-[6px] bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-3.5">
                    <div className="flex items-center justify-center h-10 w-10 rounded-[4px]" style={iconStyle}>
                      <Icon className="h-5 w-5" style={{ color: f.color }} />
                    </div>
                    <h3 className="font-semibold text-sm text-white tracking-wide">{t(`landing.features.items.${i}.name`)}</h3>
                  </div>
                  <p className="text-[13px] text-[#9FB3D9]/70 leading-relaxed">{t(`landing.features.items.${i}.desc`)}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  APP PREVIEW MOCKUPS                                            */
/* ════════════════════════════════════════════════════════════════ */


function AppPreview() {
  const { t } = useI18n();
  const [active, setActive] = useState(null);

  /* lock body scroll & handle Escape when overlay is open */
  useEffect(() => {
    if (active === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") setActive(null); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [active]);

  return (
    <section className="relative py-32 md:py-40 px-6 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 80% 50% at 50% 40%, rgba(59,130,246,0.05) 0%, transparent 70%)"
      }} />

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="text-center mb-16 md:mb-24">
          <h2 className={`text-3xl md:text-5xl font-bold ${gradientText} mb-5 tracking-tight`}>
            {t("landing.preview.title")}
          </h2>
          <p className="text-[#9FB3D9]/70 max-w-lg mx-auto text-sm md:text-[15px] leading-relaxed">
            {t("landing.preview.subtitle")}
          </p>
        </motion.div>

        {/* Tab cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {PREVIEW_TABS.map((key, i) => {
            const Icon = PREVIEW_TAB_ICONS[i];
            const accent = PREVIEW_ACCENTS[i];
            return (
              <motion.button
                key={key}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                onClick={() => setActive(i)}
                className={`group relative rounded-[6px] text-left p-7 md:p-9 overflow-hidden ${glassCard} hover:-translate-y-[2px]`}
              >
                <div className="relative z-10">
                  <div className="h-10 w-10 md:h-12 md:w-12 rounded-[4px] flex items-center justify-center mb-5 border border-white/[0.06]"
                    style={{ background: `${accent}10` }}>
                    <Icon className="h-5 w-5 md:h-6 md:w-6" style={{ color: accent }} />
                  </div>
                  <h3 className="text-sm md:text-base font-semibold text-white mb-2 tracking-wide">
                    {t(`landing.preview.tabs.${key}`)}
                  </h3>
                  <p className="text-[13px] text-[#9FB3D9]/50 leading-relaxed line-clamp-2">
                    {t(`landing.preview.cardHint.${key}`)}
                  </p>
                  <div className="mt-5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: accent }}>
                    <Eye className="h-3 w-3" />
                    <span>{t("landing.preview.clickToSee")}</span>
                  </div>
                </div>
                <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${accent}08, transparent 70%)` }} />
              </motion.button>
            );
          })}
        </div>

        {/* Demo overlay */}
        <AnimatePresence>
          {active !== null && (
            <motion.div
              key="demo-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-3 md:p-6 lg:p-10"
              onClick={(e) => { if (e.target === e.currentTarget) setActive(null); }}
            >
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

              {/* Window */}
              <div className="relative flex flex-col w-full h-full max-w-[1400px] max-h-[90vh] rounded-[6px] border border-white/[0.08] shadow-[0_0_80px_rgba(59,130,246,0.08),0_32px_64px_rgba(0,0,0,0.5)]"
                style={{ background: "var(--bg, #0F141E)" }}>
                {/* Gradient border glow (top edge) */}
                <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-[#3B82F6]/40 to-transparent" />

                {/* Top bar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02] rounded-t-[6px] shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="flex gap-1.5 mr-3">
                        <span className="w-3 h-3 rounded-full bg-[#FF5F57]/80" />
                        <span className="w-3 h-3 rounded-full bg-[#FEBC2E]/80" />
                        <span className="w-3 h-3 rounded-full bg-[#28C840]/80" />
                      </div>
                      {PREVIEW_TABS.map((key, i) => {
                        const Icon = PREVIEW_TAB_ICONS[i];
                        const accent = PREVIEW_ACCENTS[i];
                        return (
                          <button key={key} onClick={() => setActive(i)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-xs font-medium transition-all ${
                              active === i ? "bg-[#3B82F6]/10 text-white" : "text-[#9FB3D9]/50 hover:text-[#9FB3D9]/80 hover:bg-white/[0.03]"
                            }`}>
                            <Icon className="h-3.5 w-3.5" style={{ color: active === i ? accent : undefined }} />
                            <span className="hidden sm:inline">{t(`landing.preview.tabs.${key}`)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground/25 tracking-wide hidden md:block">app.haunted.trade — demo</span>
                    <button onClick={() => setActive(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-xs font-medium text-muted-foreground/50 hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
                      <X className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">ESC</span>
                    </button>
                  </div>
                </div>

                {/* Live component — scrollable content area */}
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-b-[6px]">
                  <DemoErrorBoundary key={active}>
                    <Suspense fallback={
                      <div className="flex items-center justify-center h-full gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
                        <span className="text-sm text-muted-foreground">Loading...</span>
                      </div>
                    }>
                      <DemoRenderer tab={PREVIEW_TABS[active]} />
                    </Suspense>
                  </DemoErrorBoundary>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  COMPARISON                                                     */
/* ════════════════════════════════════════════════════════════════ */
function Comparison() {
  const { t } = useI18n();
  const comparisonRows = Array.from({ length: 9 }, (_, i) => i);

  return (
    <section className={`relative py-28 px-6 ${sectionDivider}`}>
      <div className="max-w-5xl mx-auto">
        <motion.h2 variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className={`text-3xl md:text-5xl font-bold text-center ${gradientText} mb-16 tracking-tight`}>
          {t("landing.comparison.title")}
        </motion.h2>

        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="grid md:grid-cols-[1fr_auto_1fr] gap-6 items-start">
          {/* Others — muted, darker */}
          <div className="rounded-[6px] border border-white/[0.04] bg-[#070A12]/60 p-7 opacity-55">
            <h3 className="text-center text-[11px] font-bold text-[#9FB3D9]/50 uppercase tracking-[0.25em] mb-7">
              {t("landing.comparison.othersTitle")}
            </h3>
            <div className="flex flex-col gap-3.5">
              {comparisonRows.map((i) => (
                <div key={i} className="flex items-start gap-2.5 text-[13px] text-[#9FB3D9]/50 leading-relaxed">
                  <X className="h-3.5 w-3.5 text-[#1E3A8A]/50 flex-shrink-0 mt-0.5" />
                  <span>{t(`landing.comparison.others.${i}`)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* VS — square gradient badge with glow */}
          <div className="hidden md:flex items-center justify-center self-center">
            <div className="relative">
              <div className="absolute -inset-3 bg-[#3B82F6]/15 rounded-[4px] blur-xl" />
              <span className={`relative flex items-center justify-center w-14 h-14 rounded-[4px] ${glassBtnAccent} text-white text-[10px] font-bold uppercase tracking-[0.3em]`}>
                VS
              </span>
            </div>
          </div>

          {/* Haunted — active, brighter */}
          <div className={`relative rounded-[6px] p-7 ${glassCard} overflow-hidden`}>
            <div className="absolute inset-0 bg-gradient-to-b from-[#3B82F6]/[0.03] to-transparent pointer-events-none rounded-[6px]" />
            <h3 className={`relative text-center text-[11px] font-bold uppercase tracking-[0.25em] mb-7 ${gradientText}`}>
              {t("landing.comparison.hauntedTitle")}
            </h3>
            <div className="relative flex flex-col gap-3.5">
              {comparisonRows.map((i) => (
                <div key={i} className="flex items-start gap-2.5 text-[13px] text-white/90 leading-relaxed">
                  <Check className="h-3.5 w-3.5 text-[#22D3EE] flex-shrink-0 mt-0.5" />
                  <span>{t(`landing.comparison.haunted.${i}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  FREE BLOCK                                                     */
/* ════════════════════════════════════════════════════════════════ */
function FreeBlock() {
  const { t } = useI18n();
  const nav = useNavigate();
  const freeItems = Array.from({ length: 12 }, (_, i) => i);

  return (
    <section className={`relative py-28 px-6 overflow-hidden ${sectionDivider}`}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#3B82F6]/[0.03] rounded-full blur-[180px]" />

      <div className="relative max-w-4xl mx-auto text-center">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          {/* Price */}
          <div className="relative inline-block mb-5">
            <Sparkles className="absolute -top-4 -left-6 h-5 w-5 text-[#22D3EE]/30" />
            <Sparkles className="absolute -top-2 -right-6 h-4 w-4 text-[#3B82F6]/20" />
            <span className={`text-7xl md:text-9xl font-black ${gradientText} drop-shadow-[0_0_40px_rgba(59,130,246,0.1)]`}>
              $0
            </span>
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-[#3B82F6]/70 mb-3">{t("landing.free.forever")}</p>
          <p className="text-[#9FB3D9]/80 max-w-xl mx-auto mb-12 text-[15px] leading-relaxed">{t("landing.free.text")}</p>
        </motion.div>

        {/* Checklist */}
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-left mb-12 max-w-3xl mx-auto">
          {freeItems.map((i) => (
            <motion.div key={i} variants={fadeUp}
              className={`flex items-center gap-2.5 text-[13px] text-[#9FB3D9]/80 py-2.5 px-4 rounded-[4px] ${glassCard}`}>
              <Check className="h-3.5 w-3.5 text-[#22D3EE] flex-shrink-0" />
              <span>{t(`landing.free.items.${i}`)}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <p className="text-[#3B82F6] text-glow font-bold text-lg mb-10 tracking-wide">{t("landing.free.statement")}</p>
          <button onClick={() => nav("/register")}
            className={`inline-flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-[4px] ${glassBtnAccent} text-[15px]`}>
            {t("landing.free.cta")} <ChevronRight className="h-4 w-4" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  STATS                                                          */
/* ════════════════════════════════════════════════════════════════ */
function Stats() {
  const { t } = useI18n();

  return (
    <section className={`relative py-28 px-6 ${sectionDivider}`}>
      <div className="max-w-5xl mx-auto">
        <motion.h2 variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className={`text-3xl md:text-5xl font-bold text-center ${gradientText} mb-16 tracking-tight`}>
          {t("landing.stats.title")}
        </motion.h2>

        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {STATS.map((s, i) => {
            const Icon = s.icon;
            const iconStyle = { backgroundColor: `${s.color}0A`, border: `1px solid ${s.color}15` };
            return (
              <motion.div key={i} variants={fadeUp}
                className={`group flex flex-col items-center gap-4 p-6 rounded-[6px] text-center ${glassCard} hover:-translate-y-[2px]`}>
                <div className="flex items-center justify-center h-11 w-11 rounded-[4px]" style={iconStyle}>
                  <Icon className="h-5 w-5" style={{ color: s.color }} />
                </div>
                <span className="text-2xl font-bold text-white tracking-tight">{t(`landing.stats.items.${i}.value`)}</span>
                <span className="text-[13px] text-[#9FB3D9]/70">{t(`landing.stats.items.${i}.label`)}</span>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  FAQ                                                            */
/* ════════════════════════════════════════════════════════════════ */
function Faq() {
  const { t } = useI18n();
  const [openIdx, setOpenIdx] = useState(-1);
  const faqItems = Array.from({ length: 15 }, (_, i) => i);

  return (
    <section id="faq" className={`relative py-28 px-6 scroll-mt-16 ${sectionDivider}`}>
      <div className="max-w-3xl mx-auto">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="text-center mb-16">
          <span className={`inline-block text-[10px] font-bold uppercase tracking-[0.25em] text-[#3B82F6] px-4 py-1.5 rounded-[4px] mb-5 ${glassBtnAccent}`}>
            {t("landing.faq.badge")}
          </span>
          <h2 className={`text-3xl md:text-5xl font-bold ${gradientText} mb-5 tracking-tight`}>{t("landing.faq.title")}</h2>
          <p className="text-[#9FB3D9]/80 text-[15px] leading-relaxed">{t("landing.faq.subtitle")}</p>
        </motion.div>

        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="flex flex-col gap-3">
          {faqItems.map((i) => {
            const isOpen = openIdx === i;
            return (
              <motion.div key={i} variants={fadeUp}
                className={`rounded-[6px] backdrop-blur-xl overflow-hidden transition-all duration-300 ${isOpen ? "bg-white/[0.05] border border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.2)]" : "bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.08]"}`}>
                <button onClick={() => setOpenIdx(isOpen ? -1 : i)}
                  className="flex items-center justify-between w-full text-left px-6 py-[18px] gap-3">
                  <span className="text-[14px] font-medium text-white">{t(`landing.faq.items.${i}.q`)}</span>
                  <ChevronDown className={`h-4 w-4 text-[#9FB3D9]/60 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                      <div className="px-6 pb-5 text-[13px] text-[#9FB3D9]/80 leading-relaxed">
                        {t(`landing.faq.items.${i}.a`)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  FINAL CTA                                                      */
/* ════════════════════════════════════════════════════════════════ */
function FinalCta() {
  const { t } = useI18n();
  const nav = useNavigate();

  return (
    <section className={`relative py-32 px-6 overflow-hidden ${sectionDivider}`}>
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#3B82F6]/[0.02] to-transparent" />
      <div className="absolute top-1/2 left-1/4 w-72 h-72 bg-[#3B82F6]/[0.04] rounded-full blur-[120px]" />
      <div className="absolute top-1/2 right-1/4 w-64 h-64 bg-[#22D3EE]/[0.03] rounded-full blur-[120px]" />

      <div className="relative max-w-3xl mx-auto text-center flex flex-col items-center gap-7">
        <motion.h2 variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className={`text-3xl md:text-5xl font-bold ${gradientText} tracking-tight`}>
          {t("landing.cta.title")}
        </motion.h2>
        <motion.p variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="text-[#9FB3D9]/80 max-w-xl text-[15px] leading-relaxed">
          {t("landing.cta.subtitle")}
        </motion.p>
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <button onClick={() => nav("/register")}
            className={`inline-flex items-center gap-2.5 text-white font-semibold px-10 py-4 rounded-[4px] ${glassBtnAccent} text-lg`}>
            {t("landing.cta.button")} <ChevronRight className="h-5 w-5" />
          </button>
        </motion.div>
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <SocialLinks variant="pill" />
        </motion.div>
        <motion.p variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="text-[11px] text-[#9FB3D9]/30 tracking-wide">
          {t("landing.cta.footer")}
        </motion.p>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  FOOTER                                                         */
/* ════════════════════════════════════════════════════════════════ */
function Footer() {
  const { t } = useI18n();

  return (
    <footer className="relative border-t border-white/[0.05] bg-[#070A12]/90 pt-12 pb-8">
      {/* Decorative top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-[2px] bg-gradient-to-r from-transparent via-[#3B82F6]/30 to-transparent blur-sm" />

      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        {/* Main footer content */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
          {/* Left: Logo + brand */}
          <div className="flex flex-col items-center md:items-start gap-2.5">
            <div className="flex items-center gap-2.5">
              <img src={hauntedLogo} alt="Haunted" width={28} height={28} className="h-7 w-7" />
              <span className={`text-sm font-display font-bold tracking-[0.2em] uppercase ${gradientText}`}>HAUNTED</span>
            </div>
            <span className="text-[11px] text-[#9FB3D9]/40 tracking-wide">{t("landing.footer.powered")}</span>
          </div>
          {/* Center: Social links */}
          <SocialLinks variant="inline" />
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mb-5" />

        {/* Copyright */}
        <p className="text-center text-[11px] text-[#9FB3D9]/25 tracking-wide">{t("landing.footer.copyright")}</p>
      </div>
    </footer>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  LANDING PAGE                                                   */
/* ════════════════════════════════════════════════════════════════ */
export default function Landing() {
  return (
    <div className="landing-premium min-h-screen relative">
      {/* Global background layers */}
      <div className="landing-bg" />
      <div className="landing-noise" />

      <div className="relative z-10">
        <Navbar />
        <Hero />
        <DevBanner />
        <WhatIs />
        <Features />
        <AppPreview />
        <Comparison />
        <FreeBlock />
        <Stats />
        <Faq />
        <FinalCta />
        <Footer />
      </div>
    </div>
  );
}
