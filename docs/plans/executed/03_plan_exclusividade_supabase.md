# 📌 Plano de Arquitetura: Persistência Exclusiva no Supabase & Remoção de Sincronização

**Projeto:** PaceLab  
**Data:** 11/10/2026  
**Status:** Concluído com Sucesso (100% Validado)  

---

## 1. 🎯 Objetivo e Contexto

Eliminar a camada híbrida do módulo **Meu TAF** (`/meu-taf`), estabelecendo uma separação estrita e limpa de responsabilidades no PaceLab:

1. **Treinos e Simulados do TAF (`/meu-taf`):**
   - Gravados **única e exclusivamente no Supabase** (PostgreSQL gerenciado via Prisma ORM e rotas de API Next.js).
   - O `localStorage` será **completamente removido** deste módulo (não haverá cópia local de metas, tentativas ou treinos).
2. **Histórico de Cálculos (`/historico`):**
   - Permanece **única e exclusivamente no `localStorage`** (`pacelab_history_v1`).
   - Funciona como um rascunho/bloco de notas rápido das calculadoras (`/calculadora`, `/medias`, `/intervalado`, `/taf`, `/metas`), 100% local e sem consumo de banco.
3. **Remoção da Sincronização / Migração:**
   - Como o projeto está em desenvolvimento e não há base legada a resgatar, a funcionalidade de "Sincronizar dados locais para o Prisma" será **removida por completo** do front-end e do back-end, simplificando o código.

---

## 2. 🏗️ Arquitetura: Antes vs Depois

### Como funciona hoje (Híbrido com Duplicação):
```text
[Atleta salva Treino]
   ├── 1. Grava no localStorage (pacelab_trainings_v1)
   └── 2. Envia para a API (/api/taf/trainings) -> Prisma -> Supabase
   * Botão manual de "Sincronizar" para tentar conciliar ambos.
```

### Como vai funcionar (Arquitetura Nova e Limpa):
```text
[Atleta salva Treino]
   └── Envia direto para a API (/api/taf/trainings) -> Prisma -> SUPABASE
       (Se a requisição for bem-sucedida, atualiza o estado React na tela)
       (Se falhar, avisa o usuário com mensagem clara de erro)

[Atleta calcula Pace na Calculadora]
   └── Clica em "Salvar Cálculo" -> grava apenas no localStorage (pacelab_history_v1)
```

---

## 3. 📂 Mapeamento Completo de Arquivos e Impactos

| Arquivo | Ação | Descrição da Alteração |
| :--- | :---: | :--- |
| `lib/services/tafService.ts` | **Refatorar** | Remover `STORAGE_KEYS` (`GOAL`, `ATTEMPTS`, `TRAININGS`), remover `getLocalItem`/`setLocalItem` e remover `migrateFromLocalStorage`. Tornar todas as operações requisições diretas via `fetch` contra as rotas de API. |
| `app/api/taf/migrate/route.ts` | **Remover** | Rota de migração/sincronização eliminada, pois não há mais dados locais a sincronizar. |
| `components/meu-taf/GoalAndBackupSettings.tsx` | **Refatorar** | Remover card e botão de "Sincronizar dados locais para o Prisma". O backup JSON passa a exportar os dados recebidos do banco. |
| `app/meu-taf/page.tsx` | **Refatorar** | Adicionar estado de carregamento (`isLoading`), tratar erros de conexão de forma explícita e atualizar o badge de status (`Supabase • Conectado` vs `Desconectado`). |
| `components/meu-taf/TafAttemptForm.tsx` | **Refatorar** | Exibir feedback de erro caso a chamada à API do Supabase falhe. |
| `components/meu-taf/TrainingForm.tsx` | **Refatorar** | Exibir feedback de erro caso a chamada à API do Supabase falhe. |
| `__tests__/services/tafService.test.ts` | **Refatorar** | Remover asserções de localStorage e migração; testar chamadas HTTP puras de API (sucesso, edição, deleção e tratamento de erro de rede). |
| `__tests__/api/taf-routes.test.ts` | **Refatorar** | Remover teste da rota `POST /api/taf/migrate`. |
| `__tests__/pages/meu-taf*.test.tsx` | **Refatorar** | Atualizar mocks de teste para simular respostas da API do Supabase em vez de rejeição de fetch para fallback local. |

*(Nota: Nenhum arquivo de `/app/historico/*`, `/lib/storage/localStorage.ts` ou calculadoras será alterado).*

---

## 4. 📋 Passo a Passo de Execução

