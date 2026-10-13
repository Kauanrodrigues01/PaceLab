import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalculadoraPage from "@/app/calculadora/page";

describe("CalculadoraPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/calculadora");
    sessionStorage.clear();
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
      writable: true,
    });
  });

  it("renderiza a calculadora com os valores de exemplo do prompt (3 km em 20 min -> 6:40 e 9.0 km/h)", () => {
    render(<CalculadoraPage />);

    expect(screen.getByRole("heading", { name: "Cálculos de Corrida e Ritmo" })).toBeInTheDocument();
    // Exemplo inicial pré-calculado
    expect(screen.getAllByText("6:40")[0]).toBeInTheDocument();
    expect(screen.getByText("9.0")).toBeInTheDocument();
  });

  it("calcula nova distância e tempo (5 km em 25:00 -> pace 5:00 e 12.0 km/h)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const distInput = screen.getByLabelText("Distância");
    const timeInput = screen.getByLabelText("Tempo total");

    await user.clear(distInput);
    await user.type(distInput, "5");

    await user.clear(timeInput);
    await user.type(timeInput, "25:00");

    const calcButton = screen.getByRole("button", { name: "Calcular" });
    await user.click(calcButton);

    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("12.0")).toBeInTheDocument();
  });

  it("alterna para modo unificado Pace ↔ Vel e converte pace em velocidade (pace 6:40 -> 9.00 km/h)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabPaceSpeed = screen.getByRole("button", { name: /Pace ↔ Vel/i });
    await user.click(tabPaceSpeed);

    const paceInput = screen.getByLabelText("Pace de Corrida");
    await user.clear(paceInput);
    await user.type(paceInput, "6:40");

    // Sincronização reativa e verificação no bloco de resultado
    expect(screen.getByText("9.00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("9.00")).toBeInTheDocument();
  });

  it("converte no modo Pace ↔ Vel de velocidade para pace (velocidade 12 km/h -> pace 5:00)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabPaceSpeed = screen.getByRole("button", { name: /Pace ↔ Vel/i });
    await user.click(tabPaceSpeed);

    const speedInput = screen.getByLabelText("Velocidade");
    await user.clear(speedInput);
    await user.type(speedInput, "12");

    expect(screen.getByDisplayValue("5:00")).toBeInTheDocument();
    expect(screen.getAllByText("2:00")[0]).toBeInTheDocument(); // Volta de 400m calculada
    expect(screen.getByText("2400m")).toBeInTheDocument(); // 12 min TAF calculado
  });

  it("permite digitar minutos inteiros como '6' sem colocar '6:00' na conversão para velocidade (6 -> 10.00 km/h)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabPaceSpeed = screen.getByRole("button", { name: /Pace ↔ Vel/i });
    await user.click(tabPaceSpeed);

    const paceInput = screen.getByLabelText("Pace de Corrida");
    await user.clear(paceInput);
    await user.type(paceInput, "6"); // Digita apenas o número inteiro 6

    expect(screen.getByDisplayValue("10.00")).toBeInTheDocument();
    expect(screen.getByText("10.00")).toBeInTheDocument();
  });

  it("preenche os campos e resultados ao clicar em uma linha da tabela de referência de 30s", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabPaceSpeed = screen.getByRole("button", { name: /Pace ↔ Vel/i });
    await user.click(tabPaceSpeed);

    // Deve exibir o container da tabela PaceSpeedTable
    expect(screen.getByTestId("pace-speed-table-container")).toBeInTheDocument();

    // Clica na linha de 5:00 (Meta TAF 2.400m)
    const row500 = screen.getByTestId("pace-row-5-00");
    await user.click(row500);

    expect(screen.getByDisplayValue("5:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("12.00")).toBeInTheDocument();
    expect(screen.getByText("2400m")).toBeInTheDocument();
  });

  it("aceita velocidade com vírgula como '11,5' no modo Pace ↔ Vel e sincroniza o pace equivalente (5:13)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabPaceSpeed = screen.getByRole("button", { name: /Pace ↔ Vel/i });
    await user.click(tabPaceSpeed);

    const speedInput = screen.getByLabelText("Velocidade");
    await user.clear(speedInput);
    await user.type(speedInput, "11,5");

    expect(screen.getByDisplayValue("5:13")).toBeInTheDocument();
  });

  it("exibe mensagem de erro ao submeter pace inválido no modo Pace ↔ Vel", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabPaceSpeed = screen.getByRole("button", { name: /Pace ↔ Vel/i });
    await user.click(tabPaceSpeed);

    const paceInput = screen.getByLabelText("Pace de Corrida");
    await user.clear(paceInput);
    await user.type(paceInput, "abc");

    const calcButton = screen.getByRole("button", { name: "Calcular" });
    await user.click(calcButton);

    expect(screen.getByText(/Formato de pace inválido/i)).toBeInTheDocument();
  });

  it("exibe mensagem de erro ao submeter velocidade inválida (0) no modo Pace ↔ Vel", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabPaceSpeed = screen.getByRole("button", { name: /Pace ↔ Vel/i });
    await user.click(tabPaceSpeed);

    const speedInput = screen.getByLabelText("Velocidade");
    await user.clear(speedInput);
    await user.type(speedInput, "0");

    const calcButton = screen.getByRole("button", { name: "Calcular" });
    await user.click(calcButton);

    expect(screen.getByText("A velocidade deve ser maior que zero.")).toBeInTheDocument();
  });

  it("exibe mensagem de erro quando distância for inválida (ex: 0)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const distInput = screen.getByLabelText("Distância");
    await user.clear(distInput);
    await user.type(distInput, "0");

    const calcButton = screen.getByRole("button", { name: "Calcular" });
    await user.click(calcButton);

    expect(screen.getByText("A distância deve ser maior que zero.")).toBeInTheDocument();
  });

  it("limpa os campos ao clicar em Limpar", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const clearButton = screen.getByRole("button", { name: "Limpar" });
    await user.click(clearButton);

    const distInput = screen.getByLabelText("Distância");
    expect(distInput).toHaveValue("");
  });

  it("calcula tempo estimado no modo time-needed (10 km a 5:00 -> 50:00)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabTimeNeeded = screen.getByRole("button", { name: /Tempo Estimado/i });
    await user.click(tabTimeNeeded);

    const distInput = screen.getByLabelText("Distância desejada");
    await user.clear(distInput);
    await user.type(distInput, "10");

    const paceInput = screen.getByLabelText("Pace Alvo");
    await user.clear(paceInput);
    await user.type(paceInput, "5:00");

    const calcButton = screen.getByRole("button", { name: "Calcular Tempo" });
    await user.click(calcButton);

    expect(screen.getByText("50:00")).toBeInTheDocument();
  });

  it("calcula distância percorrida no modo distance-covered (30:00 a 10 km/h -> 5.00 km)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabDistCovered = screen.getByRole("button", { name: /Distância Total/i });
    await user.click(tabDistCovered);

    const timeInput = screen.getByLabelText("Tempo de corrida");
    await user.clear(timeInput);
    await user.type(timeInput, "30:00");

    const speedInput = screen.getByLabelText("Velocidade média");
    await user.clear(speedInput);
    await user.type(speedInput, "10");

    const calcButton = screen.getByRole("button", { name: "Calcular Distância" });
    await user.click(calcButton);

    expect(screen.getByText("5.00")).toBeInTheDocument();
  });

  it("permite salvar atividade calculada no histórico", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const saveButton = screen.getByRole("button", { name: /Salvar esta atividade no Histórico/i });
    await user.click(saveButton);

    expect(screen.getByText("Salvo no Histórico!")).toBeInTheDocument();
  });

  describe("Navegação do Hub Central de Calculadoras", () => {
    it("renderiza a barra de abas superiores do Hub com todas as 5 ferramentas", () => {
      render(<CalculadoraPage />);

      const hubTabs = screen.getByTestId("hub-tabs-container");
      expect(hubTabs).toBeInTheDocument();
      expect(within(hubTabs).getByRole("button", { name: /Pace & Ritmo/i })).toBeInTheDocument();
      expect(within(hubTabs).getByRole("button", { name: /Estratégia TAF/i })).toBeInTheDocument();
      expect(within(hubTabs).getByRole("button", { name: /Metas & Splits/i })).toBeInTheDocument();
      expect(within(hubTabs).getByRole("button", { name: /Intervalado/i })).toBeInTheDocument();
      expect(within(hubTabs).getByRole("button", { name: /^Histórico$/i })).toBeInTheDocument();
    });

    it("alterna para a aba Estratégia TAF no Hub", async () => {
      const user = userEvent.setup();
      render(<CalculadoraPage />);

      const hubTabs = screen.getByTestId("hub-tabs-container");
      const tafTabButton = within(hubTabs).getByRole("button", { name: /Estratégia TAF/i });
      await user.click(tafTabButton);

      expect(screen.getByTestId("hub-tab-taf-content")).toBeInTheDocument();
    });

    it("alterna para a aba Metas & Splits no Hub", async () => {
      const user = userEvent.setup();
      render(<CalculadoraPage />);

      const hubTabs = screen.getByTestId("hub-tabs-container");
      const metasTabButton = within(hubTabs).getByRole("button", { name: /Metas & Splits/i });
      await user.click(metasTabButton);

      expect(screen.getByTestId("hub-tab-metas-content")).toBeInTheDocument();
    });

    it("alterna para a aba Intervalado no Hub", async () => {
      const user = userEvent.setup();
      render(<CalculadoraPage />);

      const hubTabs = screen.getByTestId("hub-tabs-container");
      const intervalsTabButton = within(hubTabs).getByRole("button", { name: /Intervalado/i });
      await user.click(intervalsTabButton);

      expect(screen.getByTestId("hub-tab-intervalado-content")).toBeInTheDocument();
    });

    it("alterna para a aba Histórico no Hub", async () => {
      const user = userEvent.setup();
      render(<CalculadoraPage />);

      const hubTabs = screen.getByTestId("hub-tabs-container");
      const historyTabButton = within(hubTabs).getByRole("button", { name: /^Histórico$/i });
      await user.click(historyTabButton);

      expect(screen.getByTestId("hub-tab-historico-content")).toBeInTheDocument();
    });

    it("abre diretamente a aba especificada no parâmetro ?tab da URL", () => {
      const getSpy = vi.spyOn(URLSearchParams.prototype, "get").mockImplementation((key) => {
        if (key === "tab") return "taf";
        return null;
      });

      render(<CalculadoraPage />);
      expect(screen.getByTestId("hub-tab-taf-content")).toBeInTheDocument();
      getSpy.mockRestore();
    });
  });

  it("permite expandir o visualizador de parciais km a km no modo distância/tempo", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    // Inicialmente o botão de parciais está presente
    const toggleBtn = screen.getByRole("button", { name: /Parciais km a km \(Splits\)/i });
    expect(toggleBtn).toBeInTheDocument();

    // Expande os splits
    await user.click(toggleBtn);

    // Deve exibir km 1
    expect(screen.getByText(/km 1/i)).toBeInTheDocument();
  });
});
