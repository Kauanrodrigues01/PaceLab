import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SwaggerUIViewer } from "@/components/docs/SwaggerUIViewer";
import { swaggerSpec } from "@/lib/swagger/spec";

const { mockSwaggerBundle, mockStandalonePreset } = vi.hoisted(() => {
  const bundle = Object.assign(vi.fn(), {
    presets: { apis: { name: "apis-preset" } },
  });
  return {
    mockSwaggerBundle: bundle,
    mockStandalonePreset: { name: "standalone-preset" },
  };
});

vi.mock("swagger-ui-dist/swagger-ui.css", () => ({}));
vi.mock("@/components/docs/swagger-theme.css", () => ({}));
vi.mock("swagger-ui-dist/swagger-ui-bundle", () => ({
  default: mockSwaggerBundle,
}));
vi.mock("swagger-ui-dist/swagger-ui-standalone-preset", () => ({
  default: mockStandalonePreset,
}));

describe("SwaggerUIViewer Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSwaggerBundle.mockImplementation(() => ({}));
  });

  it("inicializa o SwaggerUIBundle com swaggerSpec e remove estado de carregamento", async () => {
    render(<SwaggerUIViewer />);

    await waitFor(() => {
      expect(mockSwaggerBundle).toHaveBeenCalledTimes(1);
    });

    const callArg = mockSwaggerBundle.mock.calls[0][0];
    expect(callArg.spec).toBe(swaggerSpec);
    expect(callArg.domNode).toBeInstanceOf(HTMLDivElement);
    expect(callArg.layout).toBe("BaseLayout");
    expect(callArg.tryItOutEnabled).toBe(true);
    expect(callArg.presets).toEqual([
      mockSwaggerBundle.presets.apis,
      mockStandalonePreset,
    ]);

    await waitFor(() => {
      expect(
        screen.queryByText(/Carregando documentação interativa da API/i)
      ).not.toBeInTheDocument();
    });
  });

  it("exibe banner de erro amigável se a inicialização do SwaggerUIBundle lançar exceção", async () => {
    mockSwaggerBundle.mockImplementationOnce(() => {
      throw new Error("Falha simulada no bundle");
    });

    render(<SwaggerUIViewer />);

    await waitFor(() => {
      expect(
        screen.getByText(/Falha ao renderizar documentação: Falha simulada no bundle/i)
      ).toBeInTheDocument();
    });
  });
});
