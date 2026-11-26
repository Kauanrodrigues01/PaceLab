import { describe, it, expect } from "vitest";
import {
  ApiClientError,
  unwrapApiResponse,
  extractApiErrorInfo,
  extractErrorMessage,
  throwIfHttpError,
} from "@/lib/services/apiClient";

describe("lib/services/apiClient", () => {
  describe("ApiClientError", () => {
    it("instancia erro com status, code e nome padrão ou customizado", () => {
      const defaultErr = new ApiClientError("Falha de rede", 503, "SERVICE_UNAVAILABLE");
      expect(defaultErr).toBeInstanceOf(Error);
      expect(defaultErr.name).toBe("ApiClientError");
      expect(defaultErr.message).toBe("Falha de rede");
      expect(defaultErr.status).toBe(503);
      expect(defaultErr.code).toBe("SERVICE_UNAVAILABLE");

      const customErr = new ApiClientError("Duplicado", 409, "DUPLICATE_EXTERNAL_ID", "TafApiError");
      expect(customErr.name).toBe("TafApiError");
      expect(customErr.status).toBe(409);
      expect(customErr.code).toBe("DUPLICATE_EXTERNAL_ID");
    });
  });

  describe("unwrapApiResponse", () => {
    it("desempacota envelope padrão { success, data } preservando falsy válidos (false, 0, null)", () => {
      expect(unwrapApiResponse({ success: true, data: { id: "1" } })).toEqual({ id: "1" });
      expect(unwrapApiResponse({ success: true, data: null })).toBeNull();
      expect(unwrapApiResponse({ success: true, data: 0 })).toBe(0);
      expect(unwrapApiResponse({ success: true, data: false })).toBe(false);
    });

    it("retorna payload original quando data estiver ausente ou undefined", () => {
      expect(unwrapApiResponse({ id: "raw" })).toEqual({ id: "raw" });
      expect(unwrapApiResponse({ data: undefined })).toEqual({ data: undefined });
      expect(unwrapApiResponse("texto")).toBe("texto");
      expect(unwrapApiResponse(null)).toBeNull();
    });
  });

  describe("extractApiErrorInfo e extractErrorMessage", () => {
    it("extrai mensagens de array details e prioriza code de topo", async () => {
      const res = new Response(
        JSON.stringify({
          error: "Erro genérico",
          code: "VALIDATION_ERROR",
          details: [
            { field: "distance", message: "Distância inválida" },
            { field: "duration" },
            { field: "date", message: "Data obrigatória" },
          ],
        }),
        { status: 400 }
      );

      await expect(extractApiErrorInfo(res, "Fallback")).resolves.toEqual({
        message: "Distância inválida; Data obrigatória",
        code: "VALIDATION_ERROR",
      });
    });

    it("usa details.code quando code raiz está ausente e cai para errData.error", async () => {
      const res = new Response(
        JSON.stringify({
          error: "Arquivo duplicado",
          details: { code: "DUPLICATE_EXTERNAL_ID", existingId: "tr-1" },
        }),
        { status: 409 }
      );

      await expect(extractApiErrorInfo(res, "Fallback")).resolves.toEqual({
        message: "Arquivo duplicado",
        code: "DUPLICATE_EXTERNAL_ID",
      });
    });

    it("usa fallbackMessage quando payload JSON não possui error nem details válidos", async () => {
      const res = new Response(
        JSON.stringify({ code: "EMPTY_ERROR", details: [{ field: "x" }] }),
        { status: 500 }
      );

      await expect(extractApiErrorInfo(res, "Erro inesperado")).resolves.toEqual({
        message: "Erro inesperado",
        code: "EMPTY_ERROR",
      });
    });

    it("usa fallbackMessage quando corpo da resposta não é JSON válido ou res.json lança", async () => {
      const nonJsonRes = new Response("<html>502 Bad Gateway</html>", { status: 502 });
      await expect(extractErrorMessage(nonJsonRes, "Servidor indisponível")).resolves.toBe(
        "Servidor indisponível"
      );

      const brokenRes = {
        json: () => {
          throw new Error("stream já consumido");
        },
      } as unknown as Response;

      await expect(extractApiErrorInfo(brokenRes, "Falha ao ler resposta")).resolves.toEqual({
        message: "Falha ao ler resposta",
      });
    });
  });

  describe("throwIfHttpError", () => {
    it("não lança erro quando res.ok é true", async () => {
      const okRes = new Response(JSON.stringify({ success: true }), { status: 200 });
      await expect(throwIfHttpError(okRes, "Erro")).resolves.toBeUndefined();
    });

    it("lança ApiClientError padrão quando errorFactory não é informada", async () => {
      const errRes = new Response(
        JSON.stringify({ error: "Não encontrado", code: "NOT_FOUND" }),
        { status: 404 }
      );

      await expect(throwIfHttpError(errRes, "Fallback")).rejects.toMatchObject({
        name: "ApiClientError",
        message: "Não encontrado",
        status: 404,
        code: "NOT_FOUND",
      });
    });

    it("usa errorFactory customizada quando fornecida", async () => {
      const errRes = new Response(
        JSON.stringify({ error: "Conflito", details: { code: "CONFLICT" } }),
        { status: 409 }
      );

      class CustomServiceError extends Error {
        constructor(
          message: string,
          readonly status: number,
          readonly code?: string
        ) {
          super(message);
          this.name = "CustomServiceError";
        }
      }

      await expect(
        throwIfHttpError(
          errRes,
          "Fallback",
          (msg, status, code) => new CustomServiceError(msg, status, code)
        )
      ).rejects.toMatchObject({
        name: "CustomServiceError",
        message: "Conflito",
        status: 409,
        code: "CONFLICT",
      });
    });
  });
});
