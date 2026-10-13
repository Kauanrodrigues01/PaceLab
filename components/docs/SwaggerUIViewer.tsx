"use client";

import { useEffect, useRef, useState } from "react";
import "swagger-ui-dist/swagger-ui.css";
import "./swagger-theme.css";
import { swaggerSpec } from "@/lib/swagger/spec";

export function SwaggerUIViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function initSwagger() {
      try {
        const SwaggerUIBundle = (await import("swagger-ui-dist/swagger-ui-bundle")).default;
        const SwaggerUIStandalonePreset = (await import("swagger-ui-dist/swagger-ui-standalone-preset")).default;

        if (!isMounted || !containerRef.current) return;

        SwaggerUIBundle({
          spec: swaggerSpec,
          domNode: containerRef.current,
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset,
          ],
          layout: "BaseLayout",
          docExpansion: "list",
          defaultModelsExpandDepth: 1,
          defaultModelExpandDepth: 1,
          tryItOutEnabled: true,
          displayRequestDuration: true,
        });

        if (isMounted) {
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Erro ao carregar Swagger UI");
          setIsLoading(false);
        }
      }
    }

    initSwagger();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="w-full">
      {isLoading && (
        <div className="flex flex-col items-center justify-center p-16 text-slate-500 dark:text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-4" />
          <p className="text-sm font-medium">Carregando documentação interativa da API...</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm">
          Falha ao renderizar documentação: {error}
        </div>
      )}

      <div
        ref={containerRef}
        id="swagger-ui-container"
        className="swagger-custom-theme rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800"
      />
    </div>
  );
}
