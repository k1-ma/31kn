import React, { useEffect, useState } from "react";

/**
 * TypewriterText — маленькая анимация “набора текста”.
 * enabled=false => выводит текст сразу.
 */
export default function TypewriterText({
  text,
  enabled = true,
  speed = 16,
  delay = 0,
  className = "",
  cursor = false,
}) {
  const full = String(text ?? "");
  const [n, setN] = useState(enabled ? 0 : full.length);

  useEffect(() => {
    if (!enabled) {
      setN(full.length);
      return;
    }
    setN(0);

    let id = null;
    const t0 = window.setTimeout(() => {
      id = window.setInterval(() => {
        setN((prev) => {
          const next = Math.min(full.length, prev + 1);
          if (next >= full.length) window.clearInterval(id);
          return next;
        });
      }, Math.max(16, speed));
    }, Math.max(0, delay));

    return () => {
      window.clearTimeout(t0);
      if (id !== null) window.clearInterval(id);
    };
  }, [full, enabled, speed, delay]);

  const shown = full.slice(0, n);

  return (
    <span className={className}>
      {shown}
      {cursor && enabled ? (
        <span className="ml-0.5 inline-block w-[0.55ch] animate-pulse select-none">▍</span>
      ) : null}
    </span>
  );
}
