import React from "react";
import Link from "next/link";
import { Activity, FileCode, Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="w-full border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand & Mission */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <Link
              href="/"
              className="flex items-center gap-2 font-black text-base text-slate-900 dark:text-slate-100 hover:opacity-90 transition-opacity"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
                <Activity className="w-4 h-4" />
              </div>
              <span className="tracking-tight">
                Pace<span className="text-blue-600 dark:text-blue-400">Lab</span>
              </span>
            </Link>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              Plataforma para corredores e preparação física em concursos públicos (TAF).
            </p>
          </div>

          {/* Navigation Links */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
            <Link href="/calculadora" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Calculadoras
            </Link>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <Link href="/treinos" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Diário
            </Link>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <Link href="/meu-taf" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Meu TAF
            </Link>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <Link href="/perfil" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Perfil
            </Link>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <Link
              href="/docs"
              className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold hover:underline transition-colors"
            >
              <FileCode className="w-3.5 h-3.5" />
              API Docs (Swagger)
            </Link>
          </div>

          {/* Copyright */}
          <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <span>PaceLab &copy; 2026. Feito com</span>
            <Heart className="w-3 h-3 text-red-500 fill-red-500 inline" />
            <span>para atletas.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
