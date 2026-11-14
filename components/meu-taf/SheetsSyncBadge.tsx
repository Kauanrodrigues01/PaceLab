"use client";

import React from "react";
import { Check, Clock } from "lucide-react";
import { formatSheetsSyncBadge } from "@/lib/sheetsSyncUi";

interface SheetsSyncBadgeProps {
  syncedToSheetsAt?: string | null;
}

/**
 * Selo discreto exibido em cards de treino e simulado TAF para indicar
 * se o registro já foi sincronizado com a planilha Google Sheets.
 */
export function SheetsSyncBadge({ syncedToSheetsAt }: SheetsSyncBadgeProps) {
  const { isSynced, label, title } = formatSheetsSyncBadge(syncedToSheetsAt);

  return (
    <span
      data-testid="sheets-sync-badge"
      data-synced={isSynced ? "true" : "false"}
      title={title}
      className={
        isSynced
          ? "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/50 text-emerald-300 border border-emerald-500/30"
          : "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800/70 text-[#8E9BB0] border border-slate-700/80"
      }
    >
      {isSynced ? (
        <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
      ) : (
        <Clock className="w-3 h-3 text-[#8E9BB0]" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
