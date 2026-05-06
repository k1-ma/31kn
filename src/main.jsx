import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import App from './App.jsx';

function clearBootScreen() {
  try {
    if (typeof window.__bootScreenClear === 'function') window.__bootScreenClear();
    const el = document.getElementById('boot-screen');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch {}
}
window.__clearBootScreen = clearBootScreen;

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (e) {
  console.error('[Koshyk] Fatal mount error:', e);
  try {
    const el = document.getElementById('boot-screen');
    if (el) el.classList.add('boot-stuck');
  } catch {}
}
