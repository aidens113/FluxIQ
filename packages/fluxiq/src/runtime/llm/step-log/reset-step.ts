import { automationStudioLlmStepLogDirectory } from "./directory.ts";
import { automationStudioLlmStepLogWriter } from "./files.ts";
import { automationStudioLlmStepLogFolderRefused, automationStudioLlmStepLogOpenFolder, type AutomationStudioLlmStepLogFolder } from "./folder.ts";
import { automationStudioLlmStepLogListStep } from "./listing.ts";
import { automationStudioLlmStepLogNaming } from "./naming.ts";
import { automationStudioLlmStepLogScope } from "./scope.ts";

/**
 * Which part of a trial's reset a reset step times: the deployment's
 * `start_hook` (a fixture's own reset, `service/candidate-trial/run.ts`), or the
 * build's `site_check` before a trial -- the ledger's check that every lasting
 * act of this build was undone (`flow-bootstrap/site-reset/`).
 */
type Stage = "start_hook" | "site_check";

/**
 * `run`, timed as one `NNNN-reset` step: the reset a trial makes before it acts,
 * which is no model call and no tool call of its own, so nothing else marks it
 * and the Lab's build-time measure counted it as the trial's replay. The folder
 * holds `meta.json` alone -- kind `reset`, the `stage`, the trial tool whose
 * gate ran it (`trialToolId`, `null` for a start hook, which serves any trial),
 * the scope's part, round, phase and agent, `status` (`ok` or `threw`) and
 * `outcome`, the code `describe` picks from the answer (`admit`, `refuse`,
 * `reset`, `failed`). Never what the reset saw: its evidence quotes the page.
 * `run` itself, untouched, when the step log is off.
 */
export async function automationStudioLlmStepLogReset<T>(
  span: { stage: Stage; trialToolId?: string },
  run: () => Promise<T>,
  describe: (answer: T) => string,
  env: Readonly<Record<string, string | undefined>> = process.env
): Promise<T> {
  const directory = automationStudioLlmStepLogDirectory(env);
  if (!directory) return await run();
  const step = resetStep(directory, span);
  let answer: T;
  try {
    answer = await run();
  } catch (error) {
    step?.(undefined, error);
    throw error;
  }
  step?.(describe(answer), undefined);
  return answer;
}

function resetStep(directory: string, span: { stage: Stage; trialToolId?: string }): ((outcome: string | undefined, error: unknown) => void) | undefined {
  const scope = automationStudioLlmStepLogScope.current();
  let folder: AutomationStudioLlmStepLogFolder;
  try {
    folder = automationStudioLlmStepLogOpenFolder(directory, "reset");
  } catch (error) {
    // The disk refused the folder: no step, never a failed reset.
    if (automationStudioLlmStepLogFolderRefused(error)) return undefined;
    throw error;
  }
  const started = Date.now();
  return (outcome, error) => {
    try {
      const finished = Date.now();
      const code = typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
      const said = error === undefined ? `${span.stage} ${outcome ?? "-"}` : `${span.stage} threw ${code ?? (error instanceof Error ? error.name : "non_error")}`;
      const summary = span.trialToolId ? `${said} in ${span.trialToolId}` : said;
      automationStudioLlmStepLogWriter(folder.path).meta({
        step: folder.step, kind: "reset", stage: span.stage, trialToolId: span.trialToolId ?? null, callId: null, toolId: null,
        startedAt: new Date(started).toISOString(), finishedAt: new Date(finished).toISOString(), ms: finished - started,
        part: scope?.part ?? null, round: scope?.round ?? null, phase: scope?.phase ?? automationStudioLlmStepLogNaming.phaseOfKind("reset"),
        role: scope?.role ?? null, briefId: scope?.briefId ?? null,
        status: error === undefined ? "ok" : "threw", outcome: error === undefined ? outcome ?? null : null, summary
      });
      automationStudioLlmStepLogListStep(directory, { step: folder.step, kind: "reset", tool: undefined, summary, costUsd: undefined, role: scope?.role, briefId: scope?.briefId });
    } catch {
      /* best-effort: a step that cannot be finished never fails the reset */
    }
  };
}
