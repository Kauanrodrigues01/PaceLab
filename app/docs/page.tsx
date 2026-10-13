import type { Metadata } from "next";
import Link from "next/link";
import { SwaggerUIViewer } from "@/components/docs/SwaggerUIViewer";
import { FileCode, ArrowLeft, ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  title: "Documentação da API — PaceLab",
  description:
    "Especificação OpenAPI 3.0 e console interativo Swagger UI com 100% das rotas da API REST do PaceLab.",
};

export default function DocsPage() {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Top Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao PaceLab
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileCode className="w-6 h-6" />
            </span>
            Documentação da API (Swagger)
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Console OpenAPI 3.0 interativo para teste e integração com todos os endpoints do PaceLab:
            metas TAF multimodais, simulados, diário de treinos com gasto calórico e perfil biométrico.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/api/docs/spec"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all"
          >
            Ver Spec JSON
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Swagger UI Container */}
      <SwaggerUIViewer />
    </main>
  );
}
