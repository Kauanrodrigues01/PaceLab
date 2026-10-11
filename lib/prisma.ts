import { PrismaClient } from "@prisma/client";
import { getDatabaseEnvConfig, logDatabaseEnvStatus } from "./env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Emite alerta legível no servidor caso DATABASE_URL não esteja configurada
if (typeof window === "undefined") {
  logDatabaseEnvStatus();
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Valida a conexão real com o PostgreSQL via Prisma com query rápida de pulso.
 */
export async function testPrismaConnection(): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const envConfig = getDatabaseEnvConfig();
  if (!envConfig.isConfigured) {
    return {
      connected: false,
      error: envConfig.error || "DATABASE_URL ausente",
    };
  }

  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na conexão com o banco de dados";
    return {
      connected: false,
      error: message,
    };
  }
}

