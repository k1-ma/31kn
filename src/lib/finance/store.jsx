import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useToast } from "@/components/common/ToastProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import { ENTITY_NAMES, fetchEntity, fetchPrefs, qk } from "@/queries/finance.js";
import { defaultCategories, defaultWallets } from "./seed.js";

/**
 * Finance store — v2.
 *
 * The user's finance data lives in normalized per-entity tables on the server
 * (wallets, categories, transactions, …). This provider is a thin facade over
 * TanStack Query: one query per collection feeds a combined `state` object
 * with the exact shape the pages already consume, and every mutation is an
 * O(1-row) REST call with an optimistic cache update for instant UX.
 *
 * There is no client-side merge/reconcile/sync layer and no IndexedDB blob —
 * that was the v1 anti-pattern this rebuild removes. TanStack Query owns the
 * cache; the server owns the truth.
 */

const DEFAULT_PREFS = { baseCurrency: "UAH", theme: "system" };

const EMPTY_LISTS = {
  wallets: [],
  categories: [],
  transactions: [],
  budgets: [],
  goals: [],
  recurring: [],
  debts: [],
};

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

const FinanceCtx = createContext(null);

export function FinanceProvider({ children }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const userId = user?.id ?? "anon";
  const enabled = !!user;

  const entityQueries = useQueries({
    queries: ENTITY_NAMES.map((name) => ({
      queryKey: qk.entity(name, userId),
      queryFn: () => fetchEntity(name),
      enabled,
    })),
  });

  const prefsQuery = useQuery({
    queryKey: qk.prefs(userId),
    queryFn: fetchPrefs,
    enabled,
  });

  // Loaded once every collection (and prefs) has resolved at least once —
  // errored queries count as "settled" so a network blip shows the (empty)
  // UI instead of an infinite spinner.
  const loaded =
    enabled && entityQueries.every((q) => !q.isLoading) && !prefsQuery.isLoading;

  // Assemble the combined state object the pages expect. Memoized on the raw
  // query data so it only changes when something actually changed.
  const dataDeps = entityQueries.map((q) => q.data);
  const state = useMemo(() => {
    const next = { updatedAt: nowIso() };
    ENTITY_NAMES.forEach((name, i) => {
      next[name] = entityQueries[i].data || EMPTY_LISTS[name];
    });
    next.prefs = { ...DEFAULT_PREFS, ...(prefsQuery.data || {}) };
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dataDeps, prefsQuery.data]);

  const onError = useCallback(() => {
    toast.push({ kind: "error", title: t("errors.generic") });
  }, [toast, t]);

  const setList = useCallback(
    (name, updater) => {
      qc.setQueryData(qk.entity(name, userId), (old) => updater(old || []));
    },
    [qc, userId]
  );

  // Create-or-update one entity. Optimistic, then reconciled with the server
  // row; rolls back the cache on failure.
  const upsert = useCallback(
    (name, item) => {
      const key = qk.entity(name, userId);
      const list = qc.getQueryData(key) || [];
      const ts = nowIso();
      const isUpdate = item.id && list.some((x) => x.id === item.id);
      const prev = list;

      if (isUpdate) {
        setList(name, (l) => l.map((x) => (x.id === item.id ? { ...x, ...item, updatedAt: ts } : x)));
        apiJson(`/api/${name}/${item.id}`, { method: "PUT", body: JSON.stringify(item) })
          .then((res) => {
            if (res?.item) setList(name, (l) => l.map((x) => (x.id === item.id ? res.item : x)));
          })
          .catch(() => {
            qc.setQueryData(key, prev);
            onError();
          });
      } else {
        const id = item.id || newId(name.slice(0, 3));
        const optimistic = { ...item, id, createdAt: ts, updatedAt: ts, deletedAt: null };
        setList(name, (l) => [...l, optimistic]);
        apiJson(`/api/${name}`, { method: "POST", body: JSON.stringify(optimistic) })
          .then((res) => {
            if (res?.item) setList(name, (l) => l.map((x) => (x.id === id ? res.item : x)));
          })
          .catch(() => {
            qc.setQueryData(key, prev);
            onError();
          });
      }
    },
    [qc, userId, setList, onError]
  );

  const remove = useCallback(
    (name, id) => {
      const key = qk.entity(name, userId);
      const prev = qc.getQueryData(key) || [];
      const ts = nowIso();
      setList(name, (l) => l.map((x) => (x.id === id ? { ...x, deletedAt: ts, updatedAt: ts } : x)));
      apiJson(`/api/${name}/${id}`, { method: "DELETE" })
        .then((res) => {
          if (res?.item) setList(name, (l) => l.map((x) => (x.id === id ? res.item : x)));
        })
        .catch(() => {
          qc.setQueryData(key, prev);
          onError();
        });
    },
    [qc, userId, setList, onError]
  );

  const restore = useCallback(
    (name, id) => {
      const key = qk.entity(name, userId);
      const prev = qc.getQueryData(key) || [];
      const ts = nowIso();
      setList(name, (l) => l.map((x) => (x.id === id ? { ...x, deletedAt: null, updatedAt: ts } : x)));
      apiJson(`/api/${name}/${id}/restore`, { method: "POST" })
        .then((res) => {
          if (res?.item) setList(name, (l) => l.map((x) => (x.id === id ? res.item : x)));
        })
        .catch(() => {
          qc.setQueryData(key, prev);
          onError();
        });
    },
    [qc, userId, setList, onError]
  );

  const purge = useCallback(
    (name, id) => {
      const key = qk.entity(name, userId);
      const prev = qc.getQueryData(key) || [];
      setList(name, (l) => l.filter((x) => x.id !== id));
      apiJson(`/api/${name}/${id}/purge`, { method: "DELETE" }).catch(() => {
        qc.setQueryData(key, prev);
        onError();
      });
    },
    [qc, userId, setList, onError]
  );

  const setPrefs = useCallback(
    (patch) => {
      const key = qk.prefs(userId);
      const prev = qc.getQueryData(key) || {};
      const next = { ...DEFAULT_PREFS, ...prev, ...patch };
      qc.setQueryData(key, next);
      apiJson(`/api/preferences`, { method: "PUT", body: JSON.stringify({ prefs: next }) }).catch(() => {
        qc.setQueryData(key, prev);
        onError();
      });
    },
    [qc, userId, onError]
  );

  // Whole-account restore from a backup file. A single transactional bulk
  // import on the server, then refetch everything.
  const importBackup = useCallback(
    async (payload) => {
      await apiJson(`/api/import`, { method: "POST", body: JSON.stringify({ data: payload }) });
      await qc.invalidateQueries({ queryKey: qk.all(userId) });
    },
    [qc, userId]
  );

  // First-run seeding: a brand-new account (every collection empty) gets the
  // default categories + wallets so the app isn't a blank slate. Guarded by a
  // per-user flag so we never re-seed after a user intentionally clears data.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!loaded || !enabled || seededRef.current) return;
    seededRef.current = true;
    const flag = `koshyk:seeded:${userId}`;
    try {
      if (localStorage.getItem(flag)) return;
    } catch {}
    const allEmpty = ENTITY_NAMES.every((n) => (qc.getQueryData(qk.entity(n, userId)) || []).length === 0);
    if (!allEmpty) {
      try { localStorage.setItem(flag, "1"); } catch {}
      return;
    }
    const ts = nowIso();
    const categories = defaultCategories().map((c) => ({ id: newId("cat"), createdAt: ts, updatedAt: ts, deletedAt: null, ...c }));
    const wallets = defaultWallets().map((w) => ({ id: newId("wal"), createdAt: ts, updatedAt: ts, deletedAt: null, ...w }));
    qc.setQueryData(qk.entity("categories", userId), categories);
    qc.setQueryData(qk.entity("wallets", userId), wallets);
    apiJson(`/api/import`, { method: "POST", body: JSON.stringify({ data: { categories, wallets } }) })
      .then(() => {
        try { localStorage.setItem(flag, "1"); } catch {}
      })
      .catch(() => {
        // Leave the flag unset so seeding is retried on the next load.
        seededRef.current = false;
      });
  }, [loaded, enabled, userId, qc]);

  const value = useMemo(
    () => ({ state, loaded, upsert, remove, restore, purge, setPrefs, importBackup }),
    [state, loaded, upsert, remove, restore, purge, setPrefs, importBackup]
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
