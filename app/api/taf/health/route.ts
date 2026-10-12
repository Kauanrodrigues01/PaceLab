import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess, apiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    if (!process.env.DATABASE_URL) {
      return apiError("DATABASE_URL não configurada", 503, {
        status: "disconnected",
        orm: "Prisma",
      });
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
      });
    } catch (dbError) {
      const message =
        dbError instanceof Error
          ? dbError.message
          : "Erro desconhecido ao conectar com o banco";
      return apiError(message, 503, {
        status: "disconnected",
        orm: "Prisma",
      });
    }
  });
}

