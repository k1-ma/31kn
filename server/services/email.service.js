import { Resend } from "resend";

// Resend configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const IS_PROD = process.env.NODE_ENV === "production";
// Vercel provides VERCEL_ENV: "production" | "preview" | "development"
const VERCEL_ENV = process.env.VERCEL_ENV;

/**
 * Check if a URL looks like a Vercel preview/auto-generated deployment URL.
 * 
 * Vercel auto-generates URLs in various formats:
 * - Preview: project-hash-team.vercel.app (hash contains letters+numbers like "80uvmajol")
 * - Branch: project-git-branch-team.vercel.app  
 * - Complex: my-app-git-feature-branch-team.vercel.app
 * 
 * A custom domain or simple project.vercel.app (without hash) should be considered safe.
 * 
 * @param {string} url
 * @returns {boolean}
 */
function isVercelPreviewUrl(url) {
  if (!url) return false;
  
  // Check if it's a vercel.app domain
  const vercelMatch = url.match(/^https?:\/\/([a-z0-9-]+)\.vercel\.app/i);
  if (!vercelMatch) return false;
  
  const subdomain = vercelMatch[1];
  
  // Git branch deployments always contain '-git-'
  if (/-git-/i.test(subdomain)) {
    return true;
  }
  
  // Preview URLs have hash segments that look like: -abc123xyz- or -80uvmajol-
  // These are random alphanumeric strings that contain BOTH letters AND numbers
  // This distinguishes them from project names like "my-project" or "trade-journal"
  const segments = subdomain.split('-');
  
  for (const segment of segments) {
    // A hash-like segment has 6+ chars, contains both letters and numbers
    if (segment.length >= 6 && /[a-z]/i.test(segment) && /[0-9]/.test(segment)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get APP_URL for email links with trailing slash normalization.
 * In production, APP_URL must be set explicitly.
 * In development, defaults to localhost.
 * 
 * IMPORTANT: Never use Vercel preview URLs for email links!
 * Always set APP_URL to your production domain in Vercel Environment Variables.
 * 
 * @returns {string}
 */
function getAppUrl() {
  const url = process.env.APP_URL;
  
  // Production detection logic:
  // - NODE_ENV=production is set by most hosting providers
  // - VERCEL_ENV=production is Vercel-specific (can be "production", "preview", or "development")
  // We treat as production if EITHER is true, ensuring strictness on Vercel even if NODE_ENV is inconsistent
  const isVercelProduction = VERCEL_ENV === "production";
  const isProduction = IS_PROD || isVercelProduction;
  
  if (isProduction && !url) {
    throw new Error(
      "APP_URL environment variable is required in production. " +
      "Set APP_URL to your production domain (e.g., https://hauntedx.trade) in Vercel Environment Variables."
    );
  }
  
  // Default to localhost in development
  const baseUrl = url || "http://localhost:5173";
  
  // CRITICAL: Never use Vercel preview URLs for email links!
  // Preview URLs change per deployment and will break email verification.
  if (isVercelPreviewUrl(baseUrl)) {
    throw new Error(
      "APP_URL is set to a Vercel preview URL which will break email links. " +
      "Set APP_URL to your production domain (e.g., https://hauntedx.trade) in Vercel Environment Variables. " +
      "Do NOT use VERCEL_URL for APP_URL as it changes per deployment."
    );
  }
  
  // Normalize: remove trailing slash
  return baseUrl.replace(/\/+$/, "");
}

// Initialize Resend client (lazy initialization)
let resendClient = null;

function getResend() {
  if (!RESEND_API_KEY) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Check if email service is configured
 * @returns {boolean}
 */
export function isEmailServiceEnabled() {
  return !!RESEND_API_KEY && !!EMAIL_FROM;
}

/**
 * Get frontend URL for email links
 * @returns {string}
 */
export function getFrontendUrl() {
  return getAppUrl();
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATES - Haunted style (Premium Cold Blue Theme)
// ─────────────────────────────────────────────────────────────────────────────

const HAUNTED_STYLES = `
  body { 
    margin: 0; 
    padding: 0; 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background-color: #0a0a0f;
    background: linear-gradient(180deg, #0a0a0f 0%, #0d0d14 50%, #0a0a0f 100%);
    color: #e4e4e7;
    min-height: 100vh;
  }
  .outer-container {
    background-color: #0a0a0f;
    background: linear-gradient(180deg, #0a0a0f 0%, #0d0d14 100%);
    padding: 20px;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    padding: 40px 20px;
  }
  .glow-orb {
    position: absolute;
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
    border-radius: 50%;
    filter: blur(60px);
    z-index: 0;
  }
  .card {
    position: relative;
    background-color: #18181b;
    background: linear-gradient(145deg, #18181b 0%, #1a1a22 50%, #16161d 100%);
    border: 2px solid rgba(59, 130, 246, 0.25);
    border-radius: 24px;
    padding: 40px 32px;
    box-shadow: 
      0 0 60px rgba(59, 130, 246, 0.12),
      0 25px 50px -12px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
  }
  .logo {
    text-align: center;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid rgba(59, 130, 246, 0.15);
  }
  .logo-img {
    width: 80px;
    height: auto;
    margin-bottom: 12px;
  }
  .logo-text {
    font-size: 32px;
    font-weight: 800;
    background: linear-gradient(135deg, #60A5FA 0%, #3B82F6 50%, #4F46E5 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: 4px;
    text-transform: uppercase;
    text-shadow: 0 0 40px rgba(59, 130, 246, 0.5);
  }
  .logo-subtitle {
    display: block;
    font-size: 11px;
    letter-spacing: 3px;
    color: #71717a;
    margin-top: 8px;
    text-transform: uppercase;
  }
  h1 {
    color: #f4f4f5;
    font-size: 22px;
    font-weight: 700;
    margin: 0 0 20px 0;
    text-align: center;
    letter-spacing: 0.5px;
  }
  p {
    color: #a1a1aa;
    line-height: 1.7;
    margin: 0 0 16px 0;
    font-size: 14px;
  }
  .highlight {
    color: #60A5FA;
    font-weight: 600;
  }
  .btn {
    display: inline-block;
    background-color: #3B82F6;
    background: linear-gradient(135deg, #3B82F6 0%, #4F46E5 50%, #6366F1 100%);
    color: #ffffff !important;
    text-decoration: none;
    padding: 16px 40px;
    border-radius: 14px;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 1px;
    text-align: center;
    text-transform: uppercase;
    box-shadow: 
      0 8px 25px rgba(59, 130, 246, 0.35),
      0 4px 10px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    transition: all 0.3s ease;
  }
  .btn:hover {
    box-shadow: 
      0 12px 35px rgba(59, 130, 246, 0.45),
      0 6px 15px rgba(0, 0, 0, 0.4);
    transform: translateY(-2px);
  }
  .btn-container {
    text-align: center;
    margin: 32px 0;
  }
  .code {
    background-color: #1f1f28;
    background: linear-gradient(135deg, #1f1f28 0%, #27272a 100%);
    border: 2px solid rgba(59, 130, 246, 0.3);
    border-radius: 12px;
    padding: 20px 28px;
    font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
    font-size: 32px;
    letter-spacing: 10px;
    text-align: center;
    color: #60A5FA;
    margin: 28px 0;
    box-shadow: 
      0 4px 20px rgba(59, 130, 246, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  .warning {
    background-color: #1c1517;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%);
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-left: 4px solid #ef4444;
    border-radius: 12px;
    padding: 16px 20px;
    color: #fca5a5;
    font-size: 13px;
    margin: 20px 0;
    line-height: 1.6;
  }
  .info {
    background-color: #151a1f;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%);
    border: 1px solid rgba(59, 130, 246, 0.35);
    border-left: 4px solid #3B82F6;
    border-radius: 12px;
    padding: 16px 20px;
    color: #93c5fd;
    font-size: 13px;
    margin: 20px 0;
    line-height: 1.6;
  }
  .divider {
    height: 1px;
    background-color: rgba(59, 130, 246, 0.3);
    background: linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.3) 50%, transparent 100%);
    margin: 28px 0;
  }
  .footer {
    text-align: center;
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid rgba(59, 130, 246, 0.1);
    color: #71717a;
    font-size: 11px;
    letter-spacing: 0.5px;
  }
  .footer a {
    color: #60A5FA;
    text-decoration: none;
  }
  .link-fallback {
    word-break: break-all;
    color: #71717a;
    font-size: 11px;
    margin-top: 12px;
    padding: 12px;
    background-color: #0f0f14;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
  }
`;

/**
 * Get the URL for the Haunted logo image.
 * The logo must be available at `/haunted-email-logo.png` relative to APP_URL
 * for the email templates to render correctly.
 * @returns {string} Full URL to the haunted logo image
 */
function getLogoUrl() {
  return `${getAppUrl()}/haunted-email-logo.png`;
}

function wrapEmailHtml(content) {
  const logoUrl = getLogoUrl();
  return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Haunted TradeJ</title>
  <style>${HAUNTED_STYLES}</style>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f;">
  <div class="outer-container" style="background-color: #0a0a0f;">
    <div class="container">
      <div class="card" style="background-color: #18181b;">
        <div class="logo">
          <img src="${logoUrl}" alt="Haunted" class="logo-img" style="width: 80px; height: auto; display: block; margin: 0 auto 12px auto;">
          <span class="logo-text" style="color: #3B82F6;">HAUNTED</span>
          <span class="logo-subtitle" style="color: #71717a;">Trading Journal</span>
        </div>
        ${content}
        <div class="divider" style="background-color: rgba(59, 130, 246, 0.3);"></div>
        <div class="footer" style="color: #71717a;">
          © ${new Date().getFullYear()} Haunted TradeJ — Ваш персональный торговый журнал<br>
          <span style="color: #52525b;">Это автоматическое сообщение, не отвечайте на него.</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL SENDING FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send email verification link
 * @param {string} to - Recipient email
 * @param {string} token - Verification token
 * @param {string} username - User's username
 */
export async function sendVerificationEmail(to, token, username) {
  const resend = getResend();
  if (!resend) {
    // eslint-disable-next-line no-console
    console.warn("[email] RESEND_API_KEY not configured, skipping verification email");
    return { skipped: true };
  }

  const verifyUrl = `${getAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  const html = wrapEmailHtml(`
    <h1 style="color: #f4f4f5; font-size: 22px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">Подтвердите ваш email</h1>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Привет${username ? `, <span class="highlight" style="color: #60A5FA; font-weight: 600;">${username}</span>` : ""}! 👋</p>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Спасибо за регистрацию в <strong style="color: #e4e4e7;">Haunted TradeJ</strong> — вашем персональном торговом журнале.</p>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Пожалуйста, подтвердите ваш email адрес, чтобы активировать аккаунт:</p>
    <div class="btn-container" style="text-align: center; margin: 32px 0;">
      <a href="${verifyUrl}" class="btn" style="display: inline-block; background-color: #3B82F6; color: #ffffff !important; text-decoration: none; padding: 16px 40px; border-radius: 14px; font-weight: 700; font-size: 14px;">✓ Подтвердить email</a>
    </div>
    <div class="info" style="background-color: #151a1f; border: 1px solid rgba(59, 130, 246, 0.35); border-left: 4px solid #3B82F6; border-radius: 12px; padding: 16px 20px; color: #93c5fd; font-size: 13px; margin: 20px 0;">
      ⏰ Ссылка действительна <strong>24 часа</strong>.<br>
      Если вы не регистрировались в Haunted TradeJ, просто проигнорируйте это письмо.
    </div>
    <p class="link-fallback" style="color: #71717a; background-color: #0f0f14; font-size: 11px; padding: 12px; border-radius: 8px; word-break: break-all;">Не работает кнопка? Скопируйте ссылку:<br>${verifyUrl}</p>
  `);

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: "✉️ Подтвердите ваш email — Haunted TradeJ",
      html,
    });
    // eslint-disable-next-line no-console
    console.log("[email] Verification email sent to:", to, "id:", result?.data?.id);
    return { sent: true, id: result?.data?.id };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[email] Failed to send verification email:", error?.message || error);
    return { error: error?.message || "Failed to send email" };
  }
}

/**
 * Send password reset link
 * @param {string} to - Recipient email
 * @param {string} token - Reset token
 * @param {string} username - User's username
 */
export async function sendPasswordResetEmail(to, token, username) {
  const resend = getResend();
  if (!resend) {
    // eslint-disable-next-line no-console
    console.warn("[email] RESEND_API_KEY not configured, skipping password reset email");
    return { skipped: true };
  }

  const resetUrl = `${getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  const html = wrapEmailHtml(`
    <h1 style="color: #f4f4f5; font-size: 22px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">Сброс пароля</h1>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Привет${username ? `, <span class="highlight" style="color: #60A5FA; font-weight: 600;">${username}</span>` : ""}!</p>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Мы получили запрос на сброс пароля вашего аккаунта в <strong style="color: #e4e4e7;">Haunted TradeJ</strong>.</p>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Нажмите на кнопку ниже, чтобы установить новый пароль:</p>
    <div class="btn-container" style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}" class="btn" style="display: inline-block; background-color: #3B82F6; color: #ffffff !important; text-decoration: none; padding: 16px 40px; border-radius: 14px; font-weight: 700; font-size: 14px;">🔑 Сбросить пароль</a>
    </div>
    <div class="warning" style="background-color: #1c1517; border: 1px solid rgba(239, 68, 68, 0.35); border-left: 4px solid #ef4444; border-radius: 12px; padding: 16px 20px; color: #fca5a5; font-size: 13px; margin: 20px 0;">
      ⚠️ <strong>Важно!</strong> Если вы не запрашивали сброс пароля, проигнорируйте это письмо — ваш пароль останется прежним.
    </div>
    <div class="info" style="background-color: #151a1f; border: 1px solid rgba(59, 130, 246, 0.35); border-left: 4px solid #3B82F6; border-radius: 12px; padding: 16px 20px; color: #93c5fd; font-size: 13px; margin: 20px 0;">
      ⏰ Ссылка действительна <strong>1 час</strong>.<br>
      🔒 После сброса пароля все активные сессии будут автоматически завершены для вашей безопасности.
    </div>
    <p class="link-fallback" style="color: #71717a; background-color: #0f0f14; font-size: 11px; padding: 12px; border-radius: 8px; word-break: break-all;">Не работает кнопка? Скопируйте ссылку:<br>${resetUrl}</p>
  `);

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: "🔐 Сброс пароля — Haunted TradeJ",
      html,
    });
    // eslint-disable-next-line no-console
    console.log("[email] Password reset email sent to:", to, "id:", result?.data?.id);
    return { sent: true, id: result?.data?.id };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[email] Failed to send password reset email:", error?.message || error);
    return { error: error?.message || "Failed to send email" };
  }
}

/**
 * Send security notification about password change
 * @param {string} to - Recipient email
 * @param {string} username - User's username
 * @param {object} options - Options { ip, ua, isReset }
 */
export async function sendPasswordChangedEmail(to, username, options = {}) {
  const resend = getResend();
  if (!resend) {
    // eslint-disable-next-line no-console
    console.warn("[email] RESEND_API_KEY not configured, skipping password changed email");
    return { skipped: true };
  }

  const { ip, ua, isReset = false } = options;
  const actionText = isReset ? "сброшен" : "изменён";
  const now = new Date().toLocaleString("ru-RU", { timeZone: "UTC" });

  const html = wrapEmailHtml(`
    <h1 style="color: #f4f4f5; font-size: 22px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">Пароль ${actionText}</h1>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Привет${username ? `, <span class="highlight" style="color: #60A5FA; font-weight: 600;">${username}</span>` : ""}!</p>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Ваш пароль в <strong style="color: #e4e4e7;">Haunted TradeJ</strong> был успешно ${actionText}.</p>
    <div class="info" style="background-color: #151a1f; border: 1px solid rgba(59, 130, 246, 0.35); border-left: 4px solid #3B82F6; border-radius: 12px; padding: 16px 20px; color: #93c5fd; font-size: 13px; margin: 20px 0;">
      <strong>📋 Детали операции:</strong><br><br>
      📅 <strong>Время:</strong> ${now} UTC<br>
      ${ip ? `🌐 <strong>IP адрес:</strong> ${ip}<br>` : ""}
      ${ua ? `💻 <strong>Устройство:</strong> ${ua.slice(0, 80)}${ua.length > 80 ? "..." : ""}<br>` : ""}
    </div>
    <div class="warning" style="background-color: #1c1517; border: 1px solid rgba(239, 68, 68, 0.35); border-left: 4px solid #ef4444; border-radius: 12px; padding: 16px 20px; color: #fca5a5; font-size: 13px; margin: 20px 0;">
      ⚠️ <strong>Это были не вы?</strong><br>
      Немедленно свяжитесь с поддержкой и смените пароль! Возможно, ваш аккаунт был скомпрометирован.
    </div>
  `);

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `🛡️ Пароль ${actionText} — Haunted TradeJ`,
      html,
    });
    // eslint-disable-next-line no-console
    console.log("[email] Password changed notification sent to:", to, "id:", result?.data?.id);
    return { sent: true, id: result?.data?.id };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[email] Failed to send password changed email:", error?.message || error);
    return { error: error?.message || "Failed to send email" };
  }
}

/**
 * Send email change confirmation to the NEW email address
 * @param {string} to - New email address
 * @param {string} token - Confirmation token
 * @param {string} username - User's username
 */
export async function sendEmailChangeConfirmation(to, token, username) {
  const resend = getResend();
  if (!resend) {
    // eslint-disable-next-line no-console
    console.warn("[email] RESEND_API_KEY not configured, skipping email change confirmation");
    return { skipped: true };
  }

  const confirmUrl = `${getAppUrl()}/confirm-email-change?token=${encodeURIComponent(token)}`;

  const html = wrapEmailHtml(`
    <h1 style="color: #f4f4f5; font-size: 22px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">Подтвердите новый email</h1>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Привет${username ? `, <span class="highlight" style="color: #60A5FA; font-weight: 600;">${username}</span>` : ""}!</p>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Вы запросили смену email адреса в <strong style="color: #e4e4e7;">Haunted TradeJ</strong>.</p>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Новый адрес: <span class="highlight" style="color: #60A5FA; font-weight: 600;">${to}</span></p>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Подтвердите этот адрес, нажав на кнопку ниже:</p>
    <div class="btn-container" style="text-align: center; margin: 32px 0;">
      <a href="${confirmUrl}" class="btn" style="display: inline-block; background-color: #3B82F6; color: #ffffff !important; text-decoration: none; padding: 16px 40px; border-radius: 14px; font-weight: 700; font-size: 14px;">✓ Подтвердить новый email</a>
    </div>
    <div class="info" style="background-color: #151a1f; border: 1px solid rgba(59, 130, 246, 0.35); border-left: 4px solid #3B82F6; border-radius: 12px; padding: 16px 20px; color: #93c5fd; font-size: 13px; margin: 20px 0;">
      ⏰ Ссылка действительна <strong>24 часа</strong>.<br>
      📧 После подтверждения этот email станет основным для вашего аккаунта.
    </div>
    <p class="link-fallback" style="color: #71717a; background-color: #0f0f14; font-size: 11px; padding: 12px; border-radius: 8px; word-break: break-all;">Не работает кнопка? Скопируйте ссылку:<br>${confirmUrl}</p>
  `);

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: "📧 Подтвердите новый email — Haunted TradeJ",
      html,
    });
    // eslint-disable-next-line no-console
    console.log("[email] Email change confirmation sent to:", to, "id:", result?.data?.id);
    return { sent: true, id: result?.data?.id };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[email] Failed to send email change confirmation:", error?.message || error);
    return { error: error?.message || "Failed to send email" };
  }
}

