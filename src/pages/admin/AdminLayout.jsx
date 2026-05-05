import React from "react";
import AdminNav from "./AdminNav.jsx";

export default function AdminLayout({ children, title }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AdminNav />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {title && <h1 className="text-2xl font-bold tracking-tight mb-6">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
