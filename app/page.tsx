import React from "react";
import Link from "next/link";
import {
  Calculator,
  Medal,
  Target,
  Flame,
  History,
  ArrowRight,
  Sparkles,
  Zap,
  ShieldCheck,
  Smartphone,
  Trophy,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { AthleteActiveStatusCard } from "@/components/home/AthleteActiveStatusCard";
import { QuickPaceWidget } from "@/components/home/QuickPaceWidget";

export default function Home() {
  const tools = [
    {
      title: "Calculadora de Pace",
      description: "Calcule ritmo (min/km), velocidade média (km/h), tempo total ou distância com atalhos rápidos.",
      href: "/calculadora",
      icon: <Calculator className="w-6 h-6 text-[#B7F34A]" />,
      badge: "Core",
      gradient: "from-[#B7F34A]/15 to-emerald-500/10",
      accent: "text-[#B7F34A]",
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
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#B7F34A]/10 border border-[#B7F34A]/30 text-[#B7F34A] text-xs font-bold shadow-xs">
          <Sparkles className="w-4 h-4 text-[#B7F34A]" />
          PaceLab • O Laboratório de Corrida e Performance
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-[#FFFFFF] tracking-tight leading-tight">
          Cálculos Precisos para Cada <span className="text-[#B7F34A]">Quilômetro</span> da Sua Corrida
        </h1>

        <p className="text-sm sm:text-base text-[#8E9BB0] max-w-2xl mx-auto leading-relaxed">
          Calcule pace, converta velocidades, acompanhe seu diário de treinos semanais, simule metas para provas, treinos intervalados e prepare-se com precisão para o <strong>TAF</strong>.
        </p>

        {/* CTAs do Hero */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/meu-taf"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm bg-[#B7F34A] hover:bg-[#a3db3f] text-[#0B1020] shadow-md hover:shadow-lg transition-all"
          >
            <Trophy className="w-4 h-4 text-[#0B1020]" />
            Meu TAF (12 Min)
          </Link>
          <Link
            href="/treinos"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border border-[#1E2942] bg-[#131A2E] text-[#FFFFFF] hover:bg-[#1E2942] hover:border-[#B7F34A]/40 transition-all"
          >
            <Activity className="w-4 h-4 text-[#B7F34A]" />
            Diário de Treinos
          </Link>
          <Link
            href="/calculadora"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border border-[#1E2942] bg-[#131A2E] text-[#FFFFFF] hover:bg-[#1E2942] hover:border-[#B7F34A]/40 transition-all"
          >
            <Calculator className="w-4 h-4 text-[#8E9BB0]" />
            Calculadoras
          </Link>
        </div>
      </div>

      {/* Widget de Cálculo Rápido no Hero */}
      <QuickPaceWidget />

      {/* Card de Status Ativo do Atleta (TAF, Peso, Calorias e Prova) */}
      <AthleteActiveStatusCard />

      {/* Card Especial de Destaque do Meu TAF (Fase G) */}
      <div
        data-testid="home-meu-taf-card"
        className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#131A2E] via-[#16223D] to-[#1E2942] text-[#FFFFFF] p-6 sm:p-8 shadow-xl border border-[#B7F34A]/30"
      >
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#B7F34A]/15 backdrop-blur-md text-[#B7F34A] border border-[#B7F34A]/30">
                <Trophy className="w-3.5 h-3.5 text-[#B7F34A]" />
                Módulo Especial de Preparação
              </span>
              <span className="text-[11px] font-semibold text-[#8E9BB0] bg-[#0B1020]/60 px-2.5 py-0.5 rounded-full border border-[#1E2942]">
                Guarda Municipal & Concursos
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-black tracking-tight text-[#FFFFFF]">
              Meu TAF — Preparação Física para 12 Minutos
            </h3>

            <p className="text-xs sm:text-sm text-[#8E9BB0] leading-relaxed">
              Painel completo com simulados de 12 minutos, parciais de 400m na pista, recordes pessoais,
              5 gráficos interativos de evolução e comparador de períodos rumo aos 2.300 m.
            </p>
          </div>

          <div className="shrink-0 flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2.5">
            <Link
              href="/meu-taf"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-black text-sm bg-[#B7F34A] hover:bg-[#a3db3f] text-[#0B1020] shadow-lg hover:shadow-xl transition-all group w-full sm:w-auto"
            >
              <span>Acessar Meu TAF</span>
              <ArrowRight className="w-4 h-4 text-[#0B1020] group-hover:translate-x-1 transition-transform" />
            </Link>
            <span className="text-[11px] text-[#8E9BB0] font-medium">
              Offline First • PostgreSQL Prisma
            </span>
          </div>
        </div>

        {/* Grafismo decorativo de fundo */}
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-[#B7F34A]/5 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Grade de Ferramentas */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold text-[#FFFFFF] tracking-tight">
            Ferramentas Disponíveis
          </h2>
          <span className="text-xs text-[#8E9BB0]">
            6 calculadoras especializadas
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group block p-6 rounded-2xl bg-[#131A2E] border border-[#1E2942] shadow-xs hover:shadow-lg hover:border-[#B7F34A]/50 transition-all duration-200 relative overflow-hidden"
            >
              {/* Efeito sutil de gradiente de fundo */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${tool.gradient} opacity-20 group-hover:opacity-40 transition-opacity pointer-events-none`}
              />

              <div className="relative space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-3 rounded-xl bg-[#0B1020] shadow-xs border border-[#1E2942]">
                    {tool.icon}
                  </div>
                  <Badge variant="outline" className="border-[#1E2942] text-[#8E9BB0]">{tool.badge}</Badge>
                </div>

                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-[#FFFFFF] group-hover:text-[#B7F34A] transition-colors flex items-center gap-1.5">
                    {tool.title}
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-[#B7F34A]" />
                  </h3>
                  <p className="text-xs text-[#8E9BB0] leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Diferenciais do PaceLab */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#1E2942]">
        <div className="p-4 rounded-xl bg-[#131A2E] border border-[#1E2942] text-center sm:text-left space-y-1">
          <div className="inline-flex p-2 rounded-lg bg-[#B7F34A]/10 text-[#B7F34A] mb-1">
            <Zap className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-[#FFFFFF]">
            Validação & Cálculo em Tempo Real
          </h4>
          <p className="text-xs text-[#8E9BB0]">
            Resultados calculados instantaneamente com suporte a minutos inteiros como 6 sem precisar digitar 6:00.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#131A2E] border border-[#1E2942] text-center sm:text-left space-y-1">
          <div className="inline-flex p-2 rounded-lg bg-[#B7F34A]/10 text-[#B7F34A] mb-1">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-[#FFFFFF]">
            100% Privado e Seguro
          </h4>
          <p className="text-xs text-[#8E9BB0]">
            Todos os seus treinos e metas ficam guardados exclusivamente no seu dispositivo, com exportação fácil em CSV.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#131A2E] border border-[#1E2942] text-center sm:text-left space-y-1">
          <div className="inline-flex p-2 rounded-lg bg-[#B7F34A]/10 text-[#B7F34A] mb-1">
            <Smartphone className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-[#FFFFFF]">
            Criado para Mobile & Desktop
          </h4>
          <p className="text-xs text-[#8E9BB0]">
            Interface minimalista, responsiva, com suporte completo a tema escuro e navegação rápida por barra inferior no celular.
          </p>
        </div>
      </div>
    </div>
  );
}
