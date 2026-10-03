// A stand-in domain that can run its steps again, for tests that build a Flow
// through the service.
//
// **Why (t244, user 2026-10-02).** A Flow is finished only once a run of the
// whole Flow from its start was judged to do what was asked, on the Flow as it
// finally stands. A build's test is that run (`../llm/node-tools/dry-run-gate.ts`),
// and it can only run steps the domain said how to run again: what each ran
// with (`ranWith`) and where it found the target (`replay.from`). A stand-in
// domain that said neither used to be "not a caller the test applies to", and
// its builds were proposed untested; now its completions are refused
// `llm_evidence_loop.full_run_required`, as a real domain's would be. Tests whose
// subject is something else -- permissions, accounting, the plan -- wrap their
// stand-in in this, so their builds are tested and judged as a real one is.
//
// What it adds, and only where the stand-in said nothing:
//
// - every call that answered with an execution result gets `draft.ranWith`
//   (the call's own argument) and `draft.replay.from` (the call's id, opaque);
// - a replay call (`replay: "reset" | "step" | "verify"`) is answered without
//   reaching the stand-in: a reset puts nothing back and says it did, a step
//   says it ran the same again, a check says the step could run. The stand-in's
//   own state -- what it counted, what was pressed -- is never touched by a test.
//
// Nothing a stand-in already says is changed, and a raw (non-execution) result
// is passed through as it came: the loop reads a raw result of an acting tool as
// an action that did not apply, which is never a step of the Flow.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmEvidenceToolExecutionResult } from "../llm/index.ts";

/** The replay calls this stand-in answered, in order: what a test can assert the build's test sent. */
export type AutomationStudioReplayingBindingCalls = { toolId: string; value: JsonObject }[];

/**
 * `binding` with its executor able to run its steps again; `replays` lists the
 * replay calls it answered. Typed by the binding itself, so a stand-in written
 * inline is read as one (its tools' `effect` as the words a tool may declare).
 */
export function automationStudioReplayingBinding<B extends AutomationStudioLlmEvidenceRuntimeBinding>(binding: B): B & { replays: AutomationStudioReplayingBindingCalls } {
  const replays: AutomationStudioReplayingBindingCalls = [];
  const executeTool = binding.executeTool.bind(binding);
  return {
    ...binding,
    replays,
    executeTool: async (input: Parameters<AutomationStudioLlmEvidenceRuntimeBinding["executeTool"]>[0]) => {
      const asked = input.value.replay;
      if (asked === "reset" || asked === "step" || asked === "verify") {
        replays.push({ toolId: input.toolId, value: structuredClone(input.value) });
        return {
          kind: "llm_evidence_tool_execution",
          evidence: { replayed: asked },
          effectApplied: asked !== "verify",
          resultCode: asked === "verify" ? "core.replay.verified" : "core.replay.replayed"
        };
      }
      const result = await executeTool(input);
      if (!isExecution(result)) return result;
      const draft = result.draft ?? {};
      return {
        ...result,
        draft: {
          ...draft,
          ...(draft.ranWith === undefined ? { ranWith: structuredClone(input.value) } : {}),
          ...(draft.replay === undefined ? { replay: { from: { at: input.callId } } } : {})
        }
      };
    }
  };
}

function isExecution(value: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): value is AutomationStudioLlmEvidenceToolExecutionResult {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (value as { kind?: unknown }).kind === "llm_evidence_tool_execution";
}
