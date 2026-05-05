import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Shield, BarChart3, ScrollText, Settings as SettingsIcon } from "lucide-react";

const TABS = [
  { to: "/admincrm-panel/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admincrm-panel/users", label: "Users", icon: Users },
  { to: "/admincrm-panel/bans", label: "Bans", icon: Shield },
  { to: "/admincrm-panel/usage", label: "Usage", icon: BarChart3 },
  { to: "/admincrm-panel/logs", label: "Logs", icon: ScrollText },
  { to: "/admincrm-panel/settings", label: "Settings", icon: SettingsIcon },
];

export default function AdminNav() {
  const loc = useLocation();
  return (
    <header className="border-b border-slate-800 bg-slate-950/95 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3 overflow-x-auto">
        <span className="text-xs tracking-widest text-amber-500 font-bold mr-3">KOSHYK · ADMIN</span>
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = loc.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${
                active ? "bg-amber-500 text-slate-900" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}
