import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/index.css'
import App from './App.jsx'

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
