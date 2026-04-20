import React from "react";
import { Link } from "react-router-dom";
import AdminNav from "./AdminNav.jsx";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Shared admin page layout wrapper.
 * Provides consistent background, container width, grid overlay,
 * back button, page title/subtitle, and AdminNav.
 */
export default function AdminLayout({ title, subtitle, children, actions }) {
  return (
    <div className="min-h-screen app-bg">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Link
                to="/admincrm-panel/dashboard"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-card/55 glass text-muted-foreground hover:bg-card/70 transition"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-[#3B82F6] via-[#60A5FA] to-[#22D3EE] bg-clip-text text-transparent">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-sm text-muted-foreground">{subtitle}</p>
                )}
              </div>
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
          <AdminNav />
        </div>

        {/* Page content */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
