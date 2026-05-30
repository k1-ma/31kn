import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { idbStorage } from "@/lib/idbStorage.js";
import { defaultCategories, defaultWallets } from "./seed.js";

/**
 * The finance store holds the entire user-scoped finance state in a single
 * object: wallets, categories, transactions, budgets, goals, recurring rules,
 * debts, plus user prefs (base currency, theme).
 *
 * State is persisted to IndexedDB (via idbStorage) on every change. Server
 * sync is opt-in: when /api/sync is wired up downstream the same blob is
 * pushed up. For now everything works offline.
 */

const STATE_KEY_PREFIX = "koshyk:state:";

const EMPTY_STATE = {
  wallets: [],
  categories: [],
  transactions: [],
  budgets: [],
  goals: [],
  recurring: [],
  debts: [],
  prefs: {
    baseCurrency: "UAH",
    theme: "system", // light | dark | system
  },
};

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function seedState() {
  const state = structuredClone(EMPTY_STATE);
  state.categories = defaultCategories().map((c) => ({
    id: newId("cat"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null,
    ...c,
  }));
  state.wallets = defaultWallets().map((w) => ({
    id: newId("wal"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null,
    ...w,
  }));
  return state;
}

const FinanceCtx = createContext(null);

export function FinanceProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const userId = user?.id || "anon";

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    (async () => {
      const key = `${STATE_KEY_PREFIX}${userId}`;
      try {
        const cached = await idbStorage.get(key);
        if (!alive) return;
        if (cached && typeof cached === "object" && Array.isArray(cached.transactions)) {
          setState({ ...EMPTY_STATE, ...cached });
        } else {
          const seeded = seedState();
          setState(seeded);
          await idbStorage.set(key, seeded);
        }
      } catch {
        setState(seedState());
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  // Persist on change, debounced to avoid thrashing IDB on rapid edits.
  const flushTimer = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    const key = `${STATE_KEY_PREFIX}${userId}`;
    clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      idbStorage.set(key, state).catch(() => {});
    }, 500);
    return () => clearTimeout(flushTimer.current);
  }, [state, loaded, userId]);

  const update = useCallback((patch) => {
    setState((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }, []);

  // Generic CRUD on a named collection.
  const upsert = useCallback((collection, item) => {
    setState((prev) => {
      const list = prev[collection] || [];
      const ts = nowIso();
      const existingIdx = item.id ? list.findIndex((x) => x.id === item.id) : -1;
      if (existingIdx >= 0) {
        const next = list.slice();
        next[existingIdx] = { ...next[existingIdx], ...item, updatedAt: ts };
        return { ...prev, [collection]: next };
      }
      const created = {
        id: item.id || newId(collection.slice(0, 3)),
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        ...item,
      };
      return { ...prev, [collection]: [...list, created] };
    });
  }, []);

  const remove = useCallback((collection, id) => {
    setState((prev) => {
      const list = prev[collection] || [];
      const ts = nowIso();
      return {
        ...prev,
        [collection]: list.map((x) => (x.id === id ? { ...x, deletedAt: ts, updatedAt: ts } : x)),
      };
    });
  }, []);

  const restore = useCallback((collection, id) => {
    setState((prev) => {
      const list = prev[collection] || [];
      const ts = nowIso();
      return {
        ...prev,
        [collection]: list.map((x) => (x.id === id ? { ...x, deletedAt: null, updatedAt: ts } : x)),
      };
    });
  }, []);

  const purge = useCallback((collection, id) => {
    setState((prev) => ({
      ...prev,
      [collection]: (prev[collection] || []).filter((x) => x.id !== id),
    }));
  }, []);

  const setPrefs = useCallback((patch) => {
    setState((prev) => ({ ...prev, prefs: { ...(prev.prefs || {}), ...patch } }));
  }, []);

  const value = useMemo(
    () => ({ state, loaded, update, upsert, remove, restore, purge, setPrefs }),
    [state, loaded, update, upsert, remove, restore, purge, setPrefs]
  );

  return <FinanceCtx.Provider value={value}>{children}</FinanceCtx.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceCtx);
  if (!ctx) throw new Error("useFinance must be used inside <FinanceProvider/>");
  return ctx;
}

/** Filter helpers — return only non-deleted items. */
export function active(list) {
  return (list || []).filter((x) => !x.deletedAt);
}
