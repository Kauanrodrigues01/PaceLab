#!/usr/bin/env node
/**
 * PaceLab - Script de Verificação Pré-Vôo do Banco de Dados
 * Testa conexão ativa com PostgreSQL (Supabase / Neon / Local)
 * Uso: npm run db:check
 */

import { PrismaClient } from "@prisma/client";

function maskConnectionString(urlStr) {
  try {
    const url = new URL(urlStr);
    const user = url.username || "postgres";
    const host = url.hostname;
    const port = url.port || "5432";
    const db = url.pathname.replace(/^\//, "");
    return `postgresql://${user}:******@${host}:${port}/${db}`;
  } catch {
    return "URL_CONFIGURADA (mascara indisponivel)";
  }
}

async function runCheck() {
  console.log("\n=======================================================");
  console.log(" 🏃 PaceLab — Verificação de Conexão com o Banco SQL");
  console.log("=======================================================\n");

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const directUrl = process.env.DIRECT_URL?.trim();

  // 1. Validação de Variáveis
  if (!databaseUrl) {
    console.error("❌ ERRO: A variável DATABASE_URL não foi encontrada no ambiente!");
    console.error("👉 Verifique se o arquivo .env existe e contém a connection string.");
    console.error("=======================================================\n");
    process.exit(1);
  }

  console.log("✔ DATABASE_URL encontrada:");
  console.log(`  ↳ ${maskConnectionString(databaseUrl)}`);

  if (directUrl) {
    console.log("✔ DIRECT_URL encontrada:");
    console.log(`  ↳ ${maskConnectionString(directUrl)}`);
  } else {
    console.log("ℹ DIRECT_URL não definida (usando DATABASE_URL como fallback direto)");
  }

  console.log("\n⏳ Testando handshake e consulta SQL ativa com o PostgreSQL...");

  const prisma = new PrismaClient({
    log: ["error"],
  });

  const startTime = Date.now();

  try {
    // 2. Consulta de pulso
    const result = await prisma.$queryRaw`SELECT 1 as connected, NOW() as current_time;`;
    const latency = Date.now() - startTime;

    console.log(`✔ Conexão estabelecida com sucesso! (${latency}ms)`);

    // 3. Verificação das tabelas do PaceLab
    console.log("\n⏳ Inspecionando integridade das tabelas do Prisma...");

    const [goalsCount, attemptsCount, trainingsCount] = await Promise.all([
      prisma.tafGoal.count().catch(() => null),
      prisma.tafAttempt.count().catch(() => null),
      prisma.trainingSession.count().catch(() => null),
    ]);

    if (goalsCount === null || attemptsCount === null || trainingsCount === null) {
      console.warn("⚠️  Aviso: As tabelas ainda não foram sincronizadas no banco!");
      console.warn("👉 Execute: npx prisma db push para criar as tabelas no Supabase.");
    } else {
      console.log("✔ Tabelas detectadas e sincronizadas:");
      console.log(`  ├── taf_goals: ${goalsCount} registro(s)`);
      console.log(`  ├── taf_attempts: ${attemptsCount} simulado(s) de 12 min`);
      console.log(`  └── taf_trainings: ${trainingsCount} treino(s) registrado(s)`);
    }

    console.log("\n=======================================================");
    console.log(" ✨ SUCESSO: Banco de dados 100% operacional para o deploy!");
    console.log("=======================================================\n");
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ FALHA AO CONECTAR COM O BANCO DE DADOS:");
    console.error(`  ↳ ${err instanceof Error ? err.message : String(err)}`);
    console.error("\n💡 Dicas para resolução:");
    console.error("  1. Verifique se a senha no .env possui caracteres como @ e se foi codificada (ex: %40).");
    console.error("  2. Confirme se o projeto no Supabase está ativo (não pausado).");
    console.error("  3. Verifique a porta do Pooler (6543) vs Conexão Direta (5432).");
    console.error("=======================================================\n");
    await prisma.$disconnect();
    process.exit(1);
  }
}

runCheck();
