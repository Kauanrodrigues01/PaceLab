"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Dumbbell,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TrainingDetailModal } from "@/components/treinos/TrainingDetailModal";
import { tafService } from "@/lib/services/tafService";
import {
  CROSS_PAGE_SHEETS_CACHE_KEYS,
  clearCrossPageSheetsCaches,
  formatSheetsSyncReportSummary,
  getSheetsSyncErrorMessage,
} from "@/lib/sheetsSyncUi";
import { formatTime } from "@/lib/formatting/time";
import {
  getFortalezaWeekBounds,
  isSundayPostRolloverFortaleza,
  shiftFortalezaDays,
  toFortalezaDateKey,
} from "@/lib/math/weeklyAdherence";
import {
  ACTIVITY_LABELS,
  type ActivityType,
  type TrainingSession,
  type WeeklyPlanData,
  type WeeklyPlanItemDto,
  type WeeklyPlanStatus,
} from "@/types";

export interface WeeklyAdherenceCardProps {
  refreshTrigger?: number;
  onOpenSession?: (session: TrainingSession) => void;
  onEditSession?: (session: TrainingSession) => void;
  onSyncSheets?: () => void | Promise<void>;
  isSyncingSheets?: boolean;
  className?: string;
}

const STATUS_META: Record<
  WeeklyPlanStatus,
  { label: string; variant: BadgeVariant }
> = {
  Concluído: { label: "Concluído", variant: "success" },
  Adaptado: { label: "Adaptado", variant: "adapted" },
  Parcial: { label: "Parcial", variant: "warning" },
  Planejado: { label: "Planejado", variant: "info" },
  Perdido: { label: "Perdido", variant: "danger" },
};

function formatShortDateBr(dateKeyOrIso: string): string {
  const key = toFortalezaDateKey(dateKeyOrIso) ?? dateKeyOrIso;
  const parts = key.split("-");
  if (parts.length !== 3) return key;
  return `${parts[2]}/${parts[1]}`;
}

function formatSafeDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return formatTime(seconds);
}

function hasValidPace(session: TrainingSession): boolean {
  return (
    typeof session.paceFormatted === "string" &&
    session.paceFormatted.trim().length > 0 &&
    typeof session.paceSeconds === "number" &&
    Number.isFinite(session.paceSeconds) &&
    session.paceSeconds > 0
  );
}

function hasValidTargetPace(pace: string | null | undefined): pace is string {
  if (typeof pace !== "string") return false;
  const trimmed = pace.trim();
  if (!trimmed) return false;
  return !["-", "—", "n/a", "null"].includes(trimmed.toLowerCase());
}

function formatSafeDistanceKm(distanceKm: number): string {
  return Number.isFinite(distanceKm) && distanceKm >= 0
    ? distanceKm.toFixed(2)
    : "0.00";
}

function formatTargetKm(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return "0 km";
  return Number.isInteger(distanceKm)
    ? `${distanceKm} km`
    : `${distanceKm.toFixed(2)} km`;
}

function getActivityLabel(activityType: string): string {
  return ACTIVITY_LABELS[activityType as ActivityType] ?? activityType;
}

function getProgressBarColor(adherencePercent: number): string {
  if (adherencePercent >= 80) return "bg-[#B7F34A]";
  if (adherencePercent >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function readWeeklyPlanCache(expectedWeekStart: string): WeeklyPlanData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CROSS_PAGE_SHEETS_CACHE_KEYS.weeklyPlan);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeeklyPlanData;
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.weekStart === expectedWeekStart &&
      parsed.isCurrentWeek === true &&
      Array.isArray(parsed.items) &&
      parsed.summary &&
      typeof parsed.summary.adapted === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeWeeklyPlanCache(payload: WeeklyPlanData): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      CROSS_PAGE_SHEETS_CACHE_KEYS.weeklyPlan,
      JSON.stringify(payload)
    );
  } catch {
    // Ignore quota errors
  }
}

interface SessionTriggerCardProps {
  session: TrainingSession;
  onSelect: (session: TrainingSession) => void;
  prefixDate?: boolean;
  ariaLabel: string;
}

