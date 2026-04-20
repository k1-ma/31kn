import { useState, useMemo, useCallback } from "react";
import { uid } from "@/lib/utils";

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  
  // Memoize push and remove callbacks to prevent unnecessary re-renders
  // in child components that receive the toast object as a prop.
  // This was causing periodic re-renders in Pairs/Sessions tabs.
  const push = useCallback((t) => {
    const id = uid();
    setToasts((p) => [{ id, ...t }, ...p].slice(0, 4));
    window.setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), t.duration ?? 3000);
  }, []);
  
  const remove = useCallback((id) => setToasts((p) => p.filter((x) => x.id !== id)), []);
  
  // Memoize the returned object to maintain stable reference
  // Only recreates when toasts array changes
  return useMemo(() => ({ toasts, push, remove }), [toasts, push, remove]);
}
