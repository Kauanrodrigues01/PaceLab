import { describe, it, expect } from "vitest";
import {
  inferSuggestedActivityTypeForUnknown,
  resolveActivityTypeSuggestions,
  resolveDefaultActivityTypeFromPreview,
} from "@/lib/activityParser/activitySuggestion";

describe("lib/activityParser/activitySuggestion — Inferência Corrida vs Caminhada", () => {
  it("respeita sourceActivityKind explícito ('walk' e 'run') sem rebaixar nem restringe incorretamente", () => {
    const walkRes = resolveActivityTypeSuggestions({
      sourceActivityKind: "walk",
      speedKmh: 6.2,
    });
    expect(walkRes.suggestedActivityType).toBe("caminhada");
    expect(walkRes.allowedActivityTypes).toEqual(["caminhada"]);

    const runRes = resolveActivityTypeSuggestions({
      sourceActivityKind: "run",
      speedKmh: 11.4,
    });
    expect(runRes.suggestedActivityType).toBe("corrida_continua");
    expect(runRes.allowedActivityTypes).toContain("rodagem_leve");
    expect(runRes.allowedActivityTypes).not.toContain("caminhada");
  });

  it("infere 'caminhada' vs 'corrida_continua' por palavras-chave, velocidade e cadência quando sourceActivityKind='unknown'", () => {
    // Palavra-chave explícita sem métricas numéricas
    expect(
      inferSuggestedActivityTypeForUnknown({
        fileNames: ["Caminhada_no_Ibirapuera.gpx"],
      })
    ).toBe("caminhada");

    expect(
      inferSuggestedActivityTypeForUnknown({
        name: "Rodagem leve 6k",
        speedKmh: 9.8,
      })
    ).toBe("corrida_continua");

    // Baixa velocidade sem palavras-chave
    expect(
      inferSuggestedActivityTypeForUnknown({
        distanceKm: 3.0,
        durationSeconds: 1800, // 6.0 km/h
      })
    ).toBe("caminhada");

    // Zona de transição (6.8..7.5 km/h) desempatada por cadência e velocidade
    expect(
      inferSuggestedActivityTypeForUnknown({
        speedKmh: 7.1,
        avgCadence: 132,
      })
    ).toBe("caminhada");

    expect(
      inferSuggestedActivityTypeForUnknown({
        speedKmh: 6.5,
        avgCadence: 158,
      })
    ).toBe("corrida_continua");

    // Sem nenhuma dica nem métricas -> null na API, fallback seguro no helper de UI/Lote
    const apiEmpty = resolveActivityTypeSuggestions({
      sourceActivityKind: "unknown",
    });
    expect(apiEmpty.suggestedActivityType).toBeNull();
    expect(apiEmpty.allowedActivityTypes).toContain("caminhada");

    expect(
      resolveDefaultActivityTypeFromPreview(
        {
          sourceActivityKind: "unknown",
          suggestedActivityType: null,
          name: null,
          suggestedNotes: "",
          speedKmh: 5.2,
          distanceKm: 2.6,
          durationSeconds: 1800,
          avgCadence: null,
        },
        ["123456.fit"]
      )
    ).toBe("caminhada");

    expect(resolveDefaultActivityTypeFromPreview(null)).toBe("corrida_continua");
  });
});