function SessionTriggerCard({
  session,
  onSelect,
  prefixDate = false,
  ariaLabel,
}: SessionTriggerCardProps) {
  const showPace = hasValidPace(session);

  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      aria-label={ariaLabel}
      className="w-full text-left rounded-xl border border-emerald-900/60 bg-emerald-950/25 hover:bg-emerald-950/45 px-3 py-2.5 transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7F34A]"
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
          {prefixDate && (
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#0B1020] text-[#8E9BB0] border border-[#1E2942] shrink-0">
              {formatShortDateBr(session.sessionDate)}
            </span>
          )}
          <span className="text-xs sm:text-sm font-semibold text-white break-words">
            {getActivityLabel(session.activityType)}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B7F34A] shrink-0 group-hover:translate-x-0.5 transition-transform">
          Detalhes
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8E9BB0] tabular-nums">
        <span className="font-semibold text-[#E2E8F0]">
          {formatSafeDistanceKm(session.distanceKm)} km
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" aria-hidden="true" />
          {formatSafeDuration(session.durationSeconds)}
        </span>
        {showPace && <span>{session.paceFormatted} /km</span>}
      </div>
    </button>
  );
}

interface ExtraSessionsBlockProps {
  extraSessions: TrainingSession[];
  totalDistanceKm: number;
  onSelectSession: (session: TrainingSession) => void;
  emptyPlanContext?: boolean;
}

function ExtraSessionsBlock({
  extraSessions,
  totalDistanceKm,
  onSelectSession,
  emptyPlanContext = false,
}: ExtraSessionsBlockProps) {
  if (extraSessions.length === 0) return null;

  return (
    <div
      data-testid="weekly-extra-sessions"
      className="pt-4 border-t border-[#1E2942]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#8E9BB0] inline-flex items-center gap-1.5">
          <Dumbbell className="w-3.5 h-3.5 text-[#B7F34A]" aria-hidden="true" />
          {emptyPlanContext
            ? "Treinos registrados na semana"
            : "Treinos extras não prescritos"}
        </span>
        <Badge variant="lime" className="tabular-nums">
          {extraSessions.length}{" "}
          {extraSessions.length === 1 ? "sessão" : "sessões"} ·{" "}
          {formatSafeDistanceKm(totalDistanceKm)} km
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {extraSessions.map((session) => (
          <SessionTriggerCard
            key={session.id}
            session={session}
            prefixDate
            onSelect={onSelectSession}
            ariaLabel={`Abrir detalhes do treino extra de ${formatShortDateBr(session.sessionDate)}`}
          />
        ))}
      </div>
    </div>
  );
}

interface PlanDayRowProps {
  item: WeeklyPlanItemDto;
  onSelectSession: (session: TrainingSession) => void;
}

