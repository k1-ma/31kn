import React from "react";
import { motion } from "framer-motion";

/**
 * Press — hover glow + tap press.
 * Используй для главных кнопок/карточек.
 */
export default function Press({ children, disabled, reduceMotion, scale = 0.985, className = "" }) {
  if (reduceMotion || disabled) return <span className={className}>{children}</span>;
  return (
    <motion.span className={className} whileTap={{ scale }} whileHover={{ scale: 1.01 }}>
      {children}
    </motion.span>
  );
}
