import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordInput({ className = "", ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative w-full">
      <input
        {...props}
        type={show ? "text" : "password"}
        className={
          "h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 pr-11 text-base text-slate-900 dark:text-slate-100 outline-none " +
          "placeholder:text-slate-400 transition " +
          "focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 " +
          className
        }
      />
      <button
        type="button"
        onClick={() => setShow((p) => !p)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
