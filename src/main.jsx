import React from 'react'
import ReactDOM from 'react-dom/client'
import DOMPurify from 'dompurify'
import './styles/index.css'
import App from './App.jsx'

// Global DOMPurify hardening: any link rendered from sanitized user content
// that opens in a new tab must carry rel="noopener noreferrer" to prevent
// reverse-tabnabbing. Applied once at module load so every call site picks
// it up without having to remember the config.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTICS: Log hostname and environment info on startup
// This helps users/support identify www vs apex domain issues.
// Wrapped in try/catch so a localStorage exception (Safari private mode,
// blocked storage policy) cannot prevent React from mounting and leave the
// user staring at the pre-React black background.
// ─────────────────────────────────────────────────────────────────────────────
try {
  const hostname = window.location.hostname;
  const isWww = hostname.startsWith('www.');
  const canonicalHost = isWww ? hostname.slice(4) : hostname;
  let lastKnownUserId = null;
  try { lastKnownUserId = localStorage.getItem('tradecrm:lastKnownUserId'); } catch {}

  console.log('[TradeJ] Startup diagnostics:', {
    hostname,
    isWwwSubdomain: isWww,
    canonicalHost,
    protocol: window.location.protocol,
    hasLastKnownUser: !!lastKnownUserId,
    userAgent: navigator.userAgent.slice(0, 50) + '...',
    online: navigator.onLine,
    timestamp: new Date().toISOString(),
  });

  if (isWww) {
    console.warn('[TradeJ] WARNING: Running on www subdomain. localStorage/cookies may differ from apex domain.');
    console.warn('[TradeJ] Recommended: Use', canonicalHost, 'instead of', hostname);
  }
} catch (e) {
  // Diagnostics must never block boot.
  console.warn('[TradeJ] Startup diagnostics failed:', e);
}

function clearBootScreen() {
  try {
    if (typeof window.__bootScreenClear === 'function') window.__bootScreenClear();
    const el = document.getElementById('boot-screen');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch {}
}
// Expose for App to call on first commit. Placing the call inside an effect
// in <App/> guarantees React has actually rendered before the boot screen
// is removed — avoids a flash of empty body between screen removal and the
// first React paint.
window.__clearBootScreen = clearBootScreen;

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (e) {
  // If the React tree throws synchronously during initial render, the
  // ErrorBoundary inside <App/> can't help — surface the failure on the boot
  // screen so the user sees something instead of pure black.
  console.error('[TradeJ] Fatal mount error:', e);
  try {
    const el = document.getElementById('boot-screen');
    if (el) el.classList.add('boot-stuck');
  } catch {}
}
