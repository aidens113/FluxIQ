// What a FluxNode run's completion is checked by before any judge (fluxnode-plan N4), as the attempt's
// caller check (`AutomationStudioAnswerFirstCallerCheck`): the outputs made from Core's own summary
// (`../outputs/`), then the declared type, then the developer's check over the event stream. A "no"
// from either is words the attempt reads and goes round again on; nothing here ends the run.
//
// **Order.** The type first, at no cost: outputs that do not fit are a "no" naming where, and the
// program is not asked. Then, where the spec has a check, a `check_needed` event with the outputs and
// inputs, waited on until the program's `check_answer`: a pass passes; a fail is its reason. A Stop
// while it waits is a "no" too, and the attempt then ends on the Stop.
//
// **What passed is kept,** with its lineage and what passed it, so the result returns exactly the
// outputs that were checked (`../result-of.ts`); the latest "no" is kept for a run that ends before
// anything passes.

import { validateJsonValue, type DataLineage, type FluxNodeSpec, type FluxNodeVerdictSource } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowLessSummary } from "../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioAnswerFirstCallerCheck } from "../../flow-bootstrap-commands/index.ts";
import type { FluxNodeRun } from "../fluxnode-run.ts";
import { fluxNodeShapedOutputs } from "../outputs/index.ts";

/** The dataset name lineage from a summary's rows carries until the result names the stored one (`../result-of.ts`). */
export const FLUXNODE_SUMMARY_ROWS = "result";
/** How many type errors a "no" names. */
const ERRORS_SAID = 5;

export type FluxNodeCheckBridge = {
  check: AutomationStudioAnswerFirstCallerCheck;
  /** The latest outputs that passed, and what passed them. */
  passed(): { outputs: JsonValue | undefined; lineage: DataLineage[]; by: Extract<FluxNodeVerdictSource, "type" | "check"> } | undefined;
  /** The latest "no", and whose. */
  refused(): { by: Extract<FluxNodeVerdictSource, "type" | "check">; reason: string } | undefined;
};

export function fluxNodeCheckBridge(run: FluxNodeRun, spec: Pick<FluxNodeSpec, "outputs" | "hasCheck">, inputs: JsonObject): FluxNodeCheckBridge {
  let passed: ReturnType<FluxNodeCheckBridge["passed"]>;
  let refused: ReturnType<FluxNodeCheckBridge["refused"]>;
  const no = (by: "type" | "check", reason: string): string => {
    refused = { by, reason };
    return reason;
  };
  const check = async (summary: AutomationStudioFlowLessSummary): Promise<boolean | string> => {
    const rows = summary.rows ? { datasetId: FLUXNODE_SUMMARY_ROWS, columns: summary.rows.columns, rows: summary.rows.rows } : undefined;
    const shaped = fluxNodeShapedOutputs(spec.outputs, { runId: run.runId, flowId: run.target.flowId, rows, acts: summary.acts, inputs });
    if (spec.outputs !== undefined) {
      const errors = shaped.outputs === undefined ? [{ path: "", message: "nothing was found to make outputs from yet" }] : validateJsonValue(spec.outputs, shaped.outputs);
      if (errors.length) return no("type", `The outputs do not fit the type the program declared: ${errors.slice(0, ERRORS_SAID).map((error) => `${error.path || "the outputs"}: ${error.message}`).join("; ")}.`);
    }
    if (spec.hasCheck) {
      const answer = await run.waitFor({ type: "check_needed", eventId: run.nextEventId(), outputs: shaped.outputs ?? null, inputs: structuredClone(inputs) });
      if (answer?.type !== "check_answer") return no("check", run.stopRequested ? "The program stopped the run before its check answered." : "The program's check gave no answer.");
      if (!answer.pass) return no("check", answer.reason ?? "The program's check did not pass, and it gave no reason.");
    }
    passed = { outputs: shaped.outputs, lineage: shaped.lineage, by: spec.hasCheck ? "check" : "type" };
    refused = undefined;
    return true;
  };
  return { check, passed: () => passed, refused: () => refused };
}
