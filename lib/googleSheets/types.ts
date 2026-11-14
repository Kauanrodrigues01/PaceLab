export type SheetTabName = "Log_Treinos" | "Simulados_TAF" | "Perfil_e_Metas";

export type SheetsSyncDirection = "bidirectional" | "push" | "pull";

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
