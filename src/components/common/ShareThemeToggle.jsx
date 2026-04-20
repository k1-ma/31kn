import React, { useState, useEffect, useCallback } from "react";
import { Sun, Moon } from "lucide-react";

const STORAGE_KEY = "tradej_share_theme";

function getInitialDark() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light") return false;
    if (stored === "dark") return true;
  } catch {}
  return document.documentElement.classList.contains("dark");
}

export default function ShareThemeToggle() {
  const [dark, setDark] = useState(getInitialDark);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [dark]);

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? "dark" : "light"); } catch {}
      return next;
    });
  }, []);

  const label = dark ? "Light mode" : "Dark mode";

  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="shrink-0 h-9 w-9 rounded-xl bg-accent/10 hover:bg-accent/20 flex items-center justify-center transition-colors"
    >
      {dark
        ? <Sun className="h-4 w-4 text-accent" />
        : <Moon className="h-4 w-4 text-accent" />}
    </button>
  );
}