/**
 * Send notification to OLD email about email change request
 * @param {string} to - Old email address
 * @param {string} newEmail - New email address (masked)
 * @param {string} username - User's username
 */
export async function sendEmailChangeNotification(to, newEmail, username) {
  const resend = getResend();
  if (!resend) {
    // eslint-disable-next-line no-console
    console.warn("[email] RESEND_API_KEY not configured, skipping email change notification");
    return { skipped: true };
  }

  // Mask the new email for privacy
  const maskedEmail = newEmail.replace(/^(.{2})(.*)(@.*)$/, (_, start, middle, domain) => 
    start + "*".repeat(Math.min(middle.length, 5)) + domain
  );

  const now = new Date().toLocaleString("ru-RU", { timeZone: "UTC" });

  const html = wrapEmailHtml(`
    <h1 style="color: #f4f4f5; font-size: 22px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">Запрос на смену email</h1>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Привет${username ? `, <span class="highlight" style="color: #60A5FA; font-weight: 600;">${username}</span>` : ""}!</p>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Был получен запрос на смену email адреса вашего аккаунта в <strong style="color: #e4e4e7;">Haunted TradeJ</strong>.</p>
    <div class="info" style="background-color: #151a1f; border: 1px solid rgba(59, 130, 246, 0.35); border-left: 4px solid #3B82F6; border-radius: 12px; padding: 16px 20px; color: #93c5fd; font-size: 13px; margin: 20px 0;">
      <strong>📋 Детали запроса:</strong><br><br>
      📅 <strong>Время:</strong> ${now} UTC<br>
      📧 <strong>Новый адрес:</strong> ${maskedEmail}
    </div>
    <div class="warning" style="background-color: #1c1517; border: 1px solid rgba(239, 68, 68, 0.35); border-left: 4px solid #ef4444; border-radius: 12px; padding: 16px 20px; color: #fca5a5; font-size: 13px; margin: 20px 0;">
      ⚠️ <strong>Это были не вы?</strong><br>
      Немедленно войдите в аккаунт и смените пароль! Возможно, кто-то получил доступ к вашей учётной записи.
    </div>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Пока новый email не будет подтверждён, ваш текущий адрес остаётся активным.</p>
  `);

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: "🔔 Запрос на смену email — Haunted TradeJ",
      html,
    });
    // eslint-disable-next-line no-console
    console.log("[email] Email change notification sent to old email:", to, "id:", result?.data?.id);
    return { sent: true, id: result?.data?.id };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[email] Failed to send email change notification:", error?.message || error);
    return { error: error?.message || "Failed to send email" };
  }
}

