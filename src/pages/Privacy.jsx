import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function Privacy() {
  const { t, lang } = useI18n();
  const updated = "2026-01-01";

  const uk = (
    <>
      <p>
        Koshyk — це особистий фінансовий трекер. Ми поважаємо твою приватність
        і збираємо мінімум даних, потрібних для роботи сервісу.
      </p>
      <h2>Які дані ми зберігаємо</h2>
      <ul>
        <li>
          <strong>Email</strong> — для входу й відновлення доступу.
        </li>
        <li>
          <strong>Гаманці, категорії, транзакції, бюджети, цілі</strong> —
          основна частина зберігається у твоєму браузері (IndexedDB), копія
          синхронізується на наш сервер для відновлення на іншому пристрої.
        </li>
        <li>
          <strong>Сесії</strong> — ми зберігаємо ID сесії, IP, user-agent
          для безпеки (виявлення підозрілих входів).
        </li>
      </ul>
      <h2>Що ми НЕ робимо</h2>
      <ul>
        <li>Не показуємо рекламу.</li>
        <li>Не передаємо твої дані третім сторонам.</li>
        <li>Не використовуємо аналітику з трекерами.</li>
      </ul>
      <h2>Видалення акаунта</h2>
      <p>
        У будь-який момент у Налаштуваннях натисни «Видалити акаунт».
        Це видалить усі твої дані з нашої БД назавжди — каскадно через
        ON DELETE CASCADE на всі повʼязані таблиці. Перед цим зроби
        експорт у JSON чи CSV, якщо хочеш зберегти бекап.
      </p>
      <h2>Контакти</h2>
      <p>
        Питання щодо приватності — пиши на{" "}
        <a className="text-emerald-600" href="mailto:hello@koshyk.app">
          hello@koshyk.app
        </a>
        .
      </p>
    </>
  );

  const en = (
    <>
      <p>
        Koshyk is a personal finance tracker. We respect your privacy and
        collect the minimum data required to run the service.
      </p>
      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Email</strong> — for sign-in and password recovery.
        </li>
        <li>
          <strong>Wallets, categories, transactions, budgets, goals</strong> —
          the primary store is your browser (IndexedDB); a copy is mirrored
          to our server so you can restore on another device.
        </li>
        <li>
          <strong>Sessions</strong> — session ID, IP, user-agent for security
          (suspicious-login detection).
        </li>
      </ul>
      <h2>What we DON'T do</h2>
      <ul>
        <li>No ads.</li>
        <li>No data sharing with third parties.</li>
        <li>No tracking analytics.</li>
      </ul>
      <h2>Account deletion</h2>
      <p>
        At any time, in Settings, tap "Delete account". This permanently
        deletes all your data from our database via ON DELETE CASCADE. Take
        a JSON or CSV export first if you want a backup.
      </p>
      <h2>Contact</h2>
      <p>
        Privacy questions — email{" "}
        <a className="text-emerald-600" href="mailto:hello@koshyk.app">
          hello@koshyk.app
        </a>
        .
      </p>
    </>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <header className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
        <Link to="/" className="text-emerald-600 font-bold text-xl">
          Koshyk
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="max-w-3xl mx-auto px-5 pb-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-emerald-600 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> {t("common.back")}
        </Link>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100">
          {t("legal.privacyTitle")}
        </h1>
        <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {t("legal.updated")}: {updated}
        </div>
        <article className="prose-custom mt-8 space-y-4 text-slate-700 dark:text-slate-300 leading-relaxed">
          {lang === "uk" ? uk : en}
        </article>
      </main>
    </div>
  );
}
