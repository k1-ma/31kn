import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function Terms() {
  const { t, lang } = useI18n();
  const updated = "2026-01-01";

  const uk = (
    <>
      <p>
        Користуючись Koshyk, ти погоджуєшся з цими умовами. Якщо ти не
        згоден — будь ласка, не користуйся сервісом.
      </p>
      <h2>Сервіс «як є»</h2>
      <p>
        Koshyk надається безкоштовно «як є», без жодних гарантій. Ми
        робимо все можливе для надійності, але можуть бути перерви або
        втрати даних. Регулярно роби експорт.
      </p>
      <h2>Твій акаунт</h2>
      <p>
        Ти відповідаєш за безпеку свого пароля. Не діли акаунт з іншими
        людьми. Якщо помітиш підозрілу активність — зміни пароль і
        зверниcя в підтримку.
      </p>
      <h2>Заборонене використання</h2>
      <ul>
        <li>Спам, скрапінг, автоматизовані запити в обхід rate-limit.</li>
        <li>Створення сотень акаунтів з однієї адреси.</li>
        <li>Спроби зламу або порушення цілісності сервісу.</li>
      </ul>
      <h2>Зміни умов</h2>
      <p>
        Ми можемо оновлювати ці умови. Суттєві зміни анонсуємо
        попередньо в самому застосунку.
      </p>
      <h2>Контакти</h2>
      <p>
        Запитання — на{" "}
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
        By using Koshyk you accept these terms. If you don't, please
        don't use the service.
      </p>
      <h2>Service "as is"</h2>
      <p>
        Koshyk is provided free of charge, "as is", with no warranty.
        We do our best to keep it reliable but downtime and data loss
        can happen. Export regularly.
      </p>
      <h2>Your account</h2>
      <p>
        You're responsible for keeping your password safe. Don't share
        your account. If you spot suspicious activity, rotate your
        password and contact support.
      </p>
      <h2>Forbidden use</h2>
      <ul>
        <li>Spam, scraping, automated requests bypassing rate limits.</li>
        <li>Creating dozens of accounts from one address.</li>
        <li>Attempts to break or destabilize the service.</li>
      </ul>
      <h2>Changes</h2>
      <p>
        We may update these terms. Material changes will be announced
        in-app first.
      </p>
      <h2>Contact</h2>
      <p>
        Questions —{" "}
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
          {t("legal.termsTitle")}
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
