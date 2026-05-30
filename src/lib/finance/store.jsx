import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { idbStorage } from "@/lib/idbStorage.js";
import { apiJson } from "@/lib/api.js";
import { defaultCategories, defaultWallets } from "./seed.js";

/**
 * The finance store holds the entire user-scoped finance state in a single
 * object: wallets, categories, transactions, budgets, goals, recurring rules,
 * debts, plus user prefs (base currency, theme).
 *
 * State is persisted to IndexedDB (via idbStorage) on every change for
 * instant offline-first reads. For authenticated users the same blob is also
 * mirrored to /api/state using a last-write-wins-by-timestamp strategy at the
 * whole-blob level: a top-level `updatedAt` bumps on every mutation, and on
 * load we adopt whichever side (local IDB vs server) is newer. All network
 * calls are best-effort and never block or throw to the UI, so the app keeps
 * working with no network.
 */

const STATE_KEY_PREFIX = "koshyk:state:";

const EMPTY_STATE = {
  // ISO timestamp of the last local mutation; used for last-write-wins sync.
  updatedAt: null,
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
  const isAuthed = !!user && userId !== "anon";

  // Millisecond timestamp of a state blob's `updatedAt` (0 if unset/invalid).
  const stateTime = (s) => {
    const t = s?.updatedAt ? new Date(s.updatedAt).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  };

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    (async () => {
      const key = `${STATE_KEY_PREFIX}${userId}`;
      // 1) Load from IDB first for instant render.
      let local;
      try {
        const cached = await idbStorage.get(key);
        if (!alive) return;
        if (cached && typeof cached === "object" && Array.isArray(cached.transactions)) {
          local = { ...EMPTY_STATE, ...cached };
        } else {
          local = seedState();
          await idbStorage.set(key, local);
        }
      } catch {
        local = seedState();
      }
      if (!alive) return;
      setState(local);
      setLoaded(true);

      // 2) For authenticated users, reconcile with the server (last-write-wins
      //    at the whole-blob level). Never block the UI; swallow network errors.
      if (!isAuthed) return;
      try {
        const res = await apiJson("/api/state");
        if (!alive) return;
        const serverState = res?.state;
        const hasServerState =
          serverState &&
          typeof serverState === "object" &&
          Array.isArray(serverState.transactions);
        // Server may persist its own row updated_at; prefer the blob's own
        // updatedAt, falling back to the row's updatedAt envelope.
        const serverTime = hasServerState
          ? stateTime(serverState) || (res?.updatedAt ? new Date(res.updatedAt).getTime() : 0)
          : 0;
        if (hasServerState && serverTime > stateTime(local)) {
          // Server is newer — adopt it locally and persist to IDB.
          const merged = { ...EMPTY_STATE, ...serverState };
          setState(merged);
          idbStorage.set(key, merged).catch(() => {});
        } else {
          // Local is newer or equal (or server empty) — push local up.
          await apiJson("/api/state", {
            method: "PUT",
            body: JSON.stringify({ state: local }),
          });
        }
      } catch {
        // Offline or server error: keep local state, sync again on next change.
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, isAuthed]);

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

  // Push to the server on change, debounced longer (~2s) than the IDB write.
  // Authenticated users only; errors are swallowed so the UI never blocks.
  const syncTimer = useRef(null);
  useEffect(() => {
    if (!loaded || !isAuthed) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      apiJson("/api/state", {
        method: "PUT",
        body: JSON.stringify({ state }),
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(syncTimer.current);
  }, [state, loaded, isAuthed]);

  const update = useCallback((patch) => {
    setState((prev) => ({
      ...prev,
      ...(typeof patch === "function" ? patch(prev) : patch),
      updatedAt: nowIso(),
    }));
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
        return { ...prev, [collection]: next, updatedAt: ts };
      }
      const created = {
        id: item.id || newId(collection.slice(0, 3)),
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        ...item,
      };
      return { ...prev, [collection]: [...list, created], updatedAt: ts };
    });
  }, []);

  const remove = useCallback((collection, id) => {
    setState((prev) => {
      const list = prev[collection] || [];
      const ts = nowIso();
      return {
        ...prev,
        [collection]: list.map((x) => (x.id === id ? { ...x, deletedAt: ts, updatedAt: ts } : x)),
        updatedAt: ts,
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
        updatedAt: ts,
      };
    });
  }, []);

  const purge = useCallback((collection, id) => {
    setState((prev) => ({
      ...prev,
      [collection]: (prev[collection] || []).filter((x) => x.id !== id),
      updatedAt: nowIso(),
    }));
  }, []);

  const setPrefs = useCallback((patch) => {
    setState((prev) => ({
      ...prev,
      prefs: { ...(prev.prefs || {}), ...patch },
      updatedAt: nowIso(),
    }));
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
