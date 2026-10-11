"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  Calculator,
  BarChart2,
  Medal,
  Timer,
  History,
  Activity,
  Flame,
} from "lucide-react";

const navItems = [
  { href: "/calculadora", label: "Pace", icon: Calculator },
  { href: "/medias", label: "Médias", icon: BarChart2 },
  { href: "/taf", label: "TAF", icon: Medal },
  { href: "/metas", label: "Metas", icon: Timer },
  { href: "/intervalado", label: "Intervalado", icon: Flame },
  { href: "/historico", label: "Histórico", icon: History },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2.5 font-black text-lg sm:text-xl text-slate-900 dark:text-slate-100 hover:opacity-90 transition-opacity"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/30">
            <Activity className="w-5 h-5" />
          </div>
          <span className="tracking-tight">
            Pace<span className="text-blue-600 dark:text-blue-400">Lab</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
