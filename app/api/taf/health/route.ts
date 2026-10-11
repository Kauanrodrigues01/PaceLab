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

    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      status: "connected",
      orm: "Prisma",
      database: "PostgreSQL",
      latencyMs,
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

