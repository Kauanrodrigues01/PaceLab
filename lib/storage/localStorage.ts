import { HistoryEntry } from "@/types";

export interface StorageAdapter<T extends { id: string }> {
  getAll(): T[];
  getById(id: string): T | undefined;
  save(item: T): void;
  update(id: string, patch: Partial<T>): void;
  remove(id: string): void;
  clear(): void;
  exportJson(): string;
  exportCsv(headers: string[], rowMapper: (item: T) => string[]): string;
  importJson(jsonString: string): boolean;
}

export class LocalStorageAdapter<T extends { id: string }>
  implements StorageAdapter<T>
{
  private key: string;

  constructor(key: string) {
    this.key = key;
  }

  private isBrowser(): boolean {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  }

  getAll(): T[] {
    if (!this.isBrowser()) return [];
    try {
      const data = window.localStorage.getItem(this.key);
      if (!data) return [];
      return JSON.parse(data) as T[];
    } catch {
      return [];
    }
  }

  getById(id: string): T | undefined {
    return this.getAll().find((item) => item.id === id);
  }

  save(item: T): void {
    if (!this.isBrowser()) return;
    const current = this.getAll();
    const updated = [item, ...current.filter((i) => i.id !== item.id)];
    window.localStorage.setItem(this.key, JSON.stringify(updated));
  }

  update(id: string, patch: Partial<T>): void {
    if (!this.isBrowser()) return;
    const current = this.getAll();
    const index = current.findIndex((i) => i.id === id);
    if (index === -1) return;

    current[index] = { ...current[index], ...patch };
    window.localStorage.setItem(this.key, JSON.stringify(current));
  }

  remove(id: string): void {
    if (!this.isBrowser()) return;
    const current = this.getAll();
    const updated = current.filter((i) => i.id !== id);
    window.localStorage.setItem(this.key, JSON.stringify(updated));
  }

  delete(id: string): void {
    this.remove(id);
  }

  clear(): void {
    if (!this.isBrowser()) return;
    window.localStorage.removeItem(this.key);
  }

  exportJson(): string {
    const data = this.getAll();
    return JSON.stringify(data, null, 2);
  }

  exportCsv(headers: string[], rowMapper: (item: T) => string[]): string {
    const data = this.getAll();
    const headerRow = headers.map(escapeCsvValue).join(",");
    const rows = data.map((item) => rowMapper(item).map(escapeCsvValue).join(","));
    return [headerRow, ...rows].join("\n");
  }

  importJson(jsonString: string): boolean {
    if (!this.isBrowser()) return false;
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed)) {
        window.localStorage.setItem(this.key, JSON.stringify(parsed));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

function escapeCsvValue(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export class HistoryStorageAdapter extends LocalStorageAdapter<HistoryEntry> {
  exportToCsv(): string {
    const headers = [
      "ID",
      "Data",
      "Distancia (km)",
      "Tempo (s)",
      "Pace (s)",
      "Pace",
      "Velocidade (km/h)",
      "Notas",
      "Criado em",
    ];
    return this.exportCsv(headers, (item) => [
      item.id,
      item.date,
      String(item.distanceKm),
      String(item.timeSeconds),
      String(item.paceSeconds),
      item.paceFormatted,
      String(item.speedKmh),
      item.notes || "",
      item.createdAt,
    ]);
  }

  exportToJson(): string {
    return this.exportJson();
  }
}

// Instância padrão para o histórico de corridas
export const historyStorage = new HistoryStorageAdapter("pacelab_history_v1");
