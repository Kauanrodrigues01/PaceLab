/**
 * Utilitário central de validação de ambiente (Fail-Fast e Diagnóstico do Banco)
 * PaceLab - Arquitetura Segura
 */

export interface DatabaseEnvConfig {
  isConfigured: boolean;
  databaseUrl?: string;
  directUrl?: string;
  host?: string;
  port?: string;
  error?: string;
}

/**
 * Analisa as variáveis de ambiente do banco de dados e retorna o status detalhado.
 */
export function getDatabaseEnvConfig(): DatabaseEnvConfig {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const directUrl = process.env.DIRECT_URL?.trim();

  if (!databaseUrl) {
    return {
      isConfigured: false,
      error: "DATABASE_URL não configurada no ambiente.",
    };
  }

  try {
    const url = new URL(databaseUrl);
    if (!url.protocol.startsWith("postgres")) {
      return {
        isConfigured: false,
        error: "DATABASE_URL inválida. O protocolo deve ser postgresql:// ou postgres://",
      };
    }

    return {
      isConfigured: true,
      databaseUrl,
      directUrl,
      host: url.hostname,
      port: url.port || "5432",
    };
  } catch {
    return {
      isConfigured: false,
      error: "DATABASE_URL possui uma estrutura de URL malformada.",
    };
  }
}

let hasWarned = false;

/**
 * Emite aviso no console do servidor Next.js caso as variáveis de banco estejam ausentes.
 * Não quebra o build estático, garantindo a resiliência das calculadoras públicas.
 */
export function logDatabaseEnvStatus(): void {
  if (hasWarned) return;
  const config = getDatabaseEnvConfig();

  if (!config.isConfigured) {
    hasWarned = true;
    console.warn(
      `\n\x1b[33m[PaceLab]\x1b[0m ⚠️  Aviso de Conexão: ${config.error}\n` +
      `[PaceLab] ℹ️  A aplicação manterá a operação resiliente via Modo Local (Offline First com localStorage).\n`
    );
  }
}
