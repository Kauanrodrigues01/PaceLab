import type { SheetsSyncDirection, WeeklyPlanStatus } from "@/types";

export type { SheetsSyncDirection, WeeklyPlanStatus };

export type SheetTabName =
  | "Log_Treinos"
  | "Simulados_TAF"
  | "Perfil_e_Metas"
  | "Plano_Semanal";

export interface WeeklyPlanSyncStats {
  imported: number;
  updated: number;
  removed: number;
  matched: number;
  adapted?: number;
  missed: number;
  pushed: number;
  sheetMissingOrEmpty: boolean;
}

export interface WeeklyPlanStandaloneSyncResult extends WeeklyPlanSyncStats {
  syncedPlans: number;
}

export interface SheetsSyncOptions {
  direction?: SheetsSyncDirection;
  forceFullResync?: boolean;
}

export interface SheetRowWarning {
  tab: SheetTabName;
  rowNumber: number;
  message: string;
}

export interface SheetsSyncReport {
  direction: SheetsSyncDirection;
  forceFullResync: boolean;
  pulledUpdated: number;
  pulledCreated: number;
  pulledLinked: number;
  pushedAppended: number;
  pushedUpdated: number;
  tafPulledUpdated: number;
  tafPulledCreated: number;
  tafPulledLinked: number;
  tafPushedAppended: number;
  tafPushedUpdated: number;
  profileSynced: boolean;
  weeklyPlan?: WeeklyPlanSyncStats;
  skipped: number;
  warnings: SheetRowWarning[];
  durationMs: number;
  syncedAt: string;
}

export interface SheetsSyncStatus {
  configured: boolean;
  error?: string;
  pendingTrainingsCount: number;
  pendingAttemptsCount: number;
  totalPendingCount: number;
}

export interface SafeAutoSyncResult<T = unknown> {
  skipped: boolean;
  ok: boolean;
  syncedAt?: string | null;
  data?: T;
  error?: string;
}
