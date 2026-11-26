import { prisma } from "@/lib/prisma";
import {
  withApiHandler,
  apiSuccess,
  apiServiceUnavailable,
} from "@/lib/api/response";
import { isGoogleSheetsConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return withApiHandler(async () => {
    const sheetsConfigured = isGoogleSheetsConfigured();

    if (!process.env.DATABASE_URL) {
      return apiServiceUnavailable(
        "DATABASE_URL não configurada",
        {
          status: "disconnected",
          orm: "Prisma",
          sheetsConfigured,
          code: "DATABASE_UNAVAILABLE",
        },
        "DATABASE_UNAVAILABLE"
      );
    }

    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;

      return apiSuccess({
        status: "connected",
        orm: "Prisma",
        database: "PostgreSQL",
        latencyMs,
        sheetsConfigured,
      });
    } catch (dbError) {
      const message =
        dbError instanceof Error
          ? dbError.message
          : "Erro desconhecido ao conectar com o banco";
      return apiServiceUnavailable(
        message,
        {
          status: "disconnected",
          orm: "Prisma",
          sheetsConfigured,
          code: "DATABASE_UNAVAILABLE",
        },
        "DATABASE_UNAVAILABLE"
      );
    }
  });
}

