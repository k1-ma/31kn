import React, { useEffect, useState } from "react";
import { Lock, Delete } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

const HASH_KEY = "koshyk:pinHash";
const ENABLED_KEY = "koshyk:pinEnabled";

/** SHA-256 → hex via WebCrypto. Returns null if unavailable. */
async function sha256(text) {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isPinEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1" && !!localStorage.getItem(HASH_KEY);
  } catch {
    return false;
  }
}

export async function setPin(pin) {
  if (!pin || String(pin).length < 4) throw new Error("PIN too short");
  const hash = await sha256(String(pin));
  if (!hash) throw new Error("Crypto unavailable");
  localStorage.setItem(HASH_KEY, hash);
  localStorage.setItem(ENABLED_KEY, "1");
}

export function clearPin() {
  localStorage.removeItem(HASH_KEY);
  localStorage.removeItem(ENABLED_KEY);
}

async function verifyPin(pin) {
  const stored = localStorage.getItem(HASH_KEY);
  if (!stored) return false;
  const hash = await sha256(String(pin));
  return hash === stored;
}

export default function PinLock({ children }) {
  const { t } = useI18n();
  const [unlocked, setUnlocked] = useState(() => !isPinEnabled());
  const [pin, setPinValue] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // If PIN gets enabled/disabled while mounted, keep state in sync.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === ENABLED_KEY || e.key === HASH_KEY) {
        setUnlocked(!isPinEnabled());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const press = async (digit) => {
    if (digit === "back") {
      setPinValue((p) => p.slice(0, -1));
      setErr("");
      return;
    }
    const next = pin + digit;
    setPinValue(next);
    setErr("");
    if (next.length >= 4) {
      setBusy(true);
      const ok = await verifyPin(next);
      setBusy(false);
      if (ok) {
        setUnlocked(true);
        setPinValue("");
      } else if (next.length >= 6) {
        setErr(t("errors.forbidden"));
        setPinValue("");
        try { navigator.vibrate?.(120); } catch {}
      }
    }
  };

  if (unlocked) return children;

  const dots = Array.from({ length: 6 }).map((_, i) => (
    <span
      key={i}
      className={`w-3 h-3 rounded-full ${
        i < pin.length ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"
      }`}
    />
  ));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center mb-5">
        <Lock className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
      </div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Koshyk</h1>
      <p className="text-sm text-slate-500 mt-1">{t("auth.welcomeSub")}</p>
      <div className="mt-8 flex gap-3">{dots}</div>
      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
      <div className="mt-8 grid grid-cols-3 gap-3 w-full max-w-xs">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={k}
              type="button"
              disabled={busy}
              onClick={() => press(k)}
              className="h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-2xl font-medium text-slate-900 dark:text-slate-100 active:scale-95 transition disabled:opacity-50"
            >
              {k === "back" ? <Delete className="w-6 h-6 mx-auto" /> : k}
            </button>
          )
        )}
      </div>
    </div>
  );
}
