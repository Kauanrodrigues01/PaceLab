"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calculator,
  Calendar,
  Trophy,
  Scale,
} from "lucide-react";

const mobileNavItems = [
  { href: "/", label: "Início", icon: Home },
  { href: "/calculadora", label: "Calculadoras", icon: Calculator },
  { href: "/treinos", label: "Treinos", icon: Calendar },
  { href: "/meu-taf", label: "Meu TAF", icon: Trophy, highlight: true },
  { href: "/perfil", label: "Perfil", icon: Scale },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação móvel"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0B1020]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#1E2942] px-2 py-1.5 shadow-lg safe-area-bottom"
    >
      <div className="grid grid-cols-5 max-w-md mx-auto gap-1">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href === "/calculadora" &&
              ["/taf", "/metas", "/intervalado", "/historico"].includes(pathname));
          const isHighlight = item.highlight;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-2xl text-[11px] transition-all ${
                isActive
                  ? isHighlight
                    ? "text-lime-600 dark:text-[#B7F34A] font-black"
                    : "text-lime-600 dark:text-[#B7F34A] font-bold"
                  : isHighlight
                  ? "text-lime-700 dark:text-[#B7F34A] font-bold"
                  : "text-slate-500 dark:text-[#8E9BB0] hover:text-slate-800 dark:hover:text-[#FFFFFF]"
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition-all ${
                  isActive
                    ? isHighlight
                      ? "bg-lime-400 dark:bg-[#B7F34A] text-slate-950 dark:text-[#0B1020] shadow-xs"
                      : "bg-lime-100 dark:bg-[#B7F34A]/20 text-lime-700 dark:text-[#B7F34A]"
                    : isHighlight
                    ? "bg-lime-500/10 dark:bg-[#B7F34A]/10 text-lime-700 dark:text-[#B7F34A]"
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
