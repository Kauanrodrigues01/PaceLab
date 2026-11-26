/**
 * @deprecated Rota mantida apenas por retrocompatibilidade legada.
 * Utilize `POST /api/training-sessions/parse-activity`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { POST } from "@/app/api/training-sessions/parse-activity/route";
