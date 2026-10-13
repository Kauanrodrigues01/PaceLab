import { describe, it, expect } from "vitest";
import { calcIntervalSession } from "@/lib/math/intervals";

describe("calcIntervalSession com Limites (Fase 2)", () => {
  describe("Limite de Distância", () => {
    it("corta a recuperação proporcionalmente quando ela ultrapassa o limite de distância (ex: 2.4 km)", () => {
      // Configuração:
      // Sem aquecimento nem desaquecimento.
      // Repetições: 3
      // Tiro: 120s a 15 km/h -> 0.5 km (500m)
      // Recuperação: 120s a 6 km/h -> 0.2 km (200m)
      // Série 1: Tiro (500m) + Walk (200m) = 700m acumulado
      // Série 2: Tiro (500m) + Walk (200m) = 1400m acumulado
      // Série 3: Tiro (500m) + Walk (200m) = 2100m acumulado
      // Se tivermos 4 séries:
      // Série 4: Tiro (500m) -> 2600m acumulado.
      //
      // Vamos testar:
      // 3 séries com tiro de 600m e recuperação de 300m:
      // Tiro 1: 600m (0.6 km). Walk 1: 300m (0.3 km) -> acum: 0.9 km
      // Tiro 2: 600m (0.6 km). Walk 2: 300m (0.3 km) -> acum: 1.8 km
      // Tiro 3: 600m (0.6 km) -> acum: 2.4 km exatamente? Se o tiro 3 for 500m (acum 2.3 km), e a recuperação 3 for 300m (acum 2.6 km):
      // A recuperação 3 deve ser cortada para 100m (0.1 km) para cravar 2.4 km!
      const session = calcIntervalSession({
        warmupDurationSeconds: 0,
        warmupSpeedKmh: 0,
        runDurationSeconds: 120, // 2 min
        runSpeedKmh: 15, // 0.5 km por tiro
        walkDurationSeconds: 120, // 2 min
        walkSpeedKmh: 6, // 0.2 km por recuperação
        repetitions: 4,
        cooldownDurationSeconds: 0,
        cooldownSpeedKmh: 0,
        limitType: "distance",
        maxDistanceKm: 2.0, // Limite de 2.0 km
      });

      // Série 1: Tiro 0.5 km + Walk 0.2 km = 0.7 km
      // Série 2: Tiro 0.5 km + Walk 0.2 km = 1.4 km
      // Série 3: Tiro 0.5 km (1.9 km acumulado)
      // Walk 3: seria 0.2 km (iria para 2.1 km). Restam 0.1 km (100m)!
      // Logo, Walk 3 é cortada para 0.1 km e marcada como isTruncated!
      // Série 4 inteira é descartada.

      expect(session.totalDistanceKm).toBe(2.0);
      expect(session.stages.length).toBe(6); // 2 tiros completos + 2 walks completos + 1 tiro completo + 1 walk cortada

      const lastStage = session.stages[5];
      expect(lastStage.type).toBe("walk");
      expect(lastStage.distanceKm).toBeCloseTo(0.1, 3);
      expect(lastStage.isTruncated).toBe(true);
      // Duração de 100m a 6 km/h: (0.1 / 6) * 3600 = 60 segundos
      expect(lastStage.durationSeconds).toBe(60);

      expect(session.limitInfo).toBeDefined();
      expect(session.limitInfo?.type).toBe("distance");
      expect(session.limitInfo?.targetValue).toBe(2.0);
      expect(session.limitInfo?.truncatedStageIndex).toBe(6);
      expect(session.limitInfo?.stagesRemovedCount).toBe(2); // Tiro 4 e Walk 4 foram removidos
    });

    it("descarta a recuperação completamente quando o tiro forte anterior atinge exatamente o limite de 2.4 km", () => {
      // Exemplo: 4 tiros de 600m a 12 km/h (180s) e recuperações de 200m (120s a 6 km/h)
      // Tiro 1: 600m (0.6 km), Walk 1: 200m (0.2 km) -> acum 0.8 km
      // Tiro 2: 600m (0.6 km), Walk 2: 200m (0.2 km) -> acum 1.6 km
      // Tiro 3: 600m (0.6 km), Walk 3: 200m (0.2 km) -> acum 2.4 km
      // O tiro 3 bateu 2.2 km e o walk 3 bateu 2.4 km?
      // Vamos fazer: Tiro de 800m (0.8 km) e Walk de 0m ou:
      // Tiro 1: 800m, Walk 1: 400m -> acum 1.2 km
      // Tiro 2: 800m, Walk 2: 400m -> acum 2.4 km (no tiro 2 já bateu 2.0 km? Não, 1.2 + 0.8 = 2.0 km, walk 2 = 2.4 km).
      //
      // Vamos criar o cenário onde o tiro bate exatamente 2.4 km:
      // 3 tiros de 800m (0.8 km) cada = 2.4 km de corrida!
      // Tiro 1: 0.8 km (acum 0.8 km)
      // Walk 1: 0.2 km (acum 1.0 km)
      // Tiro 2: 0.8 km (acum 1.8 km)
      // Walk 2: 0.2 km (acum 2.0 km)
      // Tiro 3 (duração 240s a 12 km/h):
      // Mas para bater exatamente 2.4 km no tiro 3:
      // Se Tiro 1: 0.7 km, Walk 1: 0.1 km -> acum 0.8 km
      // Tiro 2: 0.7 km, Walk 2: 0.1 km -> acum 1.6 km
      // Tiro 3: 0.8 km -> acum 2.4 km exatos!
      // A recuperação da série 3 (Walk 3) NÃO deve existir, pois o tiro 3 já bateu a meta!

      const session = calcIntervalSession({
        warmupDurationSeconds: 0,
        warmupSpeedKmh: 0,
        runDurationSeconds: 240, // 4 min a 12 km/h = 0.8 km
        runSpeedKmh: 12,
        walkDurationSeconds: 60, // 1 min a 6 km/h = 0.1 km
        walkSpeedKmh: 6,
        repetitions: 3,
        cooldownDurationSeconds: 0,
        cooldownSpeedKmh: 0,
        limitType: "distance",
        // Total sem limite seria: 3 * (0.8 + 0.1) = 2.7 km.
        // Tiro 1: 0.8 km (acum 0.8 km)
        // Walk 1: 0.1 km (acum 0.9 km)
        // Tiro 2: 0.8 km (acum 1.7 km)
        // Walk 2: 0.1 km (acum 1.8 km)
        // Tiro 3: 0.8 km (acum 2.6 km -> ultrapassa 2.4 km).
        // Se quisermos que o Tiro 3 bata exatamente:
        // limite de 2.6 km:
        // Tiro 3 bate 2.6 km. E a Walk 3 que iria para 2.7 km deve ser descartada!
        maxDistanceKm: 2.6,
      });

      expect(session.totalDistanceKm).toBe(2.6);
      expect(session.stages.length).toBe(5); // Tiro 1, Walk 1, Tiro 2, Walk 2, Tiro 3. Walk 3 descartada!

      const lastStage = session.stages[4];
      expect(lastStage.type).toBe("run");
      expect(lastStage.distanceKm).toBe(0.8);
      expect(lastStage.isTruncated).toBeUndefined();

      expect(session.limitInfo?.stagesRemovedCount).toBe(1); // Walk 3 descartada
    });

    it("corta o próprio tiro forte quando este ultrapassa o limite de distância", () => {
      // 1 Tiro de 120s a 15 km/h = 500m (0.5 km)
      // Limite = 0.3 km (300m)
      const session = calcIntervalSession({
        warmupDurationSeconds: 0,
        warmupSpeedKmh: 0,
        runDurationSeconds: 120,
        runSpeedKmh: 15,
        walkDurationSeconds: 60,
        walkSpeedKmh: 6,
        repetitions: 1,
        cooldownDurationSeconds: 0,
        cooldownSpeedKmh: 0,
        limitType: "distance",
        maxDistanceKm: 0.3,
      });

      expect(session.stages.length).toBe(1);
      const stage = session.stages[0];
      expect(stage.type).toBe("run");
      expect(stage.isTruncated).toBe(true);
      expect(stage.distanceKm).toBe(0.3);
      // Duração: (0.3 / 15) * 3600 = 72 segundos
      expect(stage.durationSeconds).toBe(72);
      expect(session.totalDistanceKm).toBe(0.3);
      expect(session.limitInfo?.stagesRemovedCount).toBe(1); // Walk foi descartada
    });
  });

  describe("Limite de Tempo", () => {
    it("corta a recuperação proporcionalmente quando atinge o limite de tempo (ex: 720s / 12 min)", () => {
      // Aquecimento: 300s (5 min)
      // Tiro: 120s (2 min)
      // Walk: 90s (1.5 min)
      // Ciclo: 210s
      // Repetições: 3
      // Sem limite de tempo: 300 + 3 * 210 = 930s (15.5 min)
      // Com limite de tempo de 720s (12 min, teste clássico do TAF):
      // - Aquec: 300s (restam 420s)
      // - Tiro 1: 120s (restam 300s)
      // - Walk 1: 90s (restam 210s)
      // - Tiro 2: 120s (restam 90s)
      // - Walk 2: seria 90s -> cravou 90s! Restam 0s!
      // - Tiro 3 e Walk 3 são descartados!
      const session = calcIntervalSession({
        warmupDurationSeconds: 300,
        warmupSpeedKmh: 8,
        runDurationSeconds: 120,
        runSpeedKmh: 12,
        walkDurationSeconds: 90,
        walkSpeedKmh: 6,
        repetitions: 3,
        cooldownDurationSeconds: 0,
        cooldownSpeedKmh: 0,
        limitType: "time",
        maxDurationSeconds: 720,
      });

      expect(session.totalTimeSeconds).toBe(720);
      expect(session.stages.length).toBe(5); // Aquecimento, Tiro 1, Walk 1, Tiro 2, Walk 2
      expect(session.stages[4].type).toBe("walk");
      expect(session.stages[4].durationSeconds).toBe(90);
      expect(session.limitInfo?.stagesRemovedCount).toBe(2); // Tiro 3 e Walk 3 removidos
    });

    it("corta a recuperação em tempo fracionado quando o limite de tempo é atingido no meio dela", () => {
      // Aquecimento: 0
      // Tiro: 100s
      // Walk: 100s
      // Limite de tempo: 150s
      const session = calcIntervalSession({
        warmupDurationSeconds: 0,
        warmupSpeedKmh: 0,
        runDurationSeconds: 100,
        runSpeedKmh: 12,
        walkDurationSeconds: 100,
        walkSpeedKmh: 6,
        repetitions: 1,
        cooldownDurationSeconds: 0,
        cooldownSpeedKmh: 0,
        limitType: "time",
        maxDurationSeconds: 150,
      });

      expect(session.totalTimeSeconds).toBe(150);
      expect(session.stages.length).toBe(2);
      expect(session.stages[0].durationSeconds).toBe(100);
      expect(session.stages[1].durationSeconds).toBe(50); // Cortada de 100s para 50s
      expect(session.stages[1].isTruncated).toBe(true);
    });
  });

  describe("Validações defensivas de limite", () => {
    it("lança erro se limitType for distance e maxDistanceKm for inválido ou zero", () => {
      expect(() =>
        calcIntervalSession({
          warmupDurationSeconds: 0,
          warmupSpeedKmh: 0,
          runDurationSeconds: 60,
          runSpeedKmh: 12,
          walkDurationSeconds: 60,
          walkSpeedKmh: 6,
          repetitions: 2,
          cooldownDurationSeconds: 0,
          cooldownSpeedKmh: 0,
          limitType: "distance",
          maxDistanceKm: 0,
        })
      ).toThrow("O limite de distância deve ser um valor maior que zero.");
    });

    it("lança erro se limitType for time e maxDurationSeconds for inválido ou zero", () => {
      expect(() =>
        calcIntervalSession({
          warmupDurationSeconds: 0,
          warmupSpeedKmh: 0,
          runDurationSeconds: 60,
          runSpeedKmh: 12,
          walkDurationSeconds: 60,
          walkSpeedKmh: 6,
          repetitions: 2,
          cooldownDurationSeconds: 0,
          cooldownSpeedKmh: 0,
          limitType: "time",
          maxDurationSeconds: -10,
        })
      ).toThrow("O limite de tempo deve ser um valor maior que zero.");
    });
  });
});