### Fase 1: Limpeza do Back-end
1. **Remover a Rota de Migração:**
   - Excluir o arquivo `app/api/taf/migrate/route.ts`.
   - Limpar referências nos testes de rota em `__tests__/api/taf-routes.test.ts`.

### Fase 2: Simplificação da Camada de Serviço (`tafService.ts`)
1. **Remover chaves de storage:**
   - Excluir `STORAGE_KEYS.GOAL`, `STORAGE_KEYS.ATTEMPTS` e `STORAGE_KEYS.TRAININGS`.
2. **Operações Diretas no Supabase:**
   - `getGoal()`: chama `GET /api/taf/goals`.
   - `saveGoal(goal)`: chama `POST /api/taf/goals`.
   - `getAttempts()`: chama `GET /api/taf/attempts`. Se a resposta não for OK, lança erro com a mensagem da API.
   - `saveAttempt(attempt)`: se tiver `id` existente no banco, faz `PUT /api/taf/attempts/[id]`, senão faz `POST /api/taf/attempts`.
   - `deleteAttempt(id)`: faz `DELETE /api/taf/attempts/[id]`.
   - `getTrainings()`: chama `GET /api/taf/trainings`.
   - `saveTraining(training)`: se tiver `id`, faz `PUT /api/taf/trainings/[id]`, senão faz `POST /api/taf/trainings`.
   - `deleteTraining(id)`: faz `DELETE /api/taf/trainings/[id]`.
3. **Backup Limpo:**
   - `exportBackupJson(goal, attempts, trainings)`: recebe os dados atuais do banco e gera o arquivo `.json`.
   - `exportAttemptsCsv(attempts)` e `exportTrainingsCsv(trainings)`: mantidos como utilitários puros de formatação.
4. **Remover função `migrateFromLocalStorage()`**.

### Fase 3: Ajustes nos Componentes de Interface
1. **Central de Banco & Configurações (`GoalAndBackupSettings.tsx`):**
   - Remover a caixa inteira de "Sincronizar Dados Locais para o Prisma" e a função `handleMigrate`.
   - Deixar a seção de banco focada exclusivamente no **Status da Conexão com o Supabase** (botão de testar conexão, latência, indicador de saúde).
   - Ajustar a seção de backup para usar os dados passados via props.
2. **Página Principal (`app/meu-taf/page.tsx`):**
   - Adicionar estado `isLoading` inicial com indicador visual de carregamento enquanto consulta o Supabase.
   - Atualizar badge de status:
     - Conectado: `Supabase • PostgreSQL Conectado` (verde).
     - Desconectado: `Offline • Conexão Indisponível` (vermelho).
   - Se houver falha de rede ao abrir a página, exibir banner de aviso com botão "Tentar Novamente".
3. **Formulários (`TafAttemptForm.tsx` e `TrainingForm.tsx`):**
   - Garantir que se a API retornar erro, o formulário capture e exiba o erro sem fechar o modal/card.

### Fase 4: Atualização da Suíte de Testes Automatizados
1. Atualizar `__tests__/services/tafService.test.ts` para testar as requisições diretas contra a API.
2. Atualizar as suítes de páginas (`meu-taf.test.tsx`, `meu-taf-trainings.test.tsx`, `meu-taf-period-and-backup.test.tsx`, `meu-taf-evolution.test.tsx`) com mocks de `fetch` que retornam JSON de sucesso.
3. Executar `npm test` garantindo **100% dos testes passando**.

### Fase 5: Homologação e Build Final
1. `npm run lint` com 0 erros. (✅ Concluído - 0 erros e 0 warnings)
2. `npx tsc --noEmit` com 0 erros de tipagem. (✅ Concluído - 0 erros)
3. `npm run build` gerando todas as rotas estáticas e dinâmicas perfeitamente. (✅ Concluído - 12/12 rotas)
4. Testar `npm run db:check` para validar a saúde do Supabase. (✅ Concluído - Conexão ativa e sincronizada)

---

## 5. 🛡️ Riscos e Mitigações

| Risco Identificado | Mitigação Arquitetural |
| :--- | :--- |
| Usuário abrir a página sem internet ou com instabilidade no Supabase | A UI não dará tela branca nem silenciará a falha: apresentará uma mensagem amigável explicando a indisponibilidade com botão de recarregar. |
| Testes automatizados falharem por esperar fallback em `localStorage` | Todos os arquivos de teste do Meu TAF serão atualizados com mocks HTTP padronizados de `fetch`. |
| Conflito com as calculadoras públicas | As calculadoras continuam usando exclusivamente `lib/storage/localStorage.ts`, totalmente desacopladas do Meu TAF. |
