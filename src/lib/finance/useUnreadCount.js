import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api.js";

/**
 * Polls /api/notifications/count every 60 s so the bell badge stays
 * roughly fresh without a websocket. Returns 0 when the API is
 * unreachable so the UI degrades quietly.
 */
export function useUnreadCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer = null;
    const fetchOnce = async () => {
      try {
        const res = await apiJson("/api/notifications/count");
        if (alive) setCount(res?.count || 0);
      } catch {
        if (alive) setCount(0);
      }
    };
    fetchOnce();
    timer = setInterval(fetchOnce, 60_000);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);
  return count;
}
