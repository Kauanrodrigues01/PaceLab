"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calculator,
  BarChart2,
  Medal,
  Timer,
  Flame,
  History,
} from "lucide-react";

const mobileNavItems = [
  { href: "/", label: "Início", icon: Home },
  { href: "/calculadora", label: "Pace", icon: Calculator },
  { href: "/medias", label: "Médias", icon: BarChart2 },
  { href: "/taf", label: "TAF", icon: Medal },
  { href: "/metas", label: "Metas", icon: Timer },
  { href: "/intervalado", label: "Intervalos", icon: Flame },
  { href: "/historico", label: "Histórico", icon: History },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação móvel"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 shadow-lg safe-area-bottom"
    >
      <div className="flex items-center justify-around">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                isActive
                  ? "text-blue-600 dark:text-blue-400 font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <div
                className={`p-1 rounded-lg ${
                  isActive
                    ? "bg-blue-100 dark:bg-blue-950/80"
                    : ""
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className="mt-0.5 tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
