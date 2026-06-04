import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './styles/index.css';
import App from './App.jsx';
import { queryClient } from './queries/client.js';

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
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  );
} catch (e) {
  console.error('[Koshyk] Fatal mount error:', e);
  try {
    const el = document.getElementById('boot-screen');
    if (el) el.classList.add('boot-stuck');
  } catch {}
}
