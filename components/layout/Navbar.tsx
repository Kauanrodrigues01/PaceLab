"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
    <header className="sticky top-0 z-40 w-full border-b border-[#1E2942] bg-[#0B1020]/90 backdrop-blur-md transition-colors">
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
                      ? "bg-[#B7F34A] text-[#0B1020] shadow-sm shadow-[#B7F34A]/25 font-bold"
                      : "bg-[#B7F34A]/10 border border-[#B7F34A]/25 text-[#B7F34A] hover:bg-[#B7F34A]/20 font-bold"
                  }`}
                >
                  <Icon className="w-4 h-4 text-current" />
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
                    ? "bg-[#131A2E] text-[#FFFFFF] border border-[#1E2942] font-semibold"
                    : "text-[#8E9BB0] hover:bg-[#131A2E] hover:text-[#FFFFFF]"
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
            className="p-2 rounded-xl text-[#8E9BB0] hover:text-[#B7F34A] hover:bg-[#131A2E] transition-colors"
          >
            <FileCode className="w-5 h-5" />
          </Link>
        </div>
      </div>
      <WeeklyWeightModal />
    </header>
  );
}
