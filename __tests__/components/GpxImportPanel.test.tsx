import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GpxImportPanel } from "@/components/treinos/GpxImportPanel";
import { TrainingCard } from "@/components/meu-taf/TrainingCard";
import { TrainingList } from "@/components/meu-taf/TrainingList";
import { TrainingForm } from "@/components/meu-taf/TrainingForm";
import TreinosPage from "@/app/treinos/page";
import { tafService } from "@/lib/services/tafService";
import { profileService } from "@/lib/services/profileService";
import {
  ACTIVITY_TYPES,
  ActivityParsePreview,
  TrainingSession,
} from "@/types";
import { CreateTrainingSessionSchema } from "@/lib/validations/taf";

vi.mock("@/lib/services/tafService", () => ({
  tafService: {
    getTrainings: vi.fn(),
    parseActivity: vi.fn(),
    parseGpx: vi.fn(),
    saveTraining: vi.fn(),
    deleteTraining: vi.fn(),
  },
}));

vi.mock("@/lib/services/profileService", () => ({
  profileService: {
    getProfile: vi.fn(),
  },
}));

const mockFitOnlyPreview: ActivityParsePreview = {
  source: "fit_upload",
  filesUsed: ["fit"],
  name: null, // .FIT original não traz título do Strava
  rawType: "running",
  sourceActivityKind: "run",
  isIndoor: false,
  externalId: "fit_abc1234567890",
  startedAt: "2026-11-14T09:00:00.000Z",
  distanceKm: 6.0,
  durationSeconds: 1800,
  elapsedSeconds: 1845,
  paceSeconds: 300,
  paceFormatted: "5:00",
  speedKmh: 12.0,
  elevationGainM: 42,
  avgHeartRate: null, // Sem cinta cardíaca -> "—" e NUNCA pede input manual
  maxHeartRate: null,
  avgCadence: 176,
  activeCalories: 410,
  avgTemperatureC: null,
  pointCount: 1800,
  splits: [
    {
      kilometer: 1,
      distanceKm: 1.0,
      durationSeconds: 305,
      paceSeconds: 305,
      paceFormatted: "5:05",
      elevationDiffM: 8,
      avgHeartRate: null,
    },
    {
      kilometer: 2,
      distanceKm: 1.0,
      durationSeconds: 295,
      paceSeconds: 295,
      paceFormatted: "4:55",
      elevationDiffM: 6,
      avgHeartRate: null,
    },
  ],
  laps: [],
  warnings: [],
  alreadyExists: false,
  existingTrainingId: null,
  suggestedActivityType: "corrida_continua",
  suggestedNotes: "",
  allowedActivityTypes: [...ACTIVITY_TYPES],
};

const mockMergedFitGpxPreview: ActivityParsePreview = {
  ...mockFitOnlyPreview,
  filesUsed: ["fit", "gpx"],
  name: "Tiros de Pista Strava",
  avgHeartRate: 164,
  maxHeartRate: 182,
  warnings: [
    {
      code: "MISMATCHED_ACTIVITY_FILES",
      message:
        "Atenção: os arquivos .FIT e .GPX possuem horários de início com diferença de 8 min e parecem ser de treinos diferentes.",
    },
  ],
};

