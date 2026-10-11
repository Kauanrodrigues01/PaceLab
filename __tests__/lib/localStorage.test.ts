import { describe, it, expect, beforeEach } from "vitest";
import { LocalStorageAdapter, HistoryStorageAdapter } from "@/lib/storage/localStorage";
import { HistoryEntry } from "@/types";

describe("LocalStorageAdapter", () => {
  const TEST_KEY = "test_pacelab_history";
  let storage: LocalStorageAdapter<HistoryEntry>;

  const sampleEntry: HistoryEntry = {
    id: "entry-1",
    date: "2026-10-11",
    distanceKm: 5,
    timeSeconds: 1500,
    paceSeconds: 300,
    paceFormatted: "5:00",
    speedKmh: 12,
    notes: "Treino matinal",
    createdAt: "2026-10-11T10:00:00Z",
  };

  beforeEach(() => {
    window.localStorage.clear();
    storage = new LocalStorageAdapter<HistoryEntry>(TEST_KEY);
  });

  it("retorna array vazio quando não há registros", () => {
    expect(storage.getAll()).toEqual([]);
  });

  it("salva e recupera um registro", () => {
    storage.save(sampleEntry);
    const all = storage.getAll();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe("entry-1");
    expect(all[0].distanceKm).toBe(5);
  });

  it("busca registro por id", () => {
    storage.save(sampleEntry);
    const found = storage.getById("entry-1");
    expect(found).toBeDefined();
    expect(found?.paceFormatted).toBe("5:00");

    const notFound = storage.getById("non-existent");
    expect(notFound).toBeUndefined();
  });

  it("atualiza um registro existente", () => {
    storage.save(sampleEntry);
    storage.update("entry-1", { notes: "Notas atualizadas" });

    const updated = storage.getById("entry-1");
    expect(updated?.notes).toBe("Notas atualizadas");
    expect(updated?.distanceKm).toBe(5); // Mantém os outros campos
  });

  it("remove um registro por id", () => {
    storage.save(sampleEntry);
    expect(storage.getAll().length).toBe(1);

    storage.remove("entry-1");
    expect(storage.getAll().length).toBe(0);
  });

  it("limpa todos os registros com clear", () => {
    storage.save(sampleEntry);
    storage.save({ ...sampleEntry, id: "entry-2" });
    expect(storage.getAll().length).toBe(2);

    storage.clear();
    expect(storage.getAll().length).toBe(0);
  });

  it("exporta em formato JSON válido", () => {
    storage.save(sampleEntry);
    const jsonStr = storage.exportJson();
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe("entry-1");
  });

  it("exporta em formato CSV com cabeçalhos", () => {
    storage.save(sampleEntry);
    const csv = storage.exportCsv(
      ["Data", "Distância (km)", "Pace", "Velocidade (km/h)"],
      (item) => [item.date, String(item.distanceKm), item.paceFormatted, String(item.speedKmh)]
    );

    const lines = csv.split("\n");
    expect(lines[0]).toBe("Data,Distância (km),Pace,Velocidade (km/h)");
    expect(lines[1]).toContain("2026-10-11,5,5:00,12");
  });

  it("escapa valores com vírgula no CSV", () => {
    storage.save({
      ...sampleEntry,
      notes: "Treino com amigos, corrida boa",
    });

    const csv = storage.exportCsv(
      ["Data", "Notas"],
      (item) => [item.date, item.notes || ""]
    );

    expect(csv).toContain('"Treino com amigos, corrida boa"');
  });

  it("importa dados de string JSON válida", () => {
    const jsonToImport = JSON.stringify([sampleEntry]);
    const success = storage.importJson(jsonToImport);
    expect(success).toBe(true);
    expect(storage.getAll().length).toBe(1);
    expect(storage.getById("entry-1")?.distanceKm).toBe(5);
  });

  it("remove um registro usando o alias delete", () => {
    storage.save(sampleEntry);
    expect(storage.getAll().length).toBe(1);

    storage.delete("entry-1");
    expect(storage.getAll().length).toBe(0);
  });

  it("HistoryStorageAdapter exporta CSV e JSON formatados para HistoryEntry", () => {
    const histStorage = new HistoryStorageAdapter("test_hist_adapter");
    histStorage.save(sampleEntry);

    const csv = histStorage.exportToCsv();
    expect(csv).toContain("ID,Data,Distancia (km)");
    expect(csv).toContain("entry-1,2026-10-11,5");

    const json = histStorage.exportToJson();
    expect(json).toContain("entry-1");
  });
});

