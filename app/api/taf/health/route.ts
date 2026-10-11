import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        {
          status: "disconnected",
          orm: "Prisma",
          error: "DATABASE_URL não configurada",
          fallbackMode: "offline_local_storage",
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }

    // Tenta uma consulta simples para validar a conexão ativa com o banco SQL
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "connected",
      orm: "Prisma",
      database: "PostgreSQL",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json(
      {
        status: "disconnected",
        orm: "Prisma",
        error: message,
        fallbackMode: "offline_local_storage",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
