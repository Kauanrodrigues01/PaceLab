import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GpxImportPanel } from "@/components/treinos/GpxImportPanel";
import { TafAttemptCard } from "@/components/meu-taf/TafAttemptCard";
import { TafAttemptForm } from "@/components/meu-taf/TafAttemptForm";
import MeuTafPage from "@/app/meu-taf/page";
import { tafService, DEFAULT_GOAL } from "@/lib/services/tafService";
import { profileService } from "@/lib/services/profileService";
import { ActivityParsePreview, TafAttempt } from "@/types";
import { CreateTafAttemptSchema } from "@/lib/validations/taf";

vi.mock("@/lib/services/tafService", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/tafService")>(
    "@/lib/services/tafService"
  );
  return {
    ...actual,
    tafService: {
      ...actual.tafService,
      getGoal: vi.fn(),
      getAttempts: vi.fn(),
      getTrainings: vi.fn(),
      checkDatabaseHealth: vi.fn(),
      parseActivity: vi.fn(),
      saveAttempt: vi.fn(),
      saveTraining: vi.fn(),
      deleteAttempt: vi.fn(),
    },
  };
});

vi.mock("@/lib/services/profileService", () => ({
  profileService: {
    getProfile: vi.fn(),
  },
}));

const cooperPreview: ActivityParsePreview = {
  source: "fit_upload",
  filesUsed: ["fit"],
  name: "Simulado Pista 12 min",
  rawType: "running",
  sourceActivityKind: "run",
  isIndoor: false,
  externalId: "fit_cooper_taf_999",
  startedAt: "2026-11-14T06:30:00.000Z",
  distanceKm: 3.8,
  durationSeconds: 1200,
  elapsedSeconds: 1205,
  paceSeconds: 316,
  paceFormatted: "5:16",
  speedKmh: 11.4,
  elevationGainM: 8,
  avgHeartRate: 160,
  maxHeartRate: 189,
  avgCadence: 180,
  activeCalories: 290,
  avgTemperatureC: 24,
  pointCount: 1200,
  splits: [
    {
      kilometer: 1,
      distanceKm: 1,
      durationSeconds: 300,
      paceSeconds: 300,
      paceFormatted: "5:00",
      avgHeartRate: 150,
    },
  ],
  laps: [],
  tafWindow: {
    targetDurationSeconds: 720,
    actualDurationSeconds: 720,
    distanceMeters: 2640,
    speedKmh: 13.2,
    paceSeconds: 273,
    paceFormatted: "4:33",
    avgHeartRate: 176,
    maxHeartRate: 189,
    windowStartOffsetSeconds: 180,
    windowEndOffsetSeconds: 900,
    isShorterThanTarget: false,
    laps: [
      { lapNumber: 1, distanceMeters: 400, durationSeconds: 109, paceFormatted: "4:33" },
      { lapNumber: 2, distanceMeters: 400, durationSeconds: 109, paceFormatted: "4:33" },
      { lapNumber: 3, distanceMeters: 400, durationSeconds: 109, paceFormatted: "4:33" },
      { lapNumber: 4, distanceMeters: 400, durationSeconds: 109, paceFormatted: "4:33" },
      { lapNumber: 5, distanceMeters: 400, durationSeconds: 109, paceFormatted: "4:33" },
      { lapNumber: 6, distanceMeters: 400, durationSeconds: 109, paceFormatted: "4:33" },
      { lapNumber: 7, distanceMeters: 240, durationSeconds: 66, paceFormatted: "4:35" },
    ],
  },
  warnings: [],
  alreadyExists: false,
  existingTrainingId: null,
  alreadyExistsAttempt: false,
  existingAttemptId: null,
  suggestedActivityType: "corrida_continua",
  suggestedNotes: "Simulado Pista 12 min",
  allowedActivityTypes: ["rodagem_leve", "corrida_continua", "tempo_run"],
};

