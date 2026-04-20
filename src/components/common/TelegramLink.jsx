import React from "react";
import { motion } from "framer-motion";

const TELEGRAM_URL = "https://t.me/ressence1";
const TELEGRAM_USERNAME = "Telegram";

// Telegram icon SVG
const TelegramIcon = ({ className = "h-4 w-4" }) => (
  <svg 
    className={className} 
    viewBox="0 0 24 24" 
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

/**
 * TelegramLink component with different variants for different use cases
 * @param {string} variant - "ghost" | "card" | "sidebar" | "pill" | "inline"
 * @param {boolean} collapsed - Only for sidebar variant, shows icon only
 * @param {string} className - Additional CSS classes
 */
export default function TelegramLink({ variant = "ghost", collapsed = false, className = "" }) {
  if (variant === "sidebar") {
    return (
      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        title={collapsed ? `Telegram ${TELEGRAM_USERNAME}` : undefined}
        className={`group flex items-center gap-3 rounded-xl transition-colors duration-150 text-muted-foreground hover:bg-[#229ED9]/15 hover:text-[#229ED9] ${
          collapsed ? "w-12 h-12 justify-center" : "w-full px-4 py-3"
        } ${className}`}
      >
        <TelegramIcon className="h-5 w-5" />
        {!collapsed && <span className="font-medium text-sm">Telegram</span>}
      </a>
    );
  }

  if (variant === "pill") {
    return (
      <motion.a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all
          bg-[#229ED9]/10 hover:bg-[#229ED9]/20 text-[#229ED9] border border-[#229ED9]/30 hover:border-[#229ED9]/50
          backdrop-blur-sm shadow-sm hover:shadow-[0_0_15px_rgba(34,158,217,0.2)] ${className}`}
      >
        <TelegramIcon className="h-4 w-4" />
        <span>{TELEGRAM_USERNAME}</span>
      </motion.a>
    );
  }

  if (variant === "card") {
    return (
      <motion.a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={`flex items-center gap-3 p-3 rounded-xl transition-all
          bg-[#229ED9]/5 hover:bg-[#229ED9]/10 border border-[#229ED9]/20 hover:border-[#229ED9]/40
          backdrop-blur-sm ${className}`}
      >
        <div className="h-10 w-10 rounded-xl bg-[#229ED9]/15 flex items-center justify-center">
          <TelegramIcon className="h-5 w-5 text-[#229ED9]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">Telegram</div>
          <div className="text-xs text-[#229ED9]">{TELEGRAM_USERNAME}</div>
        </div>
      </motion.a>
    );
  }

  if (variant === "inline") {
    return (
      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#229ED9] transition-colors ${className}`}
      >
        <TelegramIcon className="h-3.5 w-3.5" />
        <span>{TELEGRAM_USERNAME}</span>
      </a>
    );
  }

  // Default: ghost variant
  return (
    <a
      href={TELEGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground 
        hover:text-[#229ED9] hover:bg-[#229ED9]/10 transition-all ${className}`}
    >
      <TelegramIcon className="h-4 w-4" />
      <span>{TELEGRAM_USERNAME}</span>
    </a>
  );
}

export { TelegramIcon, TELEGRAM_URL, TELEGRAM_USERNAME };
