import React from "react";
import Link from "next/link";
import { FileCode, Heart } from "lucide-react";
import { BrandLogo } from "@/components/layout/BrandLogo";

export function Footer() {
  return (
    <footer className="w-full border-t border-[#1E2942] bg-[#0B1020]/90 backdrop-blur-sm mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand & Mission */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <Link
              href="/"
              className="hover:opacity-90 transition-opacity"
              aria-label="PaceLab Início"
            >
              <BrandLogo size="sm" />
            </Link>
            <p className="text-xs text-[#8E9BB0] mt-1 max-w-sm">
              Plataforma para corredores e preparação física em concursos públicos (TAF).
            </p>
          </div>

          {/* Navigation Links */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-[#8E9BB0]">
            <Link href="/calculadora" className="hover:text-[#B7F34A] transition-colors">
              Calculadoras
            </Link>
            <span className="text-[#1E2942]">•</span>
            <Link href="/treinos" className="hover:text-[#B7F34A] transition-colors">
              Diário
            </Link>
            <span className="text-[#1E2942]">•</span>
            <Link href="/meu-taf" className="hover:text-[#B7F34A] transition-colors">
              Meu TAF
            </Link>
            <span className="text-[#1E2942]">•</span>
            <Link href="/perfil" className="hover:text-[#B7F34A] transition-colors">
              Perfil
            </Link>
            <span className="text-[#1E2942]">•</span>
            <Link
              href="/docs"
              className="inline-flex items-center gap-1 text-[#B7F34A] font-semibold hover:underline transition-colors"
            >
              <FileCode className="w-3.5 h-3.5" />
              API Docs (Swagger)
            </Link>
          </div>

          {/* Copyright */}
          <div className="text-xs text-[#8E9BB0] flex items-center gap-1">
            <span>PaceLab &copy; 2026. Feito com</span>
            <Heart className="w-3 h-3 text-rose-500 fill-rose-500 inline" />
            <span>para atletas.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
