import React from "react";
export default function Switch({ checked, onCheckedChange, ...rest }) {
  return (
    <button
      type="button"
      onClick={() => onCheckedChange?.(!checked)}
      className={
        "relative inline-flex h-[26px] w-12 items-center rounded-full border transition-all duration-200 " +
        (checked 
          ? "bg-accent border-accent/40 shadow-sm" 
          : "bg-muted dark:bg-[#0B1220] border-border/50 dark:border-white/[0.12] hover:border-border dark:hover:border-white/[0.2]")
      }
      aria-pressed={!!checked}
      {...rest}
    >
      <span className={
        "inline-block h-[20px] w-[20px] transform rounded-full transition-all duration-200 " + 
        (checked 
          ? "translate-x-[23px] bg-white shadow-sm" 
          : "translate-x-[3px] bg-muted-foreground/50 dark:bg-[#5A6B8A] shadow-sm")
      } />
    </button>
  );
}
