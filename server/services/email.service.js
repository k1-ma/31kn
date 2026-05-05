import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const IS_PROD = process.env.NODE_ENV === "production";
const VERCEL_ENV = process.env.VERCEL_ENV;

function isVercelPreviewUrl(url) {
  if (!url) return false;
  const vercelMatch = url.match(/^https?:\/\/([a-z0-9-]+)\.vercel\.app/i);
  if (!vercelMatch) return false;
  const subdomain = vercelMatch[1];
  if (/-git-/i.test(subdomain)) return true;
  for (const segment of subdomain.split("-")) {
    if (segment.length >= 6 && /[a-z]/i.test(segment) && /[0-9]/.test(segment)) return true;
  }
  return false;
}

function getAppUrl() {
  const url = process.env.APP_URL;
  const isVercelProduction = VERCEL_ENV === "production";
  const isProduction = IS_PROD || isVercelProduction;
  if (isProduction && !url) {
    throw new Error("APP_URL environment variable is required in production.");
  }
  const baseUrl = url || "http://localhost:5173";
  if (isVercelPreviewUrl(baseUrl)) {
    throw new Error("APP_URL is set to a Vercel preview URL which will break email links.");
  }
  return baseUrl.replace(/\/+$/, "");
}

let resendClient = null;
function getResend() {
  if (!RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(RESEND_API_KEY);
  return resendClient;
}

export function isEmailServiceEnabled() {
  return !!RESEND_API_KEY && !!EMAIL_FROM;
}

function escHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getFrontendUrl() {
  return getAppUrl();
}

const STYLES = `
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F7F8FA; color: #0F172A; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 32px 20px; }
  .card { background: #FFFFFF; border-radius: 24px; padding: 36px 28px; box-shadow: 0 6px 24px rgba(15, 23, 42, 0.06); }
  .brand { text-align: center; font-size: 22px; font-weight: 800; letter-spacing: 0.5px; color: #10B981; margin-bottom: 8px; }
  .tagline { text-align: center; font-size: 12px; color: #64748B; margin-bottom: 28px; letter-spacing: 1px; text-transform: uppercase; }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 16px 0; color: #0F172A; }
  p { color: #334155; line-height: 1.7; margin: 0 0 14px 0; font-size: 15px; }
  .btn { display: inline-block; background: #10B981; color: #FFFFFF !important; text-decoration: none; padding: 14px 28px; border-radius: 14px; font-weight: 700; font-size: 15px; }
  .btn-wrap { text-align: center; margin: 28px 0; }
  .info { background: #ECFDF5; border-left: 4px solid #10B981; padding: 14px 18px; border-radius: 12px; color: #065F46; font-size: 13px; margin: 18px 0; }
  .warn { background: #FEF2F2; border-left: 4px solid #EF4444; padding: 14px 18px; border-radius: 12px; color: #991B1B; font-size: 13px; margin: 18px 0; }
  .fallback { word-break: break-all; color: #64748B; font-size: 12px; padding: 12px; background: #F1F5F9; border-radius: 10px; margin-top: 16px; }
  .footer { text-align: center; margin-top: 24px; color: #94A3B8; font-size: 12px; }
`;

function wrapEmailHtml(content) {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Koshyk</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="brand">Koshyk</div>
      <div class="tagline">Особистий фінансовий трекер</div>
      ${content}
    </div>
    <div class="footer">© ${new Date().getFullYear()} Koshyk · Це автоматичне повідомлення</div>
  </div>
</body>
</html>`;
}

export async function sendVerificationEmail(to, token, username) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not configured, skipping verification email");
    return { skipped: true };
  }
  const verifyUrl = `${getAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const html = wrapEmailHtml(`
    <h1>Підтверди email</h1>
    <p>Привіт${username ? `, <strong>${escHtml(username)}</strong>` : ""}! Дякуємо за реєстрацію в Koshyk.</p>
    <p>Натисни кнопку, щоб активувати акаунт:</p>
    <div class="btn-wrap"><a href="${verifyUrl}" class="btn">Підтвердити email</a></div>
    <div class="info">⏰ Посилання діє 24 години. Якщо ти не реєструвався — просто проігноруй цей лист.</div>
    <p class="fallback">Не працює кнопка? Скопіюй посилання:<br>${verifyUrl}</p>
  `);
  try {
    const result = await resend.emails.send({ from: EMAIL_FROM, to, subject: "Підтверди email — Koshyk", html });
    return { sent: true, id: result?.data?.id };
  } catch (error) {
    return { error: error?.message || "Failed to send email" };
  }
}

export async function sendPasswordResetEmail(to, token, username) {
  const resend = getResend();
  if (!resend) return { skipped: true };
  const resetUrl = `${getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const html = wrapEmailHtml(`
    <h1>Новий пароль</h1>
    <p>Привіт${username ? `, <strong>${escHtml(username)}</strong>` : ""}!</p>
    <p>Ми отримали запит на скидання пароля для твого акаунта в Koshyk.</p>
    <div class="btn-wrap"><a href="${resetUrl}" class="btn">Скинути пароль</a></div>
    <div class="warn">Якщо ти не запитував — проігноруй цей лист, твій пароль залишиться без змін.</div>
    <div class="info">⏰ Посилання діє 1 годину. Після скидання всі активні сесії будуть закриті.</div>
    <p class="fallback">Не працює кнопка?<br>${resetUrl}</p>
  `);
  try {
    const result = await resend.emails.send({ from: EMAIL_FROM, to, subject: "Скидання пароля — Koshyk", html });
    return { sent: true, id: result?.data?.id };
  } catch (error) {
    return { error: error?.message || "Failed to send email" };
  }
}

export async function sendPasswordChangedEmail(to, username, options = {}) {
  const resend = getResend();
  if (!resend) return { skipped: true };
  const { ip, ua, isReset = false } = options;
  const action = isReset ? "скинуто" : "змінено";
  const now = new Date().toISOString();
  const html = wrapEmailHtml(`
    <h1>Пароль ${action}</h1>
    <p>Привіт${username ? `, <strong>${escHtml(username)}</strong>` : ""}!</p>
    <p>Твій пароль у Koshyk було ${action}.</p>
    <div class="info">
      📅 Час: ${now}<br>
      ${ip ? `🌐 IP: ${escHtml(ip)}<br>` : ""}
      ${ua ? `💻 Пристрій: ${escHtml(String(ua).slice(0, 80))}` : ""}
    </div>
    <div class="warn">Це був не ти? Негайно зміни пароль і звернися до підтримки.</div>
  `);
  try {
    const result = await resend.emails.send({ from: EMAIL_FROM, to, subject: `Пароль ${action} — Koshyk`, html });
    return { sent: true, id: result?.data?.id };
  } catch (error) {
    return { error: error?.message || "Failed to send email" };
  }
}

export async function sendEmailChangeConfirmation(to, token, username) {
  const resend = getResend();
  if (!resend) return { skipped: true };
  const confirmUrl = `${getAppUrl()}/confirm-email-change?token=${encodeURIComponent(token)}`;
  const html = wrapEmailHtml(`
    <h1>Підтверди новий email</h1>
    <p>Привіт${username ? `, <strong>${escHtml(username)}</strong>` : ""}!</p>
    <p>Ти запитав зміну email-адреси в Koshyk. Новий адрес: <strong>${escHtml(to)}</strong></p>
    <div class="btn-wrap"><a href="${confirmUrl}" class="btn">Підтвердити новий email</a></div>
    <div class="info">⏰ Посилання діє 24 години.</div>
    <p class="fallback">Не працює кнопка?<br>${confirmUrl}</p>
  `);
  try {
    const result = await resend.emails.send({ from: EMAIL_FROM, to, subject: "Підтверди новий email — Koshyk", html });
    return { sent: true, id: result?.data?.id };
  } catch (error) {
    return { error: error?.message || "Failed to send email" };
  }
}

export async function sendEmailChangeNotification(to, newEmail, username) {
  const resend = getResend();
  if (!resend) return { skipped: true };
  const masked = String(newEmail).replace(/^(.{2})(.*)(@.*)$/, (_, s, m, d) => s + "*".repeat(Math.min(m.length, 5)) + d);
  const html = wrapEmailHtml(`
    <h1>Запит на зміну email</h1>
    <p>Привіт${username ? `, <strong>${escHtml(username)}</strong>` : ""}!</p>
    <p>Отримано запит на зміну email-адреси твого акаунта в Koshyk.</p>
    <div class="info">📧 Новий адрес: ${masked}</div>
    <div class="warn">Це був не ти? Негайно увійди в акаунт і зміни пароль.</div>
  `);
  try {
    const result = await resend.emails.send({ from: EMAIL_FROM, to, subject: "Запит на зміну email — Koshyk", html });
    return { sent: true, id: result?.data?.id };
  } catch (error) {
    return { error: error?.message || "Failed to send email" };
  }
}

export async function sendEmailChangedNotification(to, newEmail, username) {
  const resend = getResend();
  if (!resend) return { skipped: true };
  const html = wrapEmailHtml(`
    <h1>Email змінено</h1>
    <p>Привіт${username ? `, <strong>${escHtml(username)}</strong>` : ""}!</p>
    <p>Email-адресу твого акаунта в Koshyk успішно змінено на <strong>${escHtml(newEmail)}</strong>.</p>
    <div class="warn">Це був не ти? Негайно зв'яжися з підтримкою.</div>
  `);
  try {
    const result = await resend.emails.send({ from: EMAIL_FROM, to, subject: "Email змінено — Koshyk", html });
    return { sent: true, id: result?.data?.id };
  } catch (error) {
    return { error: error?.message || "Failed to send email" };
  }
}