describe("Fase 7 — Upload Unificado (.FIT + .GPX), Painel Somente Leitura e Formulário Pós-Upload Inteligente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.clear();
    }
    vi.mocked(profileService.getProfile).mockResolvedValue({
      id: "prof-1",
      userId: "user-1",
      name: "Atleta PaceLab",
      currentWeightKg: 76.5,
      heightCm: 178,
      birthDate: "1996-05-10",
      gender: "M",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-14T00:00:00.000Z",
    });
    vi.mocked(tafService.getTrainings).mockResolvedValue([]);
  });

  it("1. Upload de .FIT isolado: exibe telemetria somente leitura ('—' para sensores ausentes), destaca campo de Título vazio e NUNCA pede inputs manuais de sensores", async () => {
    vi.mocked(tafService.parseActivity).mockResolvedValueOnce(mockFitOnlyPreview);
    const onImported = vi.fn();
    const user = userEvent.setup();

    render(<GpxImportPanel onImported={onImported} />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    const fitFile = new File([new Uint8Array([1, 2, 3, 4])], "1234567890.fit", {
      type: "application/octet-stream",
    });

    await user.upload(fileInput, fitFile);

    await waitFor(() => {
      expect(tafService.parseActivity).toHaveBeenCalledWith([fitFile]);
    });

    // Painel somente leitura renderizado
    const previewCard = await screen.findByTestId("gpx-preview-card");
    expect(previewCard).toBeInTheDocument();
    expect(within(previewCard).getByTestId("preview-metric-distance")).toHaveTextContent("6.00");
    expect(within(previewCard).getByTestId("preview-metric-pace")).toHaveTextContent("5:00");
    expect(within(previewCard).getByTestId("preview-metric-elevation")).toHaveTextContent("+42 m");
    expect(within(previewCard).getByTestId("preview-metric-cadence")).toHaveTextContent("176 spm");
    // FC ausente no .FIT deve mostrar apenas "—"
    expect(within(previewCard).getByTestId("preview-metric-hr")).toHaveTextContent("—");

    // Formulário inteligente pós-upload
    const smartForm = screen.getByTestId("smart-post-upload-form");
    expect(smartForm).toBeInTheDocument();

    // Como o .FIT não trouxe título nem nome descritivo (ID numérico), o badge de destaque deve aparecer e o campo deve estar vazio
    expect(screen.getByTestId("title-highlight-badge")).toHaveTextContent(
      "Destaque • Nomeie seu treino"
    );
    const titleInput = screen.getByTestId(
      "post-upload-title-input"
    ) as HTMLInputElement;
    expect(titleInput.value).toBe("");

    // Peso corporal pré-preenchido automaticamente com UserProfile.currentWeightKg (76.5)
    await waitFor(() => {
      const weightInput = screen.getByTestId(
        "post-upload-weight-input"
      ) as HTMLInputElement;
      expect(weightInput.value).toBe("76.5");
    });

    // REGRA CRÍTICA DO ADENDO: NUNCA pedir para o usuário preencher sensores ausentes (FC, cadência, elevação ou splits)
    expect(within(smartForm).queryByLabelText(/FC Média/i)).not.toBeInTheDocument();
    expect(within(smartForm).queryByLabelText(/FC Máxima/i)).not.toBeInTheDocument();
    expect(within(smartForm).queryByLabelText(/Cadência/i)).not.toBeInTheDocument();
    expect(
      within(smartForm).queryByLabelText(/Ganho de Elevação/i)
    ).not.toBeInTheDocument();
  });

  it("2. Upload mesclado (.FIT + .GPX): pré-preenche título do .GPX, exibe warning de coerência e salva treino com telemetria completa", async () => {
    vi.mocked(tafService.parseActivity).mockResolvedValueOnce(
      mockMergedFitGpxPreview
    );
    vi.mocked(tafService.saveTraining).mockImplementation(async (session) => ({
      ...session,
      id: "saved-fit-gpx-1",
    }));

    const onImported = vi.fn();
    const user = userEvent.setup();

    render(<GpxImportPanel onImported={onImported} />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    const fitFile = new File([new Uint8Array([1, 2, 3])], "workout.fit");
    const gpxFile = new File(["<gpx></gpx>"], "Voltando.gpx");

    await user.upload(fileInput, [fitFile, gpxFile]);

    await waitFor(() => {
      expect(tafService.parseActivity).toHaveBeenCalledWith([fitFile, gpxFile]);
    });

    // Badge de mesclagem e warning de coerência exibidos
    expect(await screen.findByTestId("preview-source-badge")).toHaveTextContent(
      /Strava FIT \+ GPX \(Mesclado\)/i
    );
    expect(screen.getByTestId("preview-mismatch-warning")).toHaveTextContent(
      /8 min/i
    );

    // Título pré-preenchido a partir do <trk><name> do .GPX
    const titleInput = screen.getByTestId(
      "post-upload-title-input"
    ) as HTMLInputElement;
    expect(titleInput.value).toBe("Tiros de Pista Strava");

    // Preenche campos contextuais simples
    await user.selectOptions(
      screen.getByTestId("post-upload-activity-select"),
      "corrida_intervalada"
    );
    await user.click(screen.getByTestId("post-upload-rpe-btn-8"));
    await user.type(
      screen.getByTestId("post-upload-shoe-input"),
      "Nike Vaporfly 3"
    );
    await user.type(
      screen.getByTestId("post-upload-notes-input"),
      "Sensação ótima nos tiros"
    );

    // Confirma importação
    await user.click(screen.getByTestId("save-imported-training-btn"));

    await waitFor(() => {
      expect(tafService.saveTraining).toHaveBeenCalledTimes(1);
    });

    const [savedPayload, isUpdate] = vi.mocked(tafService.saveTraining).mock
      .calls[0];
    expect(isUpdate).toBe(false);
    expect((savedPayload as TrainingSession & { onDuplicate?: string }).onDuplicate).toBeUndefined();
    expect(savedPayload.source).toBe("fit_upload");
    expect(savedPayload.externalId).toBe("fit_abc1234567890");
    expect(savedPayload.activityType).toBe("corrida_intervalada");
    expect(savedPayload.perceivedEffort).toBe(8);
    expect(savedPayload.shoeName).toBe("Nike Vaporfly 3");
    expect(savedPayload.notes).toBe(
      "Tiros de Pista Strava — Sensação ótima nos tiros"
    );
    expect(savedPayload.avgHeartRate).toBe(164);
    expect(savedPayload.maxHeartRate).toBe(182);
    expect(savedPayload.elevationGainM).toBe(42);
    expect(savedPayload.avgCadence).toBe(176);
    expect(savedPayload.splits).toHaveLength(2);
    expect(onImported).toHaveBeenCalledWith(
      expect.objectContaining({ id: "saved-fit-gpx-1" }),
      false
    );
  });

  it("3. Detecção de duplicidade: exibe alerta quando alreadyExists=true e permite atualizar treino existente com onDuplicate='update'", async () => {
    vi.mocked(tafService.parseActivity).mockResolvedValueOnce({
      ...mockFitOnlyPreview,
      name: "Treino Matinal",
      alreadyExists: true,
      existingTrainingId: "existing-id-99",
    });
    vi.mocked(tafService.saveTraining).mockImplementation(async (session) => ({
      ...session,
      id: "existing-id-99",
    }));

    const onImported = vi.fn();
    const user = userEvent.setup();

    render(<GpxImportPanel onImported={onImported} />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, new File(["fit"], "dup.fit"));

    const dupAlert = await screen.findByTestId("duplicate-training-alert");
    expect(dupAlert).toBeInTheDocument();

    const updateBtn = screen.getByTestId("update-existing-training-btn");
    await user.click(updateBtn);

    await waitFor(() => {
      expect(tafService.saveTraining).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "existing-id-99",
          externalId: "fit_abc1234567890",
          onDuplicate: "update",
        }),
        false
      );
    });
    expect(onImported).toHaveBeenCalledWith(
      expect.objectContaining({ id: "existing-id-99" }),
      true
    );
  });

  it("4. Validação client-side + Fallback básico: rejeita extensão inválida e recalcula pace/calorias quando arquivo não traz distância/duração", async () => {
    const user = userEvent.setup({ applyAccept: false });
    vi.mocked(tafService.parseActivity).mockResolvedValueOnce({
      ...mockFitOnlyPreview,
      startedAt: "",
      distanceKm: 0,
      durationSeconds: 0,
      elapsedSeconds: 0,
      speedKmh: 0,
      paceSeconds: 0,
      paceFormatted: "--:--",
      activeCalories: null,
      splits: [],
    });
    vi.mocked(tafService.saveTraining).mockImplementation(async (session) => ({
      ...session,
      id: "saved-fallback-1",
    }));

    render(<GpxImportPanel onImported={vi.fn()} />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    const invalidFile = new File(["hello"], "notas.txt", {
      type: "text/plain",
    });

    await user.upload(fileInput, invalidFile);

    expect(await screen.findByTestId("import-error-message")).toHaveTextContent(
      /Formato inválido/i
    );
    expect(tafService.parseActivity).not.toHaveBeenCalled();

    // Envia arquivo .FIT incompleto sem distância/duração/data -> libera fallback básico
    const incompleteFit = new File([new Uint8Array([1, 2])], "incompleto.fit");
    await user.upload(fileInput, incompleteFit);

    const fallbackBox = await screen.findByTestId("fallback-basic-inputs");
    expect(fallbackBox).toBeInTheDocument();

    await user.type(screen.getByTestId("fallback-distance-input"), "4.2");
    await user.type(screen.getByTestId("fallback-duration-input"), "1260");

    await waitFor(() => {
      const weightInput = screen.getByTestId(
        "post-upload-weight-input"
      ) as HTMLInputElement;
      expect(weightInput.value).toBe("76.5");
    });

    await user.click(screen.getByTestId("save-imported-training-btn"));

    await waitFor(() => {
      expect(tafService.saveTraining).toHaveBeenCalledTimes(1);
    });

    const [savedFallback] = vi.mocked(tafService.saveTraining).mock.calls[0];
    expect(savedFallback.distanceKm).toBe(4.2);
    expect(savedFallback.durationSeconds).toBe(1260);
    expect(savedFallback.paceSeconds).toBe(300);
    expect(savedFallback.paceFormatted).toBe("5:00");
    expect(savedFallback.speedKmh).toBe(12);
    expect(savedFallback.activeCalories).toBeGreaterThan(0);
  });

  it("5. TrainingCard e TrainingList: exibem badges de origem/telemetria apenas quando presentes e filtram por origem e tênis", async () => {
    const user = userEvent.setup();
    const trainings: TrainingSession[] = [
      {
        id: "t-fit",
        sessionDate: new Date().toISOString(),
        activityType: "tempo_run",
        source: "fit_upload",
        externalId: "fit_1",
        distanceKm: 8.0,
        durationSeconds: 2160,
        speedKmh: 13.33,
        paceSeconds: 270,
        paceFormatted: "4:30",
        avgHeartRate: 168,
        maxHeartRate: 185,
        elevationGainM: 55,
        avgCadence: 180,
        shoeName: "Adidas Adizero Adios Pro 3",
        activeCalories: 590,
        calorieSource: "device_fit",
        splits: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "t-gpx",
        sessionDate: new Date().toISOString(),
        activityType: "corrida_continua",
        source: "gpx_upload",
        externalId: "gpx_2",
        distanceKm: 6.2,
        durationSeconds: 1860,
        speedKmh: 12.0,
        paceSeconds: 300,
        paceFormatted: "5:00",
        splits: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "t-manual",
        sessionDate: new Date().toISOString(),
        activityType: "rodagem_leve",
        source: "manual",
        distanceKm: 5.0,
        durationSeconds: 1800,
        speedKmh: 10.0,
        paceSeconds: 360,
        paceFormatted: "6:00",
        splits: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    render(
      <TrainingList
        trainings={trainings}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const fitCard = screen.getByTestId("training-card-t-fit");
    expect(within(fitCard).getByTestId("badge-source")).toHaveTextContent(
      "Strava FIT"
    );
    expect(within(fitCard).getByTestId("badge-hr")).toHaveTextContent(
      "168/185 bpm"
    );
    expect(within(fitCard).getByTestId("badge-elevation")).toHaveTextContent(
      "+55 m"
    );
    expect(within(fitCard).getByTestId("badge-cadence")).toHaveTextContent(
      "180 spm"
    );
    expect(within(fitCard).getByTestId("badge-shoe")).toHaveTextContent(
      "Adidas Adizero Adios Pro 3"
    );
    expect(within(fitCard).getByTestId("badge-calories")).toHaveAttribute(
      "title",
      expect.stringContaining("Dispositivo (.FIT)")
    );

    const gpxCard = screen.getByTestId("training-card-t-gpx");
    expect(within(gpxCard).getByTestId("badge-source")).toHaveTextContent(
      "Strava GPX"
    );

    const manualCard = screen.getByTestId("training-card-t-manual");
    expect(within(manualCard).queryByTestId("badge-source")).not.toBeInTheDocument();
    expect(within(manualCard).queryByTestId("badge-hr")).not.toBeInTheDocument();
    expect(within(manualCard).queryByTestId("badge-elevation")).not.toBeInTheDocument();

    // Filtra apenas por Strava FIT (via pills para manter um único <select> na página)
    await user.click(screen.getByTestId("filter-source-fit"));
    expect(screen.getByTestId("training-card-t-fit")).toBeInTheDocument();
    expect(screen.queryByTestId("training-card-t-gpx")).not.toBeInTheDocument();
    expect(screen.queryByTestId("training-card-t-manual")).not.toBeInTheDocument();

    // Filtra apenas por Strava GPX
    await user.click(screen.getByTestId("filter-source-gpx"));
    expect(screen.getByTestId("training-card-t-gpx")).toBeInTheDocument();
    expect(screen.queryByTestId("training-card-t-fit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("training-card-t-manual")).not.toBeInTheDocument();

    // Volta para qualquer origem e busca pelo nome do tênis
    await user.click(screen.getByTestId("filter-source-all"));
    const searchInput = screen.getByPlaceholderText(
      /Buscar por notas ou tênis/i
    );
    await user.type(searchInput, "Adizero");
    expect(screen.getByTestId("training-card-t-fit")).toBeInTheDocument();
    expect(screen.queryByTestId("training-card-t-gpx")).not.toBeInTheDocument();
    expect(screen.queryByTestId("training-card-t-manual")).not.toBeInTheDocument();
  });

  it("6. TrainingForm: seção 'Dados Avançados / Telemetria' inicia recolhida e preserva source/externalId/splits/calorias .FIT ao editar treino importado", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    const importedTraining: TrainingSession = {
      id: "t-imported-edit",
      sessionDate: "2026-11-14T10:00:00.000Z",
      activityType: "longao",
      source: "fit_upload",
      externalId: "fit_keep_me",
      distanceKm: 12.0,
      durationSeconds: 3600,
      elapsedSeconds: 3720,
      speedKmh: 12.0,
      paceSeconds: 300,
      paceFormatted: "5:00",
      avgHeartRate: 158,
      maxHeartRate: 175,
      elevationGainM: 110,
      avgCadence: 172,
      shoeName: "Asics Superblast",
      activeCalories: 780,
      totalCalories: 780,
      metValue: null,
      calorieMethod: "garmin_fit_device",
      calorieSource: "device_fit",
      calorieMetadata: { source: "fit_session_total_calories" },
      splits: [
        {
          kilometer: 1,
          distanceKm: 1.0,
          durationSeconds: 300,
          paceSeconds: 300,
          paceFormatted: "5:00",
        },
      ],
      createdAt: "2026-11-14T10:00:00.000Z",
      updatedAt: "2026-11-14T10:00:00.000Z",
    };

    render(
      <TrainingForm
        editingTraining={importedTraining}
        onSave={onSave}
        onCancelEdit={vi.fn()}
      />
    );

    // Painel avançado começa fechado por padrão
    expect(
      screen.queryByTestId("advanced-telemetry-panel")
    ).not.toBeInTheDocument();

    // Abre painel avançado e verifica valores carregados
    await user.click(screen.getByTestId("toggle-advanced-telemetry"));
    expect(screen.getByTestId("advanced-telemetry-panel")).toBeInTheDocument();
    expect(
      (screen.getByTestId("advanced-shoe-input") as HTMLInputElement).value
    ).toBe("Asics Superblast");

    // Salva e verifica que source, externalId, splits e calorias .FIT originais foram preservados
    await user.click(screen.getByTestId("submit-training-btn"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "t-imported-edit",
          source: "fit_upload",
          externalId: "fit_keep_me",
          avgHeartRate: 158,
          maxHeartRate: 175,
          elevationGainM: 110,
          avgCadence: 172,
          shoeName: "Asics Superblast",
          activeCalories: 780,
          calorieSource: "device_fit",
          splits: importedTraining.splits,
        })
      );
    });
  });

  it("7. TreinosPage: integra botão 'Importar .FIT / .GPX', alternância entre Registro Manual e Importação, e adiciona treino importado à lista", async () => {
    const user = userEvent.setup();
    vi.mocked(tafService.getTrainings).mockResolvedValue([]);
    vi.mocked(tafService.parseActivity).mockResolvedValueOnce({
      ...mockMergedFitGpxPreview,
      warnings: [],
    });
    vi.mocked(tafService.saveTraining).mockImplementation(async (session) => ({
      ...session,
      id: "page-imported-1",
    }));

    render(<TreinosPage />);

    // Aguarda carregamento inicial
    const importBtn = await screen.findByTestId("open-import-panel-btn");
    await user.click(importBtn);

    // Alternador manual/import acessível via role="tablist"
    const switcher = screen.getByTestId("training-entry-mode-switcher");
    expect(switcher).toHaveAttribute("role", "tablist");
    expect(screen.getByTestId("mode-import-btn")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByTestId("gpx-import-panel")).toBeInTheDocument();

    // Alterna para manual e volta para importação
    await user.click(screen.getByTestId("mode-manual-btn"));
    expect(screen.getByTestId("mode-manual-btn")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.queryByTestId("gpx-import-panel")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("mode-import-btn"));
    expect(screen.getByTestId("gpx-import-panel")).toBeInTheDocument();

    // Faz upload e confirma importação
    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, [
      new File([new Uint8Array([1, 2, 3])], "workout.fit"),
      new File(["<gpx></gpx>"], "Voltando.gpx"),
    ]);

    await screen.findByTestId("smart-post-upload-form");
    await user.click(screen.getByTestId("save-imported-training-btn"));

    await waitFor(() => {
      expect(tafService.saveTraining).toHaveBeenCalledTimes(1);
    });

    // Treino importado aparece imediatamente na lista com badge Strava FIT
    const card = await screen.findByTestId("training-card-page-imported-1");
    expect(within(card).getByTestId("badge-source")).toHaveTextContent(
      "Strava FIT"
    );
  });

  it("8. Upload de .GPX isolado (fallback integral): exibe badge Strava GPX, tabela de splits somente leitura e salva com source='gpx_upload'", async () => {
    const user = userEvent.setup();
    vi.mocked(tafService.parseActivity).mockResolvedValueOnce({
      ...mockFitOnlyPreview,
      source: "gpx_upload",
      filesUsed: ["gpx"],
      name: "Voltando do Parque",
      externalId: "gpx_only_hash",
      avgCadence: null,
      activeCalories: null,
    });
    vi.mocked(tafService.saveTraining).mockImplementation(async (session) => ({
      ...session,
      id: "saved-gpx-only-1",
    }));

    const onImported = vi.fn();
    render(<GpxImportPanel onImported={onImported} />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, new File(["<gpx></gpx>"], "Voltando.gpx"));

    expect(await screen.findByTestId("preview-source-badge")).toHaveTextContent(
      /Strava \.GPX/i
    );
    expect(screen.getByTestId("preview-splits-table")).toBeInTheDocument();
    expect(screen.getByTestId("preview-metric-cadence")).toHaveTextContent("—");
    expect(
      (screen.getByTestId("post-upload-title-input") as HTMLInputElement).value
    ).toBe("Voltando do Parque");

    await user.click(screen.getByTestId("save-imported-training-btn"));

    await waitFor(() => {
      expect(tafService.saveTraining).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "gpx_upload",
          externalId: "gpx_only_hash",
          notes: "Voltando do Parque",
        }),
        false
      );
    });
  });

  it("9. Compatibilidade Zod + Upload sequencial (.FIT depois .GPX) + activeCalories=0 sem peso: valida payload final contra CreateTrainingSessionSchema real", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const fitFile = new File([new Uint8Array([1, 2, 3])], "seq.fit");
    const gpxFile = new File(["<gpx></gpx>"], "seq.gpx");

    vi.mocked(tafService.parseActivity)
      .mockResolvedValueOnce({
        ...mockFitOnlyPreview,
        activeCalories: 0,
      })
      .mockResolvedValueOnce({
        ...mockMergedFitGpxPreview,
        activeCalories: 0,
        warnings: [],
      });
    vi.mocked(tafService.saveTraining).mockImplementation(async (session) => ({
      ...session,
      id: "saved-seq-1",
    }));

    render(<GpxImportPanel onImported={vi.fn()} />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;

    // 1) Seleciona apenas .FIT
    await user.upload(fileInput, fitFile);
    expect(await screen.findByTestId("selected-files-badges")).toHaveTextContent(
      "seq.fit"
    );

    // 2) Seleciona .GPX em seguida -> deve combinar [fitFile, gpxFile]
    await user.upload(fileInput, gpxFile);
    await waitFor(() => {
      expect(tafService.parseActivity).toHaveBeenLastCalledWith([
        fitFile,
        gpxFile,
      ]);
    });

    // 3) Arquivo inválido depois do preview deve limpar preview e badges antigos
    await user.upload(fileInput, new File(["bad"], "bad.csv"));
    expect(await screen.findByTestId("import-error-message")).toBeInTheDocument();
    expect(screen.queryByTestId("selected-files-badges")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gpx-preview-card")).not.toBeInTheDocument();

    // 4) Re-upload válido de .FIT com activeCalories=0 e sem peso corporal -> payload válido no Zod
    vi.mocked(tafService.parseActivity).mockResolvedValueOnce({
      ...mockFitOnlyPreview,
      activeCalories: 0,
    });
    await user.upload(fileInput, fitFile);
    await screen.findByTestId("smart-post-upload-form");

    const weightInput = screen.getByTestId("post-upload-weight-input");
    await user.clear(weightInput);

    await user.click(screen.getByTestId("save-imported-training-btn"));
    await waitFor(() => {
      expect(tafService.saveTraining).toHaveBeenCalledTimes(1);
    });

    const [savedPayload] = vi.mocked(tafService.saveTraining).mock.calls[0];
    expect(savedPayload.activeCalories).toBeNull();
    const zodResult = CreateTrainingSessionSchema.safeParse(savedPayload);
    expect(zodResult.success).toBe(true);
  });

  it("10. Fase 2: pré-preenche workoutTitle a partir de arquivo .FIT com underscores e permite edição/limpeza dinâmica", async () => {
    const user = userEvent.setup();
    vi.mocked(tafService.parseActivity)
      .mockResolvedValueOnce({
        ...mockFitOnlyPreview,
        name: null,
        suggestedNotes: "Caminhada leve",
        titleSource: "filename",
      })
      .mockResolvedValueOnce({
        ...mockFitOnlyPreview,
        name: null,
        suggestedNotes: "", // Simula resposta legada sem suggestedNotes para testar fallback local
      });
    vi.mocked(tafService.saveTraining).mockImplementation(async (session) => ({
      ...session,
      id: "saved-filename-title-1",
    }));

    render(<GpxImportPanel onImported={vi.fn()} />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;

    // Upload 1: backend envia suggestedNotes="Caminhada leve" + titleSource="filename"
    await user.upload(
      fileInput,
      new File([new Uint8Array([1, 2, 3])], "Caminhada_leve.fit")
    );

    const titleInput = (await screen.findByTestId(
      "post-upload-title-input"
    )) as HTMLInputElement;
    expect(titleInput.value).toBe("Caminhada leve");
    expect(screen.getByTestId("title-highlight-badge")).toHaveTextContent(
      "Sugerido pelo arquivo • Editável"
    );

    // Se usuário limpar o input, o badge volta a destacar "Destaque • Nomeie seu treino"
    await user.clear(titleInput);
    expect(screen.getByTestId("title-highlight-badge")).toHaveTextContent(
      "Destaque • Nomeie seu treino"
    );

    // Upload 2: fallback local via nome do arquivo mesmo sem suggestedNotes vindo do mock
    await user.upload(
      fileInput,
      new File([new Uint8Array([1, 2, 3])], "Treino_de_tiros_400m.FIT")
    );
    await waitFor(() => {
      expect(
        (screen.getByTestId("post-upload-title-input") as HTMLInputElement).value
      ).toBe("Treino de tiros 400m");
    });
    expect(screen.getByTestId("title-highlight-badge")).toHaveTextContent(
      "Sugerido pelo arquivo • Editável"
    );

    await user.click(screen.getByTestId("save-imported-training-btn"));
    await waitFor(() => {
      expect(tafService.saveTraining).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: "Treino de tiros 400m",
        }),
        false
      );
    });
  });

  it("11. Fase 2: TrainingCard exibe linha discreta de tempo decorrido e pausas apenas quando elapsedSeconds > durationSeconds", () => {
    const baseTraining: TrainingSession = {
      id: "t-pause-test",
      sessionDate: "2026-10-29T20:24:17.000Z",
      activityType: "rodagem_leve",
      source: "fit_upload",
      externalId: "fit_pause_1",
      distanceKm: 2.85,
      durationSeconds: 2126, // 35:26 em movimento
      elapsedSeconds: 2141, // 35:41 decorrido (15s de pausa)
      speedKmh: 4.82,
      paceSeconds: 746,
      paceFormatted: "12:26",
      splits: [],
      createdAt: "2026-10-29T20:24:17.000Z",
      updatedAt: "2026-10-29T20:24:17.000Z",
    };

    const { rerender } = render(
      <TrainingCard
        training={baseTraining}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const card = screen.getByTestId("training-card-t-pause-test");
    expect(card).toHaveTextContent("35:26");
    expect(
      within(card).getByTestId("training-elapsed-pause")
    ).toHaveTextContent("Decorrido: 35:41 • 15s pausa");

    // Pausa >= 60s formata com MM:SS (ex.: 2:00 pausa)
    rerender(
      <TrainingCard
        training={{
          ...baseTraining,
          durationSeconds: 3600,
          elapsedSeconds: 3720,
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(
      within(screen.getByTestId("training-card-t-pause-test")).getByTestId(
        "training-elapsed-pause"
      )
    ).toHaveTextContent("Decorrido: 1:02:00 • 2:00 pausa");

    // Sem pausa (elapsedSeconds === durationSeconds ou null) -> linha não aparece
    rerender(
      <TrainingCard
        training={{
          ...baseTraining,
          elapsedSeconds: 2126,
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(
      screen.queryByTestId("training-elapsed-pause")
    ).not.toBeInTheDocument();
  });

  it("12. Importação individual também infere 'caminhada' quando arquivo vem sem tipo explícito (suggestedActivityType=null) com baixa velocidade ou nome de caminhada", async () => {
    const user = userEvent.setup({ applyAccept: false });

    vi.mocked(tafService.parseActivity).mockResolvedValueOnce({
      ...mockFitOnlyPreview,
      name: "Caminhada leve",
      rawType: null,
      sourceActivityKind: "unknown",
      distanceKm: 2.5,
      durationSeconds: 1800,
      elapsedSeconds: 1800,
      speedKmh: 5.0,
      paceSeconds: 720,
      paceFormatted: "12:00",
      suggestedActivityType: null,
      allowedActivityTypes: [
        "rodagem_leve",
        "corrida_continua",
        "tempo_run",
        "corrida_intervalada",
        "longao",
        "caminhada",
      ],
      warnings: [
        {
          code: "UNKNOWN_ACTIVITY_TYPE",
          message:
            "Modalidade não especificada ou genérica no arquivo .FIT; selecione a modalidade de treino manualmente.",
        },
      ],
    });

    render(<GpxImportPanel />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(
      fileInput,
      new File([new Uint8Array([1, 2, 3])], "Caminhada_leve.fit")
    );

    const activitySelect = (await screen.findByTestId(
      "post-upload-activity-select"
    )) as HTMLSelectElement;
    expect(activitySelect.value).toBe("caminhada");
    expect(screen.getByTestId("post-upload-activity-hint")).toHaveTextContent(
      /Confirme se é corrida ou caminhada/i
    );
  });
});
