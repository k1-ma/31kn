import { useEffect, useState } from "react";

/**
 * useSoftLoading — короткий skeleton при изменении ключа (например фильтр/поиск).
 * Это не “настоящая” загрузка, а микро-UX для ощущения плавности.
 */
export default function useSoftLoading(key, ms = 220) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ms <= 0) return;
    setLoading(true);
    const t = window.setTimeout(() => setLoading(false), ms);
    return () => window.clearTimeout(t);
  }, [key, ms]);

  return loading;
}
