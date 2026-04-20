import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordInput({ className = "", ...props }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative w-full">
      <input
        {...props}
        type={showPassword ? "text" : "password"}
        className={
          "h-9 w-full rounded-lg border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.03] px-3 pr-10 text-[13px] text-foreground outline-none " +
          "placeholder:text-muted-foreground/50 transition-all duration-200 " +
          "shadow-sm dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)] " +
          "focus:border-accent/50 focus:ring-1 focus:ring-accent/25 focus:bg-card dark:focus:bg-white/[0.05] " +
          "hover:border-border dark:hover:border-white/[0.14] " +
          className
        }
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:text-foreground focus:outline-none transition-colors"
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
