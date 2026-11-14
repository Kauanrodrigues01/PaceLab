-- AlterEnum: Adiciona o valor 'fit_upload' ao enum nativo "activity_source" (Fase 5B — Suporte Prioritário a Arquivos .FIT)
ALTER TYPE "activity_source" ADD VALUE IF NOT EXISTS 'fit_upload';
