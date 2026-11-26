export interface ApiErrorDetail {
  field?: string;
  message?: string;
}

export interface ApiErrorPayload {
  error?: string;
  code?: string;
  details?: ApiErrorDetail[] | { code?: unknown };
}

export interface ExtractedApiError {
  message: string;
  code?: string;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    name = "ApiClientError"
  ) {
    super(message);
    this.name = name;
    this.status = status;
    this.code = code;
  }
}

/**
 * Desempacota o envelope padrão `{ success, data, meta, timestamp }` das rotas PaceLab,
 * preservando compatibilidade com payloads diretos quando `data` não estiver presente.
 */
export function unwrapApiResponse<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data: unknown }).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

/**
 * Extrai mensagem legível e código de erro (`code` raiz ou `details.code`)
 * de uma `Response` HTTP com fallback seguro caso o corpo não seja JSON válido.
 */
export async function extractApiErrorInfo(
  res: Response,
  fallbackMessage: string
): Promise<ExtractedApiError> {
  try {
    const errData = (await res.json().catch(() => ({}))) as ApiErrorPayload;
    const detailsCode =
      errData.details &&
      !Array.isArray(errData.details) &&
      typeof errData.details === "object" &&
      typeof (errData.details as { code?: unknown }).code === "string"
        ? (errData.details as { code: string }).code
        : undefined;
    const code =
      typeof errData.code === "string" && errData.code.length > 0
        ? errData.code
        : detailsCode;

    if (Array.isArray(errData.details) && errData.details.length > 0) {
      const messages = errData.details
        .map((d) => d.message)
        .filter((msg): msg is string => Boolean(msg));
      if (messages.length > 0) {
        return { message: messages.join("; "), code };
      }
    }

    if (errData.error) {
      return { message: errData.error, code };
    }

    return { message: fallbackMessage, code };
  } catch {
    // Falha silenciosa no parsing, mantém fallback
  }

  return { message: fallbackMessage };
}

/**
 * Extrai apenas a mensagem legível de erro de uma `Response` HTTP.
 */
export async function extractErrorMessage(
  res: Response,
  fallbackMessage: string
): Promise<string> {
  const { message } = await extractApiErrorInfo(res, fallbackMessage);
  return message;
}

/**
 * Garante resposta HTTP `res.ok`, lançando erro estruturado com status e `code`
 * extraídos do envelope padrão quando houver erro.
 */
export async function throwIfHttpError(
  res: Response,
  fallbackMessage: string,
  errorFactory?: (message: string, status: number, code?: string) => Error
): Promise<void> {
  if (res.ok) return;
  const { message, code } = await extractApiErrorInfo(res, fallbackMessage);
  throw errorFactory
    ? errorFactory(message, res.status, code)
    : new ApiClientError(message, res.status, code);
}
