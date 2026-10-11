import React from "react";
import Link from "next/link";
import {
  Calculator,
  Layers,
  Medal,
  Target,
  Flame,
  History,
  ArrowRight,
  Sparkles,
  Zap,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export default function Home() {
  const tools = [
    {
      title: "Calculadora de Pace",
      description: "Calcule ritmo (min/km), velocidade média (km/h), tempo total ou distância com atalhos rápidos.",
      href: "/calculadora",
      icon: <Calculator className="w-6 h-6 text-blue-600 dark:text-blue-400" />,
      badge: "Core",
      gradient: "from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20",
      accent: "text-blue-600 dark:text-blue-400",
    },
    {
      title: "Média de Paces & Splits",
      description: "Cole seus trechos de treino para descobrir a média real, melhor e pior parcial e gráfico de oscilação.",
      href: "/medias",
      icon: <Layers className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
      badge: "Splits",
      gradient: "from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20",
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Preparação para o TAF",
      description: "Planeje o ritmo exato para seu concurso militar ou policial com tempo por volta na pista de 400m e barra de aptidão.",
      href: "/taf",
      icon: <Medal className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
      badge: "Concursos",
      gradient: "from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20",
      accent: "text-amber-600 dark:text-amber-400",
    },
    {
      title: "Metas & Planilha de Splits",
      description: "Defina seu tempo-alvo ou ritmo para provas (5k, 10k, 21k, 42k) e gere a tabela de passagens quilômetro a quilômetro.",
      href: "/metas",
      icon: <Target className="w-6 h-6 text-purple-600 dark:text-purple-400" />,
      badge: "Estratégia",
      gradient: "from-purple-500/10 to-pink-500/10 dark:from-purple-500/20 dark:to-pink-500/20",
      accent: "text-purple-600 dark:text-purple-400",
    },
    {
      title: "Simulador Intervalado (HIIT)",
      description: "Planeje sessões de tiros fortes, trote regenerativo, séries e desaquecimento com cálculo da velocidade média real.",
      href: "/intervalado",
      icon: <Flame className="w-6 h-6 text-rose-600 dark:text-rose-400" />,
      badge: "Tiros & HIIT",
      gradient: "from-rose-500/10 to-red-500/10 dark:from-rose-500/20 dark:to-red-500/20",
      accent: "text-rose-600 dark:text-rose-400",
    },
    {
      title: "Histórico de Treinos",
      description: "Diário de bordo local com suas corridas salvas, cálculo em tempo real e exportação dos dados em CSV e JSON.",
      href: "/historico",
      icon: <History className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />,
      badge: "Diário",
      gradient: "from-cyan-500/10 to-blue-500/10 dark:from-cyan-500/20 dark:to-blue-500/20",
      accent: "text-cyan-600 dark:text-cyan-400",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">
      {/* Hero Section */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold shadow-xs">
          <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          PaceLab • O Laboratório de Corrida e Performance
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
          Cálculos Precisos para Cada <span className="text-blue-600 dark:text-blue-400">Quilômetro</span> da Sua Corrida
        </h1>

        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Calcule pace, converta velocidades, analise médias de parciais com gráficos, simule metas para provas, treinos intervalados e prepare-se com precisão para o <strong>TAF</strong>.
        </p>

        {/* CTAs do Hero */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/calculadora"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md transition-all"
          >
            <Calculator className="w-4 h-4" />
            Abrir Calculadora
          </Link>
          <Link
            href="/taf"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
          >
            <Medal className="w-4 h-4 text-amber-500" />
            Simulador de TAF
          </Link>
        </div>
      </div>

      {/* Grade de Ferramentas */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Ferramentas Disponíveis
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            6 calculadoras especializadas
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group block p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all duration-200 relative overflow-hidden"
            >
              {/* Efeito sutil de gradiente de fundo */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${tool.gradient} opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none`}
              />

              <div className="relative space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 shadow-xs border border-slate-100 dark:border-slate-700">
                    {tool.icon}
                  </div>
                  <Badge variant="default">{tool.badge}</Badge>
                </div>

                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                    {tool.title}
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Diferenciais do PaceLab */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-center sm:text-left space-y-1">
          <div className="inline-flex p-2 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 mb-1">
            <Zap className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Validação & Cálculo em Tempo Real
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Resultados calculados instantaneamente com suporte a minutos inteiros como 6 sem precisar digitar 6:00.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-center sm:text-left space-y-1">
          <div className="inline-flex p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 mb-1">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            100% Privado e Seguro
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Todos os seus treinos e metas ficam guardados exclusivamente no seu dispositivo, com exportação fácil em CSV.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-center sm:text-left space-y-1">
          <div className="inline-flex p-2 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 mb-1">
            <Smartphone className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Criado para Mobile & Desktop
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Interface minimalista, responsiva, com suporte completo a tema escuro e navegação rápida por barra inferior no celular.
          </p>
        </div>
      </div>
    </div>
  );
}
