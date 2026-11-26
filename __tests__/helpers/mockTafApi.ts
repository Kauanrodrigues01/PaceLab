import { vi } from "vitest";
import {
  TafGoalConfig,
  TafAttempt,
  TrainingSession,
  UserProfile,
  WeightRecord,
  WeeklyPlanData,
} from "@/types";
import { DEFAULT_GOAL } from "@/lib/services/tafService";
import { getFortalezaWeekBounds, toFortalezaDateKey } from "@/lib/math/weeklyAdherence";
import { WeeklyPlanQuerySchema } from "@/lib/validations/taf";

export interface MockTafStore {
  goal: TafGoalConfig;
  attempts: TafAttempt[];
  trainings: TrainingSession[];
  profile: UserProfile | null;
  weights: WeightRecord[];
  weeklyPlan?:
    | WeeklyPlanData
    | ((weekStart: string, store: MockTafStore) => WeeklyPlanData);
}

export type MockRequestInterceptor = (
  url: string,
  init: RequestInit | undefined,
  defaultHandler: () => Promise<Response>
) => Promise<Response>;

export function createMockJsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
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
    weeklyPlan: initialState?.weeklyPlan,
  };

  let requestInterceptor: MockRequestInterceptor | null = null;

  const handleDefaultRequest = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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
            sheetsConfigured: true,
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
        if (attemptId) {
          const found = store.attempts.find((a) => a.id === attemptId);
          if (!found) {
            return {
              ok: false,
              status: 404,
              json: async () => ({
                success: false,
                error: "Simulado não encontrado no banco de dados",
                code: "NOT_FOUND",
                timestamp: new Date().toISOString(),
              }),
            } as Response;
          }

          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: found,
              timestamp: new Date().toISOString(),
            }),
          } as Response;
        }

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
            data: { deletedId: attemptId, deleted: true },
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }
    }

    // 3b. Weekly Plan
    if (url.includes("/api/weekly-plan") && method === "GET") {
      const parsedUrl = new URL(url, "http://localhost");
      const rawWeekStart = parsedUrl.searchParams.get("weekStart")?.trim() || undefined;
      const queryValidation = WeeklyPlanQuerySchema.safeParse({ weekStart: rawWeekStart });
      if (!queryValidation.success) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            error: "Parâmetros inválidos",
            code: "VALIDATION_ERROR",
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }

      const weekStartParam = queryValidation.data.weekStart;
      const currentBounds = getFortalezaWeekBounds();
      const targetBounds = weekStartParam
        ? getFortalezaWeekBounds(weekStartParam)
        : currentBounds;
      const isCurrentWeek = targetBounds.weekStart === currentBounds.weekStart;

      let payload: WeeklyPlanData;
      if (typeof store.weeklyPlan === "function") {
        payload = store.weeklyPlan(targetBounds.weekStart, store);
      } else if (
        store.weeklyPlan &&
        (!weekStartParam || store.weeklyPlan.weekStart === targetBounds.weekStart)
      ) {
        payload = store.weeklyPlan;
      } else {
        const extraSessions = store.trainings.filter((t) => {
          const dateKey = toFortalezaDateKey(t.sessionDate);
          return (
            Boolean(dateKey) &&
            dateKey! >= targetBounds.weekStart &&
            dateKey! <= targetBounds.weekEnd
          );
        });
        const totalDistanceKm = Number(
          extraSessions
            .reduce(
              (sum, s) => sum + (Number.isFinite(s.distanceKm) ? s.distanceKm : 0),
              0
            )
            .toFixed(2)
        );
        payload = {
          weekStart: targetBounds.weekStart,
          weekEnd: targetBounds.weekEnd,
          weekLabel: targetBounds.label,
          isCurrentWeek,
          hasNextPlannedWeek: Boolean(
            store.weeklyPlan && store.weeklyPlan.weekStart > targetBounds.weekEnd
          ),
          items: [],
          summary: {
            totalPlanned: 0,
            completed: 0,
            adapted: 0,
            partial: 0,
            planned: 0,
            missed: 0,
            adherencePercent: null,
          },
          rollingFourWeeksAverage: {
            averagePercent: null,
            weeksCount: 0,
            weeks: [],
          },
          extraSessions,
          extraSummary: {
            count: extraSessions.length,
            totalDistanceKm,
          },
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: payload,
          timestamp: new Date().toISOString(),
        }),
      } as Response;
    }

    // 4. Trainings
    if (url.includes("/api/taf/trainings") && !url.includes("/api/taf/trainings/gpx-preview")) {
      const matchId = url.match(/\/api\/taf\/trainings\/([^/?]+)/);
      const trainingId = matchId ? decodeURIComponent(matchId[1]) : null;

      if (method === "GET") {
        if (trainingId) {
          const found = store.trainings.find((t) => t.id === trainingId);
          if (!found) {
            return {
              ok: false,
              status: 404,
              json: async () => ({
                success: false,
                error: "Treino não encontrado no banco de dados",
                code: "NOT_FOUND",
                timestamp: new Date().toISOString(),
              }),
            } as Response;
          }

          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: found,
              timestamp: new Date().toISOString(),
            }),
          } as Response;
        }

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
            data: { deletedId: trainingId, deleted: true },
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
            data: { deletedId: weightId, deleted: true },
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

    return createMockJsonResponse({}, 200);
  };

  const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (requestInterceptor) {
      return requestInterceptor(url, init, () => handleDefaultRequest(input, init));
    }
    return handleDefaultRequest(input, init);
  });

  global.fetch = mockFetch as unknown as typeof fetch;

  return {
    store,
    mockFetch,
    setRequestHandler: (handler: MockRequestInterceptor | null) => {
      requestInterceptor = handler;
    },
  };
}
