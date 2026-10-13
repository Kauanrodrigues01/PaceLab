import { NextResponse } from "next/server";
import { swaggerSpec } from "@/lib/swagger/spec";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(swaggerSpec, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