/**
 * Send notification after email was successfully changed
 * @param {string} to - Old email address
 * @param {string} newEmail - New email address
 * @param {string} username - User's username
 */
export async function sendEmailChangedNotification(to, newEmail, username) {
  const resend = getResend();
  if (!resend) {
    // eslint-disable-next-line no-console
    console.warn("[email] RESEND_API_KEY not configured, skipping email changed notification");
    return { skipped: true };
  }

  const now = new Date().toLocaleString("ru-RU", { timeZone: "UTC" });

  const html = wrapEmailHtml(`
    <h1 style="color: #f4f4f5; font-size: 22px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">Email адрес изменён</h1>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Привет${username ? `, <span class="highlight" style="color: #60A5FA; font-weight: 600;">${username}</span>` : ""}!</p>
    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 16px 0; font-size: 14px;">Email адрес вашего аккаунта в <strong style="color: #e4e4e7;">Haunted TradeJ</strong> был успешно изменён.</p>
    <div class="info" style="background-color: #151a1f; border: 1px solid rgba(59, 130, 246, 0.35); border-left: 4px solid #3B82F6; border-radius: 12px; padding: 16px 20px; color: #93c5fd; font-size: 13px; margin: 20px 0;">
      📅 <strong>Время изменения:</strong> ${now} UTC<br>
      📧 <strong>Новый адрес:</strong> ${newEmail}
    </div>
    <div class="warning" style="background-color: #1c1517; border: 1px solid rgba(239, 68, 68, 0.35); border-left: 4px solid #ef4444; border-radius: 12px; padding: 16px 20px; color: #fca5a5; font-size: 13px; margin: 20px 0;">
      ⚠️ <strong>Это были не вы?</strong><br>
      Немедленно свяжитесь с поддержкой! Ваш аккаунт мог быть скомпрометирован.
    </div>
    <p style="color: #71717a; font-size: 13px; line-height: 1.7;">Этот адрес (<span class="highlight" style="color: #60A5FA; font-weight: 600;">${to}</span>) больше не связан с вашим аккаунтом.</p>
  `);

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: "✅ Email адрес изменён — Haunted TradeJ",
      html,
    });
    // eslint-disable-next-line no-console
    console.log("[email] Email changed notification sent to old email:", to, "id:", result?.data?.id);
    return { sent: true, id: result?.data?.id };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[email] Failed to send email changed notification:", error?.message || error);
    return { error: error?.message || "Failed to send email" };
  }
}
