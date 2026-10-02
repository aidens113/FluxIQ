import { automationStudioLlmEvidenceToolResultInvalidCode } from "../evidence-loop-decision.ts";
import { automationStudioLlmStepLogDirectory } from "./directory.ts";
import { automationStudioLlmStepLogWriter } from "./files.ts";
import { automationStudioLlmStepLogFolderRefused, automationStudioLlmStepLogOpenFolder, type AutomationStudioLlmStepLogFolder } from "./folder.ts";
import { automationStudioLlmStepLogListStep } from "./listing.ts";
import { automationStudioLlmStepLogNaming } from "./naming.ts";
import { automationStudioLlmStepLogPageText } from "./page-text.ts";
import { automationStudioLlmStepLogScope } from "./scope.ts";
import { automationStudioLlmStepLogSummary } from "./summary.ts";

/** A tool request as the evidence loop and the Flow test make it: `value` is the input the model wrote. */
type ToolRequest = { callId: string; toolId: string; value?: unknown };

/** Core's own call ids for a dry run's replay (`dryrun.<attempt>.<step|reset>`). */
const DRY_RUN_CALL = /^dryrun\./u;

/**
 * `run`, with every call written down as a step: `NNNN-tool-<toolId>/`, or
 * `NNNN-test-<toolId>/` for a replay inside a test scope or under a dry run's
 * call id. `call.json` holds the call as the model made it, `result.json`
 * exactly the `evidence` the loop hands the model back (the raw value when the
 * tool did not answer with an execution result; the error's name and code when
 * it threw), `page.txt` the compact page text when the evidence carries one,
 * and `meta.json`, last, the timing, the result code and `loopVerdict`: whether
 * Core read the value or refused it, so a refused one is no longer visible only
 * in the next request. `run` itself, untouched, when the step log is off.
 */
export function automationStudioLlmStepLogTool<R extends ToolRequest, O>(run: (request: R) => Promise<O>, env: Readonly<Record<string, string | undefined>> = process.env): (request: R) => Promise<O> {
  const directory = automationStudioLlmStepLogDirectory(env);
  if (!directory) return run;
  return async (request) => {
    const step = toolStep(directory, request);
    let result: O;
    try {
      result = await run(request);
    } catch (error) {
      step?.(undefined, error);
      throw error;
    }
    step?.(result, undefined);
    return result;
  };
}

function toolStep(directory: string, request: ToolRequest): ((result: unknown, error: unknown) => void) | undefined {
  const scope = automationStudioLlmStepLogScope.current();
  const toolId = typeof request.toolId === "string" ? request.toolId : "unnamed";
  const callId = typeof request.callId === "string" ? request.callId : "";
  const kind = scope?.phase === "test" || DRY_RUN_CALL.test(callId) ? "test" : "tool";
  let folder: AutomationStudioLlmStepLogFolder;
  try {
    folder = automationStudioLlmStepLogOpenFolder(directory, `${kind}-${automationStudioLlmStepLogNaming.toolSegment(toolId)}`);
  } catch (error) {
    // The disk refused the folder: no step, never a failed tool call.
    if (automationStudioLlmStepLogFolderRefused(error)) return undefined;
    throw error;
  }
  const started = Date.now();
  const files = automationStudioLlmStepLogWriter(folder.path);
  files.json("call.json", { callId, toolId, input: request.value ?? null });
  return (result, error) => {
    try {
      const execution = executionOf(result);
      const evidence = execution ? execution.evidence : result;
      files.json("result.json", error === undefined ? evidence ?? null : { error: thrown(error) });
      const page = error === undefined ? automationStudioLlmStepLogPageText(evidence) : undefined;
      if (page !== undefined) files.text("page.txt", page);
      // What Core made of the value, by the reader the loop and a test's replay both use. A value it
      // refuses reaches the model as a call that failed with no evidence, whatever `resultCode` says:
      // run 38's twelve reads were logged `web.inspect.succeeded` and every one was refused
      // `evidence_not_json` (`run-muqilf9s-c3211328`). The effect a tool declares never decides a refusal.
      const unread = error === undefined ? automationStudioLlmEvidenceToolResultInvalidCode(result, "observe") : undefined;
      const summary = automationStudioLlmStepLogSummary.tool(evidence, execution?.resultCode, error === undefined ? undefined : thrown(error), unread);
      const finished = Date.now();
      files.meta({
        step: folder.step, kind, callId, toolId,
        startedAt: new Date(started).toISOString(), finishedAt: new Date(finished).toISOString(), ms: finished - started,
        round: scope?.round ?? null, phase: scope?.phase ?? automationStudioLlmStepLogNaming.phaseOfKind(kind),
        status: error === undefined ? "ok" : "threw",
        resultCode: typeof execution?.resultCode === "string" ? execution.resultCode : null,
        resultReason: typeof execution?.resultReason === "string" ? execution.resultReason : null,
        effectApplied: typeof execution?.effectApplied === "boolean" ? execution.effectApplied : null,
        // `read`, the code the loop records for a value it refused, or the one for a call that threw.
        loopVerdict: error !== undefined ? "llm_evidence_loop.tool_failed" : unread ?? "read",
        summary
      });
      automationStudioLlmStepLogListStep(directory, { step: folder.step, kind, tool: toolId, summary, costUsd: undefined });
    } catch {
      /* best-effort: a step that cannot be finished never fails the tool call */
    }
  };
}

/** The loop's execution result, when the tool answered with one (`../evidence-loop/tool-execution.ts`). */
function executionOf(result: unknown): { evidence: unknown; resultCode?: unknown; resultReason?: unknown; effectApplied?: unknown } | undefined {
  return typeof result === "object" && result !== null && !Array.isArray(result) && (result as { kind?: unknown }).kind === "llm_evidence_tool_execution"
    ? result as { evidence: unknown }
    : undefined;
}

/** A throw as its name and code: never its message, which may quote the page. */
function thrown(error: unknown): { name: string; code: string | null } {
  const record = (typeof error === "object" && error !== null ? error : {}) as { name?: unknown; code?: unknown };
  return { name: typeof record.name === "string" ? record.name : "non_error", code: typeof record.code === "string" ? record.code : null };
}
