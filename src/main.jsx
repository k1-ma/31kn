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
// This helps users/support identify www vs apex domain issues
// ─────────────────────────────────────────────────────────────────────────────
(function logStartupDiagnostics() {
  const hostname = window.location.hostname;
  const isWww = hostname.startsWith('www.');
  const canonicalHost = isWww ? hostname.slice(4) : hostname;
  const lastKnownUserId = localStorage.getItem('tradecrm:lastKnownUserId');
  
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
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
