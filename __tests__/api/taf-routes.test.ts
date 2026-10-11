import { describe, it, expect, vi, beforeEach } from "vitest";
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

describe("API Routes do TAF com Prisma ORM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/taf/health retorna status de conexão com PostgreSQL quando configurado", async () => {
    process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);
    const res = await getHealth();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("connected");
    expect(data.orm).toBe("Prisma");

    // Cenário sem DATABASE_URL
    delete process.env.DATABASE_URL;
    const resNoEnv = await getHealth();
    expect(resNoEnv.status).toBe(503);
    const dataNoEnv = await resNoEnv.json();
    expect(dataNoEnv.status).toBe("disconnected");
  });

  it("GET /api/taf/goals retorna meta existente ou default", async () => {
    vi.mocked(prisma.tafGoal.findFirst).mockResolvedValueOnce({
      id: "goal-1",
      userId: null,
      targetDistanceMeters: 2300,
      targetDurationMinutes: 12,
      targetExamDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await getGoal();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.targetDistanceMeters).toBe(2300);
  });

  it("POST /api/taf/goals cria ou atualiza meta", async () => {
    vi.mocked(prisma.tafGoal.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.tafGoal.create).mockResolvedValueOnce({
      id: "goal-2",
      userId: null,
      targetDistanceMeters: 2400,
      targetDurationMinutes: 12,
      targetExamDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new Request("http://localhost/api/taf/goals", {
      method: "POST",
      body: JSON.stringify({ targetDistanceMeters: 2400, targetDurationMinutes: 12 }),
    });

    const res = await postGoal(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.targetDistanceMeters).toBe(2400);
  });

  it("GET /api/taf/attempts lista tentativas ordenadas", async () => {
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
        locationType: "Pista",
        notes: null,
        laps: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = await getAttempts();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].distanceMeters).toBe(2350);
  });

  it("POST /api/taf/attempts registra nova tentativa no banco", async () => {
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
    expect(data.id).toBe("att-new");
  });

  it("PUT e DELETE /api/taf/attempts/[id]", async () => {
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
    expect(putRes.status).toBe(200);

    vi.mocked(prisma.tafAttempt.delete).mockResolvedValueOnce({} as never);
    const delRes = await deleteAttempt(new Request("http://localhost"), {
      params: { id: "att-1" },
    });
    expect(delRes.status).toBe(200);
  });

  it("GET e POST /api/taf/trainings", async () => {
    vi.mocked(prisma.trainingSession.findMany).mockResolvedValueOnce([]);
    const getRes = await getTrainings();
    expect(getRes.status).toBe(200);

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
    });

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
    expect(postRes.status).toBe(201);
  });

  it("PUT e DELETE /api/taf/trainings/[id]", async () => {
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
    });

    const putReq = new Request("http://localhost/api/taf/trainings/tr-1", {
      method: "PUT",
      body: JSON.stringify({ distanceKm: 7.0 }),
    });

    const putRes = await putTraining(putReq, { params: { id: "tr-1" } });
    expect(putRes.status).toBe(200);

    vi.mocked(prisma.trainingSession.delete).mockResolvedValueOnce({} as never);
    const delRes = await deleteTraining(new Request("http://localhost"), {
      params: { id: "tr-1" },
    });
    expect(delRes.status).toBe(200);
  });
});

