import React from "react";
import { motion } from "framer-motion";
import { Youtube, Instagram } from "lucide-react";

// Social media URLs
const SOCIAL_LINKS = {
  telegram: "https://t.me/ressence1",
  instagram: "https://www.instagram.com/rsncex/",
  youtube: "https://www.youtube.com/@ressence1",
};

// Telegram icon SVG (same as in TelegramLink.jsx)
const TelegramIcon = ({ className = "h-5 w-5" }) => (
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
 * SocialLinks component - displays 3 social media icons (Telegram, Instagram, YouTube)
 * 
 * @param {string} variant - "sidebar" | "inline" | "card" | "pill"
 * @param {boolean} collapsed - Only for sidebar variant, shows icon only (for collapsed sidebar)
 * @param {string} className - Additional CSS classes
 */
export default function SocialLinks({ variant = "sidebar", collapsed = false, className = "" }) {
  const links = [
    {
      name: "Telegram",
      url: SOCIAL_LINKS.telegram,
      icon: <TelegramIcon className="h-5 w-5" />,
      hoverColor: "hover:bg-[#229ED9]/15 hover:text-[#229ED9]",
      brandColor: "#229ED9",
    },
    {
      name: "Instagram",
      url: SOCIAL_LINKS.instagram,
      icon: <Instagram className="h-5 w-5" />,
      hoverColor: "hover:bg-[#E4405F]/15 hover:text-[#E4405F]",
      brandColor: "#E4405F",
    },
    {
      name: "YouTube",
      url: SOCIAL_LINKS.youtube,
      icon: <Youtube className="h-5 w-5" />,
      hoverColor: "hover:bg-[#FF0000]/15 hover:text-[#FF0000]",
      brandColor: "#FF0000",
    },
  ];

  // Sidebar variant - row of icons that fits in the sidebar
  if (variant === "sidebar") {
    return (
      <div className={`flex ${collapsed ? "flex-col items-center gap-1" : "items-center justify-around gap-2"} ${className}`}>
        {links.map((link) => (
          <a
            key={link.name}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={link.name}
            className={`group flex items-center justify-center rounded-xl transition-colors duration-150 text-muted-foreground ${link.hoverColor} ${
              collapsed ? "w-10 h-10" : "w-10 h-10"
            }`}
          >
            {link.icon}
          </a>
        ))}
      </div>
    );
  }

  // Pill variant - buttons with borders
  if (variant === "pill") {
    return (
      <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
        {links.map((link) => (
          <motion.a
            key={link.name}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all bg-card/50 hover:bg-card/80 text-muted-foreground hover:text-foreground border border-accent/20 hover:border-accent/40 backdrop-blur-sm"
          >
            <span style={{ color: link.brandColor }}>{link.icon}</span>
            <span>{link.name}</span>
          </motion.a>
        ))}
      </div>
    );
  }

  // Card variant - larger cards with labels
  if (variant === "card") {
    return (
      <div className={`flex flex-wrap items-center justify-center gap-3 ${className}`}>
        {links.map((link) => (
          <motion.a
            key={link.name}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-3 p-3 rounded-xl transition-all bg-card/30 hover:bg-card/50 border border-accent/15 hover:border-accent/30 backdrop-blur-sm"
          >
            <div 
              className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${link.brandColor}20` }}
            >
              <span style={{ color: link.brandColor }}>{link.icon}</span>
            </div>
            <span className="text-sm font-medium text-foreground">{link.name}</span>
          </motion.a>
        ))}
      </div>
    );
  }

  // Inline variant - simple row of icons
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {links.map((link) => (
        <a
          key={link.name}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={link.name}
          className={`text-muted-foreground transition-colors ${link.hoverColor}`}
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}

export { SOCIAL_LINKS, TelegramIcon };
