// A run of a Flow, under the Flow's one purse, in a Lab-scoped run (t438).
//
// **The rule.** The user's words (2026-10-01): "bring the ceiling down to $0.1
// per flow max". One purse per Flow: its build, re-authors, repairs and judge
// all count against it, in billed dollars, with no cap on output. Its creation
// already runs under it (`../flow-bootstrap-commands/creation-purse.ts`); this
// puts the Flow's runs under it too. Every model call the run makes -- its
// in-run repairs, its recovery after the run, its result check, its re-authors
// and their re-runs -- is held against what the Flow has left and added to the
// Flow's record as it settles (`../creation-spend.ts`, `withFlowPurse`),
// whether the run then succeeds or fails. The chat's reading of the message
// that started the run is added to the record first.
//
// **Lab-scoped only.** The purse exists only where the run cost ceiling is
// Lab-scoped (`FLUXIQ_LLM_RUN_COST_CEILING_SCOPE=test`). A product Flow runs on
// a schedule for as long as it exists and its owner's limit is per run
// (`maxEstimatedCostUsdPerRun`, $0.25 by default, up to $10 by explicit
// policy), so a lifetime purse would leave every later run with nothing;
// there each run's repair keeps its own purse
// (`../../recovery/refuted-result/purse.ts`).

import { resolveAutomationStudioLlmTestRunCostCeilingUsd } from "../../../model/index.ts";
import { automationStudioLlmRunCostCeilingUsd } from "../../llm/index.ts";
import type { AutomationStudioFlowBootstrapCreationSpendStore } from "../index.ts";

/**
 * `run` under the Flow's one purse when the run cost ceiling is Lab-scoped and
 * the run names its project and Flow; otherwise `run` as it is. `labScoped`
 * defaults to whether this process's ceiling is.
 */
export async function automationStudioLabFlowPurse<T>(
  input: {
    store: Pick<AutomationStudioFlowBootstrapCreationSpendStore, "add" | "withFlowPurse">;
    projectId?: string | null | undefined;
    flowId?: string | null | undefined;
    /** What the chat's reading of the message that started this run cost, when a chat turn started it. */
    interpretationCostUsd?: number | undefined;
    labScoped?: boolean | undefined;
  },
  run: () => Promise<T>
): Promise<T> {
  const { store, projectId, flowId } = input;
  const labScoped = input.labScoped ?? resolveAutomationStudioLlmTestRunCostCeilingUsd() !== undefined;
  if (!labScoped || !projectId || !flowId) return await run();
  const reading = input.interpretationCostUsd;
  if (typeof reading === "number" && Number.isFinite(reading) && reading > 0) await store.add(projectId, flowId, reading);
  return await store.withFlowPurse(projectId, flowId, automationStudioLlmRunCostCeilingUsd(), run);
}
