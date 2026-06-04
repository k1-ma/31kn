import { QueryClient } from "@tanstack/react-query";

/**
 * Single app-wide QueryClient. Mode B (server-authoritative): we deliberately
 * do NOT persist the GET cache to disk — a cold start re-fetches from the
 * server rather than risk serving a stale dashboard. Mutations stay snappy via
 * per-call optimistic cache updates in the finance store.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
