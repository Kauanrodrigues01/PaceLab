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
  Trophy,
} from "lucide-react";

const mobileNavItems = [
  { href: "/", label: "Início", icon: Home },
  { href: "/calculadora", label: "Pace", icon: Calculator },
  { href: "/meu-taf", label: "Meu TAF", icon: Trophy, highlight: true },
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
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-1 py-1 shadow-lg safe-area-bottom"
    >
      <div className="flex items-center justify-between overflow-x-auto scrollbar-none px-1">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          const isHighlight = item.highlight;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-1.5 rounded-xl text-[10px] min-w-[52px] transition-all shrink-0 ${
                isActive
                  ? isHighlight
                    ? "text-blue-600 dark:text-blue-400 font-black"
                    : "text-blue-600 dark:text-blue-400 font-bold"
                  : isHighlight
                  ? "text-blue-700 dark:text-blue-300 font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <div
                className={`p-1 rounded-xl transition-all ${
                  isActive
                    ? isHighlight
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400"
                    : isHighlight
                    ? "bg-amber-100/80 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400"
                    : ""
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className="mt-0.5 tracking-tight whitespace-nowrap">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