describe("Fase 9 — Importação de .FIT / .GPX como Simulado TAF (TafAttempt)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    vi.mocked(profileService.getProfile).mockRejectedValue(
      new Error("profile unavailable")
    );
    vi.mocked(tafService.getGoal).mockResolvedValue(DEFAULT_GOAL);
    vi.mocked(tafService.getAttempts).mockResolvedValue([]);
    vi.mocked(tafService.getTrainings).mockResolvedValue([]);
    vi.mocked(tafService.checkDatabaseHealth).mockResolvedValue({
      connected: true,
      orm: "Prisma",
    });
  });

  it("exibe seletor Treino vs Simulado TAF no GpxImportPanel, mostra prévia da janela de 12 min com voltas de 400m e salva TafAttempt válido", async () => {
    const user = userEvent.setup();
    vi.mocked(tafService.parseActivity).mockResolvedValueOnce(cooperPreview);

    let capturedPayload: TafAttempt | null = null;
    vi.mocked(tafService.saveAttempt).mockImplementationOnce(async (att) => {
      capturedPayload = att;
      return {
        ...att,
        id: "att-imported-1",
      };
    });

    const onAttemptImported = vi.fn();
    render(
      <GpxImportPanel
        onImported={vi.fn()}
        onAttemptImported={onAttemptImported}
      />
    );

    const input = screen.getByTestId("activity-file-input");
    await user.upload(input, new File(["FIT"], "cooper.fit"));

    // Seletor explícito "Salvar como:" aparece após preview
    const selector = await screen.findByTestId("save-target-selector");
    expect(within(selector).getByTestId("save-target-training")).toHaveAttribute(
      "aria-checked",
      "true"
    );

    // Troca destino para Simulado TAF
    await user.click(screen.getByTestId("save-target-taf"));
    expect(screen.getByTestId("save-target-taf")).toHaveAttribute(
      "aria-checked",
      "true"
    );

    // Prévia da janela contínua de 12 min e voltas 400m visíveis
    const winPreview = screen.getByTestId("taf-window-preview");
    expect(within(winPreview).getByTestId("taf-window-distance")).toHaveTextContent(
      "2.640 m"
    );
    expect(within(winPreview).getByTestId("taf-window-laps")).toHaveTextContent(
      "V1: 400m"
    );
    expect(within(winPreview).getByTestId("taf-window-laps")).toHaveTextContent(
      "V7: 240m"
    );

    // Contexto simples sem pedir FC/sensores ausentes
    await user.selectOptions(
      screen.getByTestId("post-upload-location-select"),
      "rua_plana"
    );
    await user.type(
      screen.getByTestId("post-upload-shoe-input"),
      "Asics Novablast 4"
    );

    await user.click(screen.getByTestId("save-imported-attempt-btn"));

    await waitFor(() => expect(tafService.saveAttempt).toHaveBeenCalledTimes(1));
    expect(onAttemptImported).toHaveBeenCalledTimes(1);
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload!.source).toBe("fit_upload");
    expect(capturedPayload!.externalId).toBe("fit_cooper_taf_999");
    expect(capturedPayload!.distanceMeters).toBe(2640);
    expect(capturedPayload!.actualDurationSeconds).toBe(720);
    expect(capturedPayload!.locationType).toBe("rua_plana");
    expect(capturedPayload!.shoeName).toBe("Asics Novablast 4");
    expect(capturedPayload!.avgHeartRate).toBe(176);
    expect(capturedPayload!.maxHeartRate).toBe(189);
    expect(capturedPayload!.laps).toHaveLength(7);

    // Schema oficial Zod do backend aceita o payload sem erros
    expect(CreateTafAttemptSchema.safeParse(capturedPayload).success).toBe(true);
  });

  it("pré-seleciona esteira em atividades indoor e trata duplicidade cruzada independente entre Diário e Meu TAF", async () => {
    const user = userEvent.setup();
    vi.mocked(tafService.parseActivity).mockResolvedValueOnce({
      ...cooperPreview,
      isIndoor: true,
      alreadyExists: true,
      existingTrainingId: "trn-existente-1",
      alreadyExistsAttempt: false,
      existingAttemptId: null,
      tafWindow: {
        ...cooperPreview.tafWindow!,
        actualDurationSeconds: 600,
        distanceMeters: 2100,
        isShorterThanTarget: true,
      },
    });
    vi.mocked(tafService.saveAttempt).mockResolvedValueOnce({
      id: "att-new-cross",
      source: "fit_upload",
      externalId: "fit_cooper_taf_999",
      testDate: "2026-11-14T06:30:00.000Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 600,
      distanceMeters: 2100,
      speedKmh: 12.6,
      paceSeconds: 286,
      paceFormatted: "4:46",
      locationType: "esteira",
      laps: [],
      createdAt: "2026-11-14T07:00:00.000Z",
      updatedAt: "2026-11-14T07:00:00.000Z",
    });

    render(<GpxImportPanel onAttemptImported={vi.fn()} />);

    await user.upload(
      screen.getByTestId("activity-file-input"),
      new File(["FIT"], "esteira.fit")
    );

    // Como treino no Diário já existe -> alerta de atualização aparece no modo Treino
    expect(await screen.findByTestId("duplicate-training-alert")).toBeInTheDocument();

    // Trocando para Simulado TAF -> NÃO é duplicado em TAF; mostra aviso informativo e permite salvar novo simulado
    await user.click(screen.getByTestId("save-target-taf"));
    expect(screen.queryByTestId("duplicate-attempt-alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("cross-duplicate-info")).toBeInTheDocument();
    expect(screen.getByTestId("taf-shorter-window-warning")).toBeInTheDocument();
    expect(
      (screen.getByTestId("post-upload-location-select") as HTMLSelectElement).value
    ).toBe("esteira");

    await user.click(screen.getByTestId("save-imported-attempt-btn"));
    await waitFor(() => expect(tafService.saveAttempt).toHaveBeenCalledTimes(1));
  });

  it("oferece atualização in-place com onDuplicate='update' quando já existe Simulado TAF com o mesmo externalId", async () => {
    const user = userEvent.setup();
    vi.mocked(tafService.parseActivity).mockResolvedValueOnce({
      ...cooperPreview,
      alreadyExists: false,
      alreadyExistsAttempt: true,
      existingAttemptId: "att-existente-55",
    });
    let sentUpdateFlag: string | undefined;
    vi.mocked(tafService.saveAttempt).mockImplementationOnce(async (att) => {
      sentUpdateFlag = (att as TafAttempt & { onDuplicate?: string }).onDuplicate;
      return { ...att, id: "att-existente-55" };
    });

    const onAttemptImported = vi.fn();
    render(
      <GpxImportPanel
        defaultSaveAs="taf_attempt"
        onAttemptImported={onAttemptImported}
      />
    );

    await user.upload(
      screen.getByTestId("activity-file-input"),
      new File(["FIT"], "cooper.fit")
    );

    expect(await screen.findByTestId("duplicate-attempt-alert")).toBeInTheDocument();
    await user.click(screen.getByTestId("update-existing-attempt-btn"));

    await waitFor(() => expect(onAttemptImported).toHaveBeenCalledTimes(1));
    expect(sentUpdateFlag).toBe("update");
    expect(onAttemptImported.mock.calls[0][1]).toBe(true);
  });

  it("renderiza badges de origem Strava FIT/GPX, FC e tênis no TafAttemptCard", () => {
    const importedAttempt: TafAttempt = {
      id: "att-card-1",
      source: "fit_upload",
      externalId: "fit_123",
      testDate: "2026-11-14T06:30:00.000Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2640,
      speedKmh: 13.2,
      paceSeconds: 273,
      paceFormatted: "4:33",
      locationType: "pista_400m",
      shoeName: "Nike Vaporfly 3",
      avgHeartRate: 176,
      maxHeartRate: 189,
      notes: "Simulado Strava",
      laps: cooperPreview.tafWindow!.laps,
      isPersonalRecord: true,
      createdAt: "2026-11-14T06:45:00.000Z",
      updatedAt: "2026-11-14T06:45:00.000Z",
    };

    const { rerender } = render(
      <TafAttemptCard
        attempt={importedAttempt}
        targetDistanceMeters={2400}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByTestId("taf-badge-source")).toHaveTextContent("Strava FIT");
    expect(screen.getByTestId("taf-badge-hr")).toHaveTextContent("176 bpm (máx 189)");
    expect(screen.getByTestId("taf-badge-shoe")).toHaveTextContent("Nike Vaporfly 3");

    // Manual attempt não mostra badge de upload Strava
    rerender(
      <TafAttemptCard
        attempt={{ ...importedAttempt, source: "manual" }}
        targetDistanceMeters={2400}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.queryByTestId("taf-badge-source")).not.toBeInTheDocument();
  });

  it("permite importar diretamente pela página /meu-taf atualizando histórico e badges sem quebrar o formulário padrão", async () => {
    const user = userEvent.setup();
    vi.mocked(tafService.parseActivity).mockResolvedValueOnce(cooperPreview);
    vi.mocked(tafService.saveAttempt).mockImplementationOnce(async (att) => ({
      ...att,
      id: "att-meu-taf-01",
    }));

    render(<MeuTafPage />);

    // Formulário padrão continua visível normalmente
    expect(await screen.findByTestId("taf-attempt-form")).toBeInTheDocument();

    // Abre importador na página /meu-taf
    await user.click(screen.getByTestId("meu-taf-import-btn"));
    expect(screen.getByTestId("gpx-import-panel")).toBeInTheDocument();

    await user.upload(
      screen.getByTestId("activity-file-input"),
      new File(["FIT"], "cooper.fit")
    );

    // defaultSaveAs="taf_attempt" já vem selecionado
    expect(await screen.findByTestId("taf-window-preview")).toBeInTheDocument();
    await user.click(screen.getByTestId("save-imported-attempt-btn"));

    // Card do novo simulado aparece no histórico com badge Strava FIT
    const card = await screen.findByTestId("taf-card-att-meu-taf-01");
    expect(within(card).getByTestId("taf-badge-source")).toHaveTextContent(
      "Strava FIT"
    );
    expect(within(card).getByText(/2\.640/i)).toBeInTheDocument();
  });

  it("bloqueia salvamento fora dos limites (100m..10.000m) e exibe banner com link /meu-taf quando usado sem onAttemptImported", async () => {
    const user = userEvent.setup();
    vi.mocked(tafService.parseActivity)
      .mockResolvedValueOnce({
        ...cooperPreview,
        tafWindow: {
          ...cooperPreview.tafWindow!,
          distanceMeters: 50,
          actualDurationSeconds: 20,
          isShorterThanTarget: true,
        },
      })
      .mockResolvedValueOnce(cooperPreview);

    vi.mocked(tafService.saveAttempt).mockResolvedValueOnce({
      id: "att-standalone-01",
      source: "fit_upload",
      externalId: "fit_cooper_taf_999",
      testDate: "2026-11-14T06:30:00.000Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2640,
      speedKmh: 13.2,
      paceSeconds: 273,
      paceFormatted: "4:33",
      laps: [],
      createdAt: "2026-11-14T06:45:00.000Z",
      updatedAt: "2026-11-14T06:45:00.000Z",
    });

    const { rerender } = render(<GpxImportPanel defaultSaveAs="taf_attempt" />);

    await user.upload(
      screen.getByTestId("activity-file-input"),
      new File(["FIT"], "curto.fit")
    );

    expect(await screen.findByTestId("taf-bounds-warning")).toBeInTheDocument();
    expect(screen.getByTestId("save-imported-attempt-btn")).toBeDisabled();

    // Novo arquivo dentro dos limites sem callback onAttemptImported -> exibe banner com link para /meu-taf
    rerender(<GpxImportPanel defaultSaveAs="taf_attempt" key="valid" />);
    await user.upload(
      screen.getByTestId("activity-file-input"),
      new File(["FIT"], "cooper_ok.fit")
    );

    await user.click(await screen.findByTestId("save-imported-attempt-btn"));
    const banner = await screen.findByTestId("taf-import-saved-banner");
    expect(banner).toHaveTextContent("2640 m");
    expect(within(banner).getByRole("link", { name: /Ver no Meu TAF/i })).toHaveAttribute(
      "href",
      "/meu-taf"
    );
  });

  it("preserva source, externalId, shoeName, FC e targetDurationSeconds=720 ao editar um Simulado TAF importado via TafAttemptForm", async () => {
    const user = userEvent.setup();
    const importedShortAttempt: TafAttempt = {
      id: "att-edit-fit-1",
      source: "fit_upload",
      externalId: "fit_short_cooper_123",
      testDate: "2026-11-14T06:30:00.000Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 600,
      distanceMeters: 2100,
      speedKmh: 12.6,
      paceSeconds: 286,
      paceFormatted: "4:46",
      locationType: "esteira",
      shoeName: "Adidas Adios Pro 3",
      avgHeartRate: 171,
      maxHeartRate: 185,
      notes: "Original",
      laps: cooperPreview.tafWindow!.laps.slice(0, 5),
      createdAt: "2026-11-14T06:45:00.000Z",
      updatedAt: "2026-11-14T06:45:00.000Z",
    };

    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TafAttemptForm
        editingAttempt={importedShortAttempt}
        onSave={onSave}
        onCancelEdit={vi.fn()}
      />
    );

    const notesInput = screen.getByPlaceholderText(/Pista da UNIFOR/i);
    await user.clear(notesInput);
    await user.type(notesInput, "Nota editada pelo atleta");

    await user.click(screen.getByTestId("submit-attempt-btn"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const editedPayload = onSave.mock.calls[0][0] as TafAttempt;

    expect(editedPayload.id).toBe("att-edit-fit-1");
    expect(editedPayload.source).toBe("fit_upload");
    expect(editedPayload.externalId).toBe("fit_short_cooper_123");
    expect(editedPayload.targetDurationSeconds).toBe(720);
    expect(editedPayload.actualDurationSeconds).toBe(600);
    expect(editedPayload.shoeName).toBe("Adidas Adios Pro 3");
    expect(editedPayload.avgHeartRate).toBe(171);
    expect(editedPayload.maxHeartRate).toBe(185);
    expect(editedPayload.notes).toBe("Nota editada pelo atleta");
  });
});
