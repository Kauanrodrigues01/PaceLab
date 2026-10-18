"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  Calculator,
  Calendar,
  Trophy,
  Scale,
  FileCode,
} from "lucide-react";
import { WeeklyWeightModal } from "@/components/profile/WeeklyWeightModal";
import { BrandLogo } from "@/components/layout/BrandLogo";

const navItems = [
  { href: "/calculadora", label: "Calculadoras", icon: Calculator },
  { href: "/treinos", label: "Diário de Treinos", icon: Calendar },
  { href: "/meu-taf", label: "Meu TAF", icon: Trophy, highlight: true },
  { href: "/perfil", label: "Perfil & Peso", icon: Scale },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-[#1E2942] bg-white/80 dark:bg-[#0B1020]/90 backdrop-blur-md transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link
          href="/"
          className="hover:opacity-90 transition-opacity"
          aria-label="PaceLab Início"
        >
          <BrandLogo size="md" />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href === "/calculadora" &&
                ["/taf", "/metas", "/intervalado", "/historico"].includes(pathname));

            if (item.highlight) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm transition-all ${
                    isActive
                      ? "bg-lime-400 dark:bg-[#B7F34A] text-slate-950 dark:text-[#0B1020] shadow-sm shadow-lime-500/25 font-bold"
                      : "bg-lime-500/10 dark:bg-[#B7F34A]/10 border border-lime-500/30 dark:border-[#B7F34A]/25 text-lime-800 dark:text-[#B7F34A] hover:bg-lime-500/20 dark:hover:bg-[#B7F34A]/20 font-bold"
                  }`}
                >
                  <Icon className="w-4 h-4 text-amber-500 dark:text-[#B7F34A]" />
                  {item.label}
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-slate-100 dark:bg-[#131A2E] text-slate-900 dark:text-[#FFFFFF] border border-transparent dark:border-[#1E2942] font-semibold"
                    : "text-slate-600 dark:text-[#8E9BB0] hover:bg-slate-100 dark:hover:bg-[#131A2E] hover:text-slate-900 dark:hover:text-[#FFFFFF]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/docs"
            title="Documentação da API (Swagger)"
            aria-label="Documentação da API (Swagger)"
            className="p-2 rounded-xl text-slate-600 dark:text-[#8E9BB0] hover:text-lime-600 dark:hover:text-[#B7F34A] hover:bg-slate-100 dark:hover:bg-[#131A2E] transition-colors"
          >
            <FileCode className="w-5 h-5" />
          </Link>
          <ThemeToggle />
        </div>
      </div>
      <WeeklyWeightModal />
    </header>
  );
}
