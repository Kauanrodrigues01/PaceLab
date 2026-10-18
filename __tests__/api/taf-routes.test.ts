import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { GET as getGoal, POST as postGoal } from "@/app/api/taf/goals/route";
import { GET as getAttempts, POST as postAttempt } from "@/app/api/taf/attempts/route";
import { PUT as putAttempt, DELETE as deleteAttempt } from "@/app/api/taf/attempts/[id]/route";
import { GET as getTrainings, POST as postTraining } from "@/app/api/taf/trainings/route";
import { PUT as putTraining, DELETE as deleteTraining } from "@/app/api/taf/trainings/[id]/route";
import { GET as getHealth } from "@/app/api/taf/health/route";
import { prisma } from "@/lib/prisma";

// Mock do prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tafGoal: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    tafAttempt: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    trainingSession: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

describe("API Routes do TAF com Prisma ORM (Eixo B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Health Route ────────────────────────────────────────────────────────
  describe("GET /api/taf/health", () => {
    it("retorna status de conexão com PostgreSQL quando configurado", async () => {
      process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);
      const res = await getHealth();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe("connected");
      expect(data.data.orm).toBe("Prisma");
      expect(data.data.database).toBe("PostgreSQL");
      expect(data.data.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("retorna 503 se DATABASE_URL não estiver configurada", async () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "";
      try {
        const res = await getHealth();
        const data = await res.json();

        expect(res.status).toBe(503);
        expect(data.success).toBe(false);
        expect(data.error).toBe("DATABASE_URL não configurada");
        expect(data.details?.status).toBe("disconnected");
      } finally {
        process.env.DATABASE_URL = originalUrl;
      }
    });
  });

  // ─── Goals Route ─────────────────────────────────────────────────────────
  describe("Goals (/api/taf/goals)", () => {
    const baseGoal = {
      id: "goal-1",
      userId: null,
      institutionName: "Edital Padrão",
      minDistanceMeters: 2400,
      targetDistanceMeters: 2300,
      targetDurationMinutes: 12,
      targetExamDate: null,
      pullupType: "dinamica",
      pullupMinReps: 3,
      pullupTargetReps: 5,
      pullupMinSeconds: null,
      pullupTargetSeconds: null,
      pullupDurationSeconds: null,
      pushupMinReps: 20,
      pushupTargetReps: 30,
      pushupDurationSeconds: null,
      absMinReps: 30,
      absTargetReps: 40,
      absDurationSeconds: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("GET retorna meta existente com envelope apiSuccess", async () => {
      vi.mocked(prisma.tafGoal.findFirst).mockResolvedValueOnce(baseGoal);

      const res = await getGoal();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.targetDistanceMeters).toBe(2300);
      expect(data.data.targetDurationMinutes).toBe(12);
    });

    it("GET retorna meta default quando nenhuma existir", async () => {
      vi.mocked(prisma.tafGoal.findFirst).mockResolvedValueOnce(null);

      const res = await getGoal();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.targetDistanceMeters).toBe(2300);
      expect(data.data.targetDurationMinutes).toBe(12);
    });

    it("POST cria ou atualiza meta com payload válido", async () => {
      vi.mocked(prisma.tafGoal.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.tafGoal.create).mockResolvedValueOnce({
        ...baseGoal,
        id: "goal-2",
        targetDistanceMeters: 2400,
        targetDurationMinutes: 12,
      });

      const req = new Request("http://localhost/api/taf/goals", {
        method: "POST",
        body: JSON.stringify({ targetDistanceMeters: 2400, targetDurationMinutes: 12 }),
      });

      const res = await postGoal(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.targetDistanceMeters).toBe(2400);
    });

    it("POST aceita e salva campos multimodais (edital, mínimo, barra, flexão, abdominal)", async () => {
      vi.mocked(prisma.tafGoal.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.tafGoal.create).mockResolvedValueOnce({
        id: "goal-multi",
        userId: null,
        institutionName: "Polícia Militar SP",
        minDistanceMeters: 2400,
        targetDistanceMeters: 2600,
        targetDurationMinutes: 12,
        targetExamDate: null,
        pullupType: "dinamica",
        pullupMinReps: 4,
        pullupTargetReps: 6,
        pullupMinSeconds: null,
        pullupTargetSeconds: null,
        pullupDurationSeconds: 60,
        pushupMinReps: 25,
        pushupTargetReps: 35,
        pushupDurationSeconds: 60,
        absMinReps: 35,
        absTargetReps: 45,
        absDurationSeconds: 60,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request("http://localhost/api/taf/goals", {
        method: "POST",
        body: JSON.stringify({
          institutionName: "Polícia Militar SP",
          minDistanceMeters: 2400,
          targetDistanceMeters: 2600,
          targetDurationMinutes: 12,
          pullupType: "dinamica",
          pullupMinReps: 4,
          pullupTargetReps: 6,
          pullupDurationSeconds: 60,
          pushupMinReps: 25,
          pushupTargetReps: 35,
          pushupDurationSeconds: 60,
          absMinReps: 35,
          absTargetReps: 45,
          absDurationSeconds: 60,
        }),
      });

      const res = await postGoal(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.institutionName).toBe("Polícia Militar SP");
      expect(data.data.minDistanceMeters).toBe(2400);
      expect(data.data.targetDistanceMeters).toBe(2600);
      expect(data.data.pullupMinReps).toBe(4);
      expect(data.data.pullupDurationSeconds).toBe(60);
      expect(data.data.pushupMinReps).toBe(25);
      expect(data.data.absMinReps).toBe(35);
      expect(data.data.absMinReps).toBe(35);
    });

    it("POST rejeita payload com targetDistanceMeters inválido com 400 e details", async () => {
      const req = new Request("http://localhost/api/taf/goals", {
        method: "POST",
        body: JSON.stringify({ targetDistanceMeters: 50, targetDurationMinutes: 12 }),
      });

      const res = await postGoal(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("mínimo 500 metros");
      expect(Array.isArray(data.details)).toBe(true);
      expect(data.details[0].field).toBe("targetDistanceMeters");
    });
  });

  // ─── Attempts Route ──────────────────────────────────────────────────────
  describe("Attempts (/api/taf/attempts)", () => {
    it("GET lista tentativas com metadados de paginação padrão", async () => {
      vi.mocked(prisma.tafAttempt.findMany).mockResolvedValueOnce([
        {
          id: "att-1",
          userId: null,
          testDate: new Date(),
          targetDurationSeconds: 720,
          actualDurationSeconds: 720,
          distanceMeters: 2350,
          speedKmh: 11.75,
          paceSeconds: 306,
          paceFormatted: "5:06",
          locationType: "pista_400m",
          notes: null,
          laps: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const req = new Request("http://localhost/api/taf/attempts");
      const res = await getAttempts(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].distanceMeters).toBe(2350);
      expect(data.meta).toEqual({
        limit: 50,
        nextCursor: null,
        hasMore: false,
      });
      expect(prisma.tafAttempt.findMany).toHaveBeenCalledWith({
        take: 51,
        skip: 0,
        cursor: undefined,
        orderBy: { testDate: "desc" },
      });
    });

    it("GET suporta paginação cursor-based e detecta próxima página (hasMore: true)", async () => {
      // Mock de 3 itens retornados quando take = 2 + 1
      vi.mocked(prisma.tafAttempt.findMany).mockResolvedValueOnce([
        {
          id: "att-1",
          userId: null,
          testDate: new Date(),
          targetDurationSeconds: 720,
          actualDurationSeconds: 720,
          distanceMeters: 2300,
          speedKmh: 11.5,
          paceSeconds: 313,
          paceFormatted: "5:13",
          locationType: null,
          notes: null,
          laps: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "att-2",
          userId: null,
          testDate: new Date(),
          targetDurationSeconds: 720,
          actualDurationSeconds: 720,
          distanceMeters: 2320,
          speedKmh: 11.6,
          paceSeconds: 310,
          paceFormatted: "5:10",
          locationType: null,
          notes: null,
          laps: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "att-3",
          userId: null,
          testDate: new Date(),
          targetDurationSeconds: 720,
          actualDurationSeconds: 720,
          distanceMeters: 2400,
          speedKmh: 12.0,
          paceSeconds: 300,
          paceFormatted: "5:00",
          locationType: null,
          notes: null,
          laps: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const req = new Request("http://localhost/api/taf/attempts?limit=2");
      const res = await getAttempts(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2); // cortou o terceiro excedente
      expect(data.data[0].id).toBe("att-1");
      expect(data.data[1].id).toBe("att-2");
      expect(data.meta).toEqual({
        limit: 2,
        nextCursor: "att-2",
        hasMore: true,
      });
    });

    it("GET aplica cursor e skip no Prisma para buscar próxima página", async () => {
      vi.mocked(prisma.tafAttempt.findMany).mockResolvedValueOnce([]);

      const req = new Request("http://localhost/api/taf/attempts?cursor=att-2&limit=5");
      const res = await getAttempts(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(prisma.tafAttempt.findMany).toHaveBeenCalledWith({
        take: 6,
        skip: 1,
        cursor: { id: "att-2" },
        orderBy: { testDate: "desc" },
      });
      expect(data.meta.hasMore).toBe(false);
      expect(data.meta.nextCursor).toBeNull();
    });

    it("GET ignora graciosamente query params vazios (ex: ?cursor=&limit=)", async () => {
      vi.mocked(prisma.tafAttempt.findMany).mockResolvedValueOnce([]);

      const req = new Request("http://localhost/api/taf/attempts?cursor=&limit=");
      const res = await getAttempts(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(prisma.tafAttempt.findMany).toHaveBeenCalledWith({
        take: 51,
        skip: 0,
        cursor: undefined,
        orderBy: { testDate: "desc" },
      });
    });

    it("GET rejeita limit maior que 100 com 400 Bad Request", async () => {
      const req = new Request("http://localhost/api/taf/attempts?limit=150");
      const res = await getAttempts(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("máximo de registros por página é 100");
    });

    it("POST registra nova tentativa com status 201 Created", async () => {
      vi.mocked(prisma.tafAttempt.create).mockResolvedValueOnce({
        id: "att-new",
        userId: null,
        testDate: new Date(),
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2300,
        speedKmh: 11.5,
        paceSeconds: 313,
        paceFormatted: "5:13",
        locationType: null,
        notes: null,
        laps: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request("http://localhost/api/taf/attempts", {
        method: "POST",
        body: JSON.stringify({
          actualDurationSeconds: 720,
          distanceMeters: 2300,
          speedKmh: 11.5,
          paceSeconds: 313,
          paceFormatted: "5:13",
        }),
      });

      const res = await postAttempt(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe("att-new");
    });

    it("POST realiza upsert quando id é fornecido no payload", async () => {
      vi.mocked(prisma.tafAttempt.upsert).mockResolvedValueOnce({
        id: "att-custom-id",
        userId: null,
        testDate: new Date(),
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2400,
        speedKmh: 12.0,
        paceSeconds: 300,
        paceFormatted: "5:00",
        locationType: null,
        notes: null,
        laps: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request("http://localhost/api/taf/attempts", {
        method: "POST",
        body: JSON.stringify({
          id: "att-custom-id",
          actualDurationSeconds: 720,
          distanceMeters: 2400,
        }),
      });

      const res = await postAttempt(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe("att-custom-id");
      expect(prisma.tafAttempt.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "att-custom-id" },
        })
      );
    });

    it("POST rejeita tentativa com actualDurationSeconds menor que 30s", async () => {
      const req = new Request("http://localhost/api/taf/attempts", {
        method: "POST",
        body: JSON.stringify({
          actualDurationSeconds: -10,
          distanceMeters: 2300,
        }),
      });

      const res = await postAttempt(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("30 segundos");
      expect(Array.isArray(data.details)).toBe(true);
    });

    it("PUT atualiza tentativa existente com status 200", async () => {
      vi.mocked(prisma.tafAttempt.update).mockResolvedValueOnce({
        id: "att-1",
        userId: null,
        testDate: new Date(),
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2400,
        speedKmh: 12.0,
        paceSeconds: 300,
        paceFormatted: "5:00",
        locationType: null,
        notes: null,
        laps: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const putReq = new Request("http://localhost/api/taf/attempts/att-1", {
        method: "PUT",
        body: JSON.stringify({ distanceMeters: 2400 }),
      });

      const putRes = await putAttempt(putReq, { params: { id: "att-1" } });
      const data = await putRes.json();

      expect(putRes.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.distanceMeters).toBe(2400);
    });

    it("DELETE remove tentativa existente com status 200", async () => {
      vi.mocked(prisma.tafAttempt.delete).mockResolvedValueOnce({} as never);
      const delRes = await deleteAttempt(new Request("http://localhost"), {
        params: { id: "att-1" },
      });
      const data = await delRes.json();

      expect(delRes.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.deletedId).toBe("att-1");
    });

    it("DELETE retorna 404 quando ID não é encontrado no banco (P2025)", async () => {
      const p2025Error = new Prisma.PrismaClientKnownRequestError(
        "Record to delete does not exist.",
        { code: "P2025", clientVersion: "5.x" }
      );
      vi.mocked(prisma.tafAttempt.delete).mockRejectedValueOnce(p2025Error);

      const delRes = await deleteAttempt(new Request("http://localhost"), {
        params: { id: "inexistente" },
      });
      const data = await delRes.json();

      expect(delRes.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Registro não encontrado no banco de dados");
    });
  });

  // ─── Trainings Route ─────────────────────────────────────────────────────
  describe("Trainings (/api/taf/trainings)", () => {
    it("GET lista treinos com paginação padrão e suporta filtro por activityType", async () => {
      vi.mocked(prisma.trainingSession.findMany).mockResolvedValueOnce([]);

      const getReq = new Request(
        "http://localhost/api/taf/trainings?activityType=corrida_intervalada"
      );
      const getRes = await getTrainings(getReq);
      const data = await getRes.json();

      expect(getRes.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.meta).toEqual({
        limit: 50,
        nextCursor: null,
        hasMore: false,
      });
      expect(prisma.trainingSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 51,
          skip: 0,
          where: { activityType: "corrida_intervalada" },
        })
      );
    });

    it("GET detecta hasMore e nextCursor quando há registros excedentes", async () => {
      vi.mocked(prisma.trainingSession.findMany).mockResolvedValueOnce([
        {
          id: "tr-1",
          userId: null,
          sessionDate: new Date(),
          activityType: "corrida_continua",
          distanceKm: 5.0,
          durationSeconds: 1800,
          speedKmh: 10.0,
          paceSeconds: 360,
          paceFormatted: "6:00",
          perceivedEffort: 5,
          bodyWeightKg: null,
          notes: null,
          splits: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "tr-2",
          userId: null,
          sessionDate: new Date(),
          activityType: "corrida_continua",
          distanceKm: 6.0,
          durationSeconds: 2160,
          speedKmh: 10.0,
          paceSeconds: 360,
          paceFormatted: "6:00",
          perceivedEffort: 6,
          bodyWeightKg: null,
          notes: null,
          splits: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as never);

      const getReq = new Request("http://localhost/api/taf/trainings?limit=1");
      const getRes = await getTrainings(getReq);
      const data = await getRes.json();

      expect(getRes.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe("tr-1");
      expect(data.meta).toEqual({
        limit: 1,
        nextCursor: "tr-1",
        hasMore: true,
      });
    });

    it("GET rejeita activityType inválido com 400 Bad Request", async () => {
      const getReq = new Request("http://localhost/api/taf/trainings?activityType=invalido");
      const getRes = await getTrainings(getReq);
      const data = await getRes.json();

      expect(getRes.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Modalidade de treino inválida.");
    });

    it("POST registra novo treino com status 201 Created", async () => {
      vi.mocked(prisma.trainingSession.create).mockResolvedValueOnce({
        id: "tr-1",
        userId: null,
        sessionDate: new Date(),
        activityType: "corrida_continua",
        distanceKm: 6.0,
        durationSeconds: 2160,
        speedKmh: 10.0,
        paceSeconds: 360,
        paceFormatted: "6:00",
        perceivedEffort: 6,
        bodyWeightKg: null,
        notes: null,
        splits: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const postReq = new Request("http://localhost/api/taf/trainings", {
        method: "POST",
        body: JSON.stringify({
          activityType: "corrida_continua",
          distanceKm: 6.0,
          durationSeconds: 2160,
          speedKmh: 10.0,
          paceSeconds: 360,
          paceFormatted: "6:00",
        }),
      });

      const postRes = await postTraining(postReq);
      const data = await postRes.json();

      expect(postRes.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.activityType).toBe("corrida_continua");
    });

    it("POST realiza upsert quando id é fornecido no payload", async () => {
      vi.mocked(prisma.trainingSession.upsert).mockResolvedValueOnce({
        id: "trn-custom-id",
        userId: null,
        sessionDate: new Date(),
        activityType: "corrida_intervalada",
        distanceKm: 6.0,
        durationSeconds: 1800,
        speedKmh: 12.0,
        paceSeconds: 300,
        paceFormatted: "5:00",
        perceivedEffort: 7,
        bodyWeightKg: null,
        notes: null,
        splits: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const postReq = new Request("http://localhost/api/taf/trainings", {
        method: "POST",
        body: JSON.stringify({
          id: "trn-custom-id",
          activityType: "corrida_intervalada",
          distanceKm: 6.0,
          durationSeconds: 1800,
        }),
      });

      const postRes = await postTraining(postReq);
      const data = await postRes.json();

      expect(postRes.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe("trn-custom-id");
      expect(prisma.trainingSession.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "trn-custom-id" },
        })
      );
    });

    it("POST rejeita treino com distância negativa com 400 Bad Request", async () => {
      const postReq = new Request("http://localhost/api/taf/trainings", {
        method: "POST",
        body: JSON.stringify({
          activityType: "corrida_continua",
          distanceKm: -5.0,
          durationSeconds: 2160,
        }),
      });

      const postRes = await postTraining(postReq);
      const data = await postRes.json();

      expect(postRes.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("0,05 km");
      expect(Array.isArray(data.details)).toBe(true);
    });

    it("PUT atualiza treino e DELETE remove treino existente", async () => {
      vi.mocked(prisma.trainingSession.update).mockResolvedValueOnce({
        id: "tr-1",
        userId: null,
        sessionDate: new Date(),
        activityType: "corrida_continua",
        distanceKm: 7.0,
        durationSeconds: 2500,
        speedKmh: 10.0,
        paceSeconds: 360,
        paceFormatted: "6:00",
        perceivedEffort: null,
        bodyWeightKg: null,
        notes: null,
        splits: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const putReq = new Request("http://localhost/api/taf/trainings/tr-1", {
        method: "PUT",
        body: JSON.stringify({ distanceKm: 7.0 }),
      });

      const putRes = await putTraining(putReq, { params: { id: "tr-1" } });
      const putData = await putRes.json();

      expect(putRes.status).toBe(200);
      expect(putData.success).toBe(true);
      expect(putData.data.distanceKm).toBe(7.0);

      vi.mocked(prisma.trainingSession.delete).mockResolvedValueOnce({} as never);
      const delRes = await deleteTraining(new Request("http://localhost"), {
        params: { id: "tr-1" },
      });
      const delData = await delRes.json();

      expect(delRes.status).toBe(200);
      expect(delData.success).toBe(true);
      expect(delData.data.deletedId).toBe("tr-1");
    });

    it("PUT retorna 404 quando ID não é encontrado no banco (P2025)", async () => {
      const p2025Error = new Prisma.PrismaClientKnownRequestError(
        "Record to update not found.",
        { code: "P2025", clientVersion: "5.x" }
      );
      vi.mocked(prisma.trainingSession.update).mockRejectedValueOnce(p2025Error);

      const putReq = new Request("http://localhost/api/taf/trainings/inexistente", {
        method: "PUT",
        body: JSON.stringify({ distanceKm: 7.0 }),
      });

      const putRes = await putTraining(putReq, { params: { id: "inexistente" } });
      const putData = await putRes.json();

      expect(putRes.status).toBe(404);
      expect(putData.success).toBe(false);
      expect(putData.error).toBe("Registro não encontrado no banco de dados");
    });
  });
});