function PlanDayRow({ item, onSelectSession }: PlanDayRowProps) {
  const statusMeta = STATUS_META[item.status] ?? STATUS_META.Planejado;
  const adaptationReasonText =
    item.status === "Adaptado"
      ? item.adaptationReason?.trim() ||
        (item.adaptationReasons && item.adaptationReasons.length > 0
          ? item.adaptationReasons.join(" · ")
          : "")
      : "";

  return (
    <div
      data-testid={`weekly-plan-item-${item.id}`}
      className="rounded-2xl border border-[#1E2942] bg-[#0B1020]/70 p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wide text-[#8E9BB0] tabular-nums">
            {item.dayOfWeek} · {formatShortDateBr(item.plannedDate)}
          </span>
          <span className="text-sm font-semibold text-white break-words">
            {getActivityLabel(item.activityType)}
          </span>
        </div>
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
      </div>

      {adaptationReasonText && (
        <div
          data-testid={`weekly-plan-adaptation-reason-${item.id}`}
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-indigo-700/60 bg-indigo-950/40 px-2.5 py-1 text-xs font-medium text-indigo-200"
        >
          <SlidersHorizontal
            className="w-3.5 h-3.5 text-indigo-300 shrink-0"
            aria-hidden="true"
          />
          <span>{adaptationReasonText}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Coluna Planejado */}
        <div className="rounded-xl border border-[#1E2942] bg-[#131A2E]/90 px-3 py-2.5 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#8E9BB0] mb-1">
            Planejado
          </p>
          {item.isRestDay ? (
            <p className="text-xs sm:text-sm text-[#E2E8F0]">
              {item.description?.trim() || "Dia de descanso / recuperação"}
            </p>
          ) : (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm font-semibold text-white tabular-nums">
                {item.targetDistanceKm !== null && (
                  <span>{formatTargetKm(item.targetDistanceKm)}</span>
                )}
                {hasValidTargetPace(item.targetPaceFormatted) && (
                  <span className="text-[#8E9BB0] font-medium">
                    Alvo: {item.targetPaceFormatted} /km
                  </span>
                )}
                {item.targetDistanceKm === null &&
                  !hasValidTargetPace(item.targetPaceFormatted) && (
                    <span>Treino prescrito</span>
                  )}
              </div>
              {item.description && (
                <p className="text-xs text-[#8E9BB0] break-words">
                  {item.description}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Coluna Realizado */}
        <div className="min-w-0 flex flex-col justify-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#8E9BB0] mb-1 md:sr-only">
            Realizado
          </p>
          {item.matchedSession ? (
            <SessionTriggerCard
              session={item.matchedSession}
              onSelect={onSelectSession}
              ariaLabel={`Abrir detalhes do treino realizado de ${item.dayOfWeek}`}
            />
          ) : item.isRestDay && item.status === "Concluído" ? (
            <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/15 px-3 py-2.5 flex items-center gap-2 text-xs sm:text-sm text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Descanso cumprido</span>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#1E2942] px-3 py-2.5 text-xs text-[#8E9BB0]">
              {item.status === "Perdido"
                ? "Nenhum treino registrado neste dia."
                : "Aguardando realização."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WeeklyAdherenceCard({
  refreshTrigger = 0,
  onOpenSession,
  onEditSession,
  onSyncSheets,
  isSyncingSheets = false,
  className = "",
}: WeeklyAdherenceCardProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState<string>(
    () => getFortalezaWeekBounds().weekStart
  );
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [data, setData] = useState<WeeklyPlanData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState<number>(0);
  const [isInternalSyncing, setIsInternalSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [internalModalTraining, setInternalModalTraining] =
    useState<TrainingSession | null>(null);
  const latestRequestRef = useRef<number>(0);
  const currentWeekStartRef = useRef<string>(currentWeekStart);
  const lastTodayKeyRef = useRef<string>(toFortalezaDateKey(new Date()));
  const lastRolloverRef = useRef<boolean>(isSundayPostRolloverFortaleza());

  // Recalcula a semana/dia ativo ao voltar o foco para a aba (ex.: virada de dia ou domingo 22h)
  useEffect(() => {
    const checkDateRollover = () => {
      const now = new Date();
      const freshWeekStart = getFortalezaWeekBounds(now).weekStart;
      const freshTodayKey = toFortalezaDateKey(now);
      const freshRollover = isSundayPostRolloverFortaleza(now);

      if (
        freshWeekStart !== currentWeekStartRef.current ||
        freshTodayKey !== lastTodayKeyRef.current ||
        freshRollover !== lastRolloverRef.current
      ) {
        currentWeekStartRef.current = freshWeekStart;
        lastTodayKeyRef.current = freshTodayKey;
        lastRolloverRef.current = freshRollover;
        setCurrentWeekStart(freshWeekStart);
        clearCrossPageSheetsCaches({ includeGoal: false });
        setRetryCounter((c) => c + 1);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkDateRollover();
      }
    };

    window.addEventListener("focus", checkDateRollover);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", checkDateRollover);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++latestRequestRef.current;

    const isAutoDefaultWeek = selectedWeekStart === null;
    const canUseCache =
      isAutoDefaultWeek &&
      refreshTrigger === 0 &&
      retryCounter === 0 &&
      !isSundayPostRolloverFortaleza();
    const cached = canUseCache ? readWeeklyPlanCache(currentWeekStart) : null;

    if (cached) {
      setData(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    const fetchWeeklyPlan = async () => {
      try {
        const result = await tafService.getWeeklyPlan(
          selectedWeekStart ?? undefined
        );
        if (cancelled || latestRequestRef.current !== requestId) return;
        setData(result);
        setErrorMessage(null);
        setIsLoading(false);
        if (result.isCurrentWeek) {
          writeWeeklyPlanCache(result);
        }
      } catch {
        if (cancelled || latestRequestRef.current !== requestId) return;
        setIsLoading(false);
        setErrorMessage("Não foi possível carregar o plano semanal no momento.");
      }
    };

    void fetchWeeklyPlan();

    return () => {
      cancelled = true;
    };
  }, [selectedWeekStart, currentWeekStart, refreshTrigger, retryCounter]);

  const visibleData =
    data &&
    (selectedWeekStart === null
      ? Boolean(data.isCurrentWeek) && data.weekStart >= currentWeekStart
      : data.weekStart === selectedWeekStart)
      ? data
      : null;

  const effectiveWeekStart =
    selectedWeekStart ?? visibleData?.weekStart ?? currentWeekStart;

  const activeAnchorWeekStart =
    visibleData?.isCurrentWeek && visibleData.weekStart > currentWeekStart
      ? visibleData.weekStart
      : currentWeekStart;

  const maxAllowedNextWeek = useMemo(
    () => shiftFortalezaDays(activeAnchorWeekStart, 7),
    [activeAnchorWeekStart]
  );

  const fallbackBounds = useMemo(
    () => getFortalezaWeekBounds(effectiveWeekStart),
    [effectiveWeekStart]
  );

  const isCurrentWeek = visibleData
    ? Boolean(visibleData.isCurrentWeek)
    : selectedWeekStart === null ||
      (selectedWeekStart === currentWeekStart && !isSundayPostRolloverFortaleza());
  const weekLabel = visibleData?.weekLabel ?? fallbackBounds.label;
  const headerWeekTitle = isCurrentWeek
    ? `Semana Atual (${weekLabel})`
    : `Semana (${weekLabel})`;

  const canGoNext =
    effectiveWeekStart < maxAllowedNextWeek ||
    Boolean(visibleData?.hasNextPlannedWeek);

  const handlePrevWeek = () => {
    setSelectedWeekStart(shiftFortalezaDays(effectiveWeekStart, -7));
  };

  const handleNextWeek = () => {
    if (!canGoNext) return;
    setSelectedWeekStart(shiftFortalezaDays(effectiveWeekStart, 7));
  };

  const handleResetToCurrentWeek = () => {
    setSelectedWeekStart(null);
  };

  const isSyncing = isSyncingSheets || isInternalSyncing;

  const handleSyncClick = async () => {
    if (isSyncing) return;
    if (onSyncSheets) {
      setIsInternalSyncing(true);
      try {
        await onSyncSheets();
      } finally {
        setIsInternalSyncing(false);
      }
      return;
    }

    setIsInternalSyncing(true);
    setSyncFeedback(null);
    try {
      const report = await tafService.syncGoogleSheets({
        direction: "bidirectional",
        forceFullResync: false,
      });
      clearCrossPageSheetsCaches();
      setSyncFeedback({
        type: "success",
        message: formatSheetsSyncReportSummary(report),
      });
      setRetryCounter((c) => c + 1);
    } catch (err) {
      setSyncFeedback({
        type: "error",
        message: getSheetsSyncErrorMessage(
          err,
          "Erro ao sincronizar planilha Google Sheets."
        ),
      });
    } finally {
      setIsInternalSyncing(false);
    }
  };

  const handleSelectSession = (session: TrainingSession) => {
    if (onOpenSession) {
      onOpenSession(session);
      return;
    }
    setInternalModalTraining(session);
  };

  const summary = visibleData?.summary;
  const rolling = visibleData?.rollingFourWeeksAverage;
  const rollingDelta =
    rolling &&
    rolling.averagePercent !== null &&
    summary &&
    summary.adherencePercent !== null
      ? Number((summary.adherencePercent - rolling.averagePercent).toFixed(1))
      : null;

  return (
    <section
      data-testid="weekly-adherence-card"
      className={`rounded-3xl border border-[#1E2942] bg-[#131A2E] p-5 sm:p-6 shadow-sm ${className}`}
    >
      {/* Header & Navegação Semanal */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-[#1E2942]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#B7F34A]/15 text-[#B7F34A] shrink-0">
              <Target className="w-4 h-4" aria-hidden="true" />
            </span>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Plano Semanal &amp; Aderência
            </h2>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-[#8E9BB0] inline-flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{headerWeekTitle}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleSyncClick()}
            disabled={isSyncing}
            aria-busy={isSyncing}
            icon={
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            }
            aria-label={isSyncing ? "Sincronizando Planilha" : "Sincronizar Planilha"}
            data-testid="weekly-sync-btn"
          >
            {isSyncing ? "Sincronizando..." : "Sincronizar"}
          </Button>
          {!isCurrentWeek && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetToCurrentWeek}
              icon={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
              data-testid="weekly-current-btn"
            >
              Semana Atual
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrevWeek}
            icon={<ChevronLeft className="w-4 h-4" aria-hidden="true" />}
            aria-label="Semana Anterior"
            data-testid="weekly-prev-btn"
          >
            Semana Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleNextWeek}
            disabled={!canGoNext}
            icon={<ChevronRight className="w-4 h-4" aria-hidden="true" />}
            iconPosition="right"
            aria-label="Próxima Semana"
            data-testid="weekly-next-btn"
          >
            Próxima
          </Button>
        </div>
      </div>

      {syncFeedback && (
        <div
          role={syncFeedback.type === "error" ? "alert" : "status"}
          data-testid="weekly-sync-feedback"
          className={`mt-3 rounded-xl border px-3 py-2 text-xs flex items-center justify-between gap-2 ${
            syncFeedback.type === "error"
              ? "border-amber-900/60 bg-amber-950/30 text-amber-200"
              : "border-emerald-900/60 bg-emerald-950/30 text-emerald-200"
          }`}
        >
          <span>{syncFeedback.message}</span>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            className="font-semibold underline shrink-0 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7F34A]"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Corpo do Card */}
      <div className="pt-4">
        {isLoading && !visibleData ? (
          <div
            data-testid="weekly-adherence-loading"
            className="space-y-3 animate-pulse"
          >
            <div className="h-5 w-48 rounded bg-[#1E2942]" />
            <div className="h-3 w-full rounded-full bg-[#1E2942]" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="h-20 rounded-2xl bg-[#0B1020]" />
              <div className="h-20 rounded-2xl bg-[#0B1020]" />
            </div>
          </div>
        ) : errorMessage && !visibleData ? (
          <div
            data-testid="weekly-adherence-error"
            className="rounded-2xl border border-[#1E2942] bg-[#0B1020] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 text-sm text-[#8E9BB0]">
              <AlertCircle
                className="w-4 h-4 mt-0.5 text-amber-500 shrink-0"
                aria-hidden="true"
              />
              <span>{errorMessage}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRetryCounter((c) => c + 1)}
              icon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Tentar novamente
            </Button>
          </div>
        ) : visibleData && visibleData.summary.totalPlanned === 0 ? (
          /* Estado 2: Semana sem plano prescrito */
          <div data-testid="weekly-adherence-empty" className="space-y-4">
            <div className="rounded-2xl border border-dashed border-[#1E2942] bg-[#0B1020]/60 p-5 text-center sm:text-left">
              <h3 className="text-sm sm:text-base font-semibold text-white">
                Nenhum plano semanal registrado para este período
              </h3>
              <p className="mt-1.5 text-xs sm:text-sm text-[#8E9BB0] max-w-2xl">
                Peça ao seu Treinador IA no Gemini para prescrever a semana na
                aba Plano_Semanal e clique em Sincronizar Planilha.
              </p>
            </div>

            <ExtraSessionsBlock
              extraSessions={visibleData.extraSessions}
              totalDistanceKm={visibleData.extraSummary.totalDistanceKm}
              onSelectSession={handleSelectSession}
              emptyPlanContext
            />
          </div>
        ) : visibleData && summary ? (
          /* Estado 1: Semana com plano prescrito */
          <div data-testid="weekly-adherence-populated" className="space-y-4">
            {errorMessage && (
              <div
                role="alert"
                className="rounded-xl border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-300 flex items-center justify-between gap-2"
              >
                <span>{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setRetryCounter((c) => c + 1)}
                  className="font-semibold underline cursor-pointer"
                >
                  Atualizar
                </button>
              </div>
            )}

            {/* Resumo de Aderência + Média Móvel 4 Semanas */}
            <div className="rounded-2xl border border-[#1E2942] bg-[#0B1020]/80 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <span
                    data-testid="weekly-adherence-percent"
                    className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums"
                  >
                    {summary.adherencePercent ?? 0}%
                  </span>
                  <span className="text-xs sm:text-sm text-[#8E9BB0]">
                    de aderência na semana ({summary.completed} concluído
                    {summary.completed === 1 ? "" : "s"}
                    {summary.adapted > 0
                      ? ` · ${summary.adapted} adaptado${summary.adapted === 1 ? "" : "s"}`
                      : ""}
                    {summary.partial > 0
                      ? ` · ${summary.partial} ${summary.partial === 1 ? "parcial" : "parciais"}`
                      : ""}
                    {summary.planned > 0
                      ? ` · ${summary.planned} pendente${summary.planned === 1 ? "" : "s"}`
                      : ""}
                    {summary.missed > 0
                      ? ` · ${summary.missed} perdido${summary.missed === 1 ? "" : "s"}`
                      : ""}
                    )
                  </span>
                </div>

                {rolling && rolling.averagePercent !== null && (
                  <div
                    data-testid="weekly-rolling-average"
                    className="flex items-center gap-2 flex-wrap"
                  >
                    <Badge variant="default" className="tabular-nums">
                      Média {rolling.weeksCount} sem: {rolling.averagePercent}%
                    </Badge>
                    {rollingDelta !== null && (
                      <Badge
                        variant={
                          rollingDelta > 0
                            ? "success"
                            : rollingDelta < 0
                              ? "warning"
                              : "default"
                        }
                        className="tabular-nums"
                      >
                        {rollingDelta > 0 ? (
                          <TrendingUp className="w-3 h-3" aria-hidden="true" />
                        ) : rollingDelta < 0 ? (
                          <TrendingDown className="w-3 h-3" aria-hidden="true" />
                        ) : null}
                        {rollingDelta > 0
                          ? `+${rollingDelta}% vs. média`
                          : rollingDelta < 0
                            ? `${rollingDelta}% vs. média`
                            : "Na média"}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              <div
                role="progressbar"
                aria-label="Aderência ao plano semanal"
                aria-valuenow={summary.adherencePercent ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2.5 w-full overflow-hidden rounded-full bg-[#1E2942]"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${getProgressBarColor(
                    summary.adherencePercent ?? 0
                  )}`}
                  style={{
                    width: `${Math.min(100, Math.max(0, summary.adherencePercent ?? 0))}%`,
                  }}
                />
              </div>
            </div>

            {/* Lista de Itens Planejado x Realizado */}
            <div className="space-y-2.5">
              {visibleData.items.map((item) => (
                <PlanDayRow
                  key={item.id}
                  item={item}
                  onSelectSession={handleSelectSession}
                />
              ))}
            </div>

            {/* Rodapé de Extras */}
            <ExtraSessionsBlock
              extraSessions={visibleData.extraSessions}
              totalDistanceKm={visibleData.extraSummary.totalDistanceKm}
              onSelectSession={handleSelectSession}
            />
          </div>
        ) : null}
      </div>

      {/* Modal Interno quando o pai não fornece onOpenSession */}
      {!onOpenSession && (
        <TrainingDetailModal
          training={internalModalTraining}
          isOpen={Boolean(internalModalTraining)}
          onClose={() => setInternalModalTraining(null)}
          onEdit={onEditSession}
        />
      )}
    </section>
  );
}
