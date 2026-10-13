import { vi } from "vitest";
import { TafGoalConfig, TafAttempt, TrainingSession, UserProfile, WeightRecord } from "@/types";
import { DEFAULT_GOAL } from "@/lib/services/tafService";

export interface MockTafStore {
  goal: TafGoalConfig;
  attempts: TafAttempt[];
  trainings: TrainingSession[];
  profile: UserProfile | null;
  weights: WeightRecord[];
}

export function setupMockTafApi(initialState?: Partial<MockTafStore>) {
  const store: MockTafStore = {
    goal: initialState?.goal ? { ...initialState.goal } : { ...DEFAULT_GOAL },
    attempts: initialState?.attempts ? [...initialState.attempts] : [],
    trainings: initialState?.trainings ? [...initialState.trainings] : [],
    profile:
      initialState?.profile !== undefined
        ? initialState.profile
        : {
            id: "profile_default",
            name: "Atleta Teste",
            heightCm: 175,
            currentWeightKg: 70,
            birthDate: null,
            gender: "masculino",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
    weights: initialState?.weights ? [...initialState.weights] : [],
  };

  const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method?.toUpperCase() || "GET";

    // 1. Health
    if (url.includes("/api/taf/health")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            status: "connected",
            database: "PostgreSQL",
            orm: "Prisma",
            latencyMs: 10,
          },
          timestamp: new Date().toISOString(),
        }),
      } as Response;
    }

    // 2. Goals
    if (url.includes("/api/taf/goals")) {
      if (method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: store.goal,
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }
      if (method === "POST" || method === "PUT") {
        const body = JSON.parse((init?.body as string) || "{}");
        store.goal = { ...store.goal, ...body };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: store.goal,
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }
    }

    // 3. Attempts
    if (url.includes("/api/taf/attempts")) {
      const matchId = url.match(/\/api\/taf\/attempts\/([^/?]+)/);
      const attemptId = matchId ? decodeURIComponent(matchId[1]) : null;

      if (method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: store.attempts,
            meta: { limit: 50, nextCursor: null, hasMore: false },
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }

      if (method === "POST") {
        const body = JSON.parse((init?.body as string) || "{}");
        const newAtt: TafAttempt = {
          ...body,
          id: body.id || `att_${Date.now()}`,
          createdAt: body.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.attempts = [newAtt, ...store.attempts.filter((a) => a.id !== newAtt.id)];
        return {
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: newAtt,
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }

      if (method === "PUT" && attemptId) {
        const body = JSON.parse((init?.body as string) || "{}");
        const updated: TafAttempt = {
          ...body,
          id: attemptId,
          updatedAt: new Date().toISOString(),
        };
        store.attempts = store.attempts.map((a) => (a.id === attemptId ? updated : a));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: updated,
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }

      if (method === "DELETE" && attemptId) {
        store.attempts = store.attempts.filter((a) => a.id !== attemptId);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { success: true, deletedId: attemptId },
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }
    }

    // 4. Trainings
    if (url.includes("/api/taf/trainings")) {
      const matchId = url.match(/\/api\/taf\/trainings\/([^/?]+)/);
      const trainingId = matchId ? decodeURIComponent(matchId[1]) : null;

      if (method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: store.trainings,
            meta: { limit: 50, nextCursor: null, hasMore: false },
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }

      if (method === "POST") {
        const body = JSON.parse((init?.body as string) || "{}");
        const newTr: TrainingSession = {
          ...body,
          id: body.id || `trn_${Date.now()}`,
          createdAt: body.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.trainings = [newTr, ...store.trainings.filter((t) => t.id !== newTr.id)];
        return {
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: newTr,
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }

      if (method === "PUT" && trainingId) {
        const body = JSON.parse((init?.body as string) || "{}");
        const updated: TrainingSession = {
          ...body,
          id: trainingId,
          updatedAt: new Date().toISOString(),
        };
        store.trainings = store.trainings.map((t) => (t.id === trainingId ? updated : t));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: updated,
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }

      if (method === "DELETE" && trainingId) {
        store.trainings = store.trainings.filter((t) => t.id !== trainingId);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { success: true, deletedId: trainingId },
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }
    }

    // 5. Weight Records
    if (url.includes("/api/profile/weight")) {
      const matchId = url.match(/\/api\/profile\/weight\/([^/?]+)/);
      const weightId = matchId ? decodeURIComponent(matchId[1]) : null;

      if (method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: store.weights,
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }

      if (method === "POST") {
        const body = JSON.parse((init?.body as string) || "{}");
        const newRecord: WeightRecord = {
          ...body,
          id: body.id || `w_${Date.now()}`,
          recordedAt: body.recordedAt || new Date().toISOString(),
          source: body.source || "manual",
          createdAt: new Date().toISOString(),
        };
        store.weights = [newRecord, ...store.weights];
        if (store.profile) {
          store.profile = {
            ...store.profile,
            currentWeightKg: newRecord.weightKg,
            updatedAt: new Date().toISOString(),
          };
        }
        return {
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: newRecord,
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }

      if (method === "DELETE" && weightId) {
        store.weights = store.weights.filter((w) => w.id !== weightId);
        if (store.profile) {
          store.profile = {
            ...store.profile,
            currentWeightKg: store.weights.length > 0 ? store.weights[0].weightKg : null,
            updatedAt: new Date().toISOString(),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { success: true, deletedId: weightId },
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }
    }

    // 6. User Profile
    if (url.includes("/api/profile")) {
      if (method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: store.profile,
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }

      if (method === "PUT" || method === "POST") {
        const body = JSON.parse((init?.body as string) || "{}");
        const updatedProfile: UserProfile = {
          ...(store.profile || {
            id: "profile_default",
            heightCm: 175,
            currentWeightKg: 70,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          ...body,
          updatedAt: new Date().toISOString(),
        };
        store.profile = updatedProfile;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: updatedProfile,
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response;
  });

  global.fetch = mockFetch as unknown as typeof fetch;

  return {
    store,
    mockFetch,
  };
}
