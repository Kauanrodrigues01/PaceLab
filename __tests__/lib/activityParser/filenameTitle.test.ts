import { describe, it, expect } from "vitest";
import {
  extractActivityTitleFromFilename,
  pickPreferredActivityTitleFromFileNames,
} from "@/lib/activityParser";

describe("lib/activityParser/filenameTitle — Extração de título pelo nome do arquivo", () => {
  it("converte underscores em espaços, remove extensão .fit/.gpx e preserva acentos e pontos no meio", () => {
    expect(extractActivityTitleFromFilename("Caminhada_leve.fit")).toBe(
      "Caminhada leve"
    );
    expect(extractActivityTitleFromFilename("Treino_intervalado__pista.FIT")).toBe(
      "Treino intervalado pista"
    );
    expect(
      extractActivityTitleFromFilename("Rodagem_10.5km_São_Paulo.GPX")
    ).toBe("Rodagem 10.5km São Paulo");
  });

  it("remove prefixos de diretório Windows e Unix mantendo apenas o nome base", () => {
    expect(
      extractActivityTitleFromFilename("C:\\Users\\kauan\\Downloads\\Tiros_400m.fit")
    ).toBe("Tiros 400m");
    expect(
      extractActivityTitleFromFilename("/tmp/uploads/Voltando_do_parque.gpx")
    ).toBe("Voltando do parque");
  });

  it("ignora IDs puramente numéricos e entradas vazias ou inválidas", () => {
    expect(extractActivityTitleFromFilename("1234567890.fit")).toBeNull();
    expect(extractActivityTitleFromFilename("987654321.GPX")).toBeNull();
    expect(extractActivityTitleFromFilename("00123.fit")).toBeNull();
    expect(extractActivityTitleFromFilename("123_456.fit")).toBeNull();
    expect(extractActivityTitleFromFilename("2026_04_15_0930.gpx")).toBeNull();
    expect(extractActivityTitleFromFilename("")).toBeNull();
    expect(extractActivityTitleFromFilename("   ")).toBeNull();
    expect(extractActivityTitleFromFilename(".fit")).toBeNull();
    expect(extractActivityTitleFromFilename("___.gpx")).toBeNull();
    expect(extractActivityTitleFromFilename(null)).toBeNull();
    expect(extractActivityTitleFromFilename(undefined)).toBeNull();
  });

  it("sanitiza tags HTML/scripts potencialmente maliciosas no nome do arquivo", () => {
    expect(
      extractActivityTitleFromFilename("<script>alert(1)</script>Treino_seguro.fit")
    ).toBe("Treino seguro");
    expect(
      extractActivityTitleFromFilename("/tmp/uploads/<script>alert(1)</script>Treino_seguro.fit")
    ).toBe("Treino seguro");
    expect(extractActivityTitleFromFilename("<b>Longao</b>_Sabado.gpx")).toBe(
      "Longao Sabado"
    );
  });

  it("pickPreferredActivityTitleFromFileNames prioriza .GPX e cai para .FIT quando .GPX é ID numérico", () => {
    expect(
      pickPreferredActivityTitleFromFileNames([
        "Caminhada_leve.fit",
        "Voltando_do_parque.gpx",
      ])
    ).toBe("Voltando do parque");

    expect(
      pickPreferredActivityTitleFromFileNames([
        "Caminhada_leve.fit",
        "987654321.gpx",
      ])
    ).toBe("Caminhada leve");

    expect(
      pickPreferredActivityTitleFromFileNames(["123456789.fit", "987654321.gpx"])
    ).toBeNull();
  });
});
