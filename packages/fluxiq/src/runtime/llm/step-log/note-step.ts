import { automationStudioLlmStepLogDirectory } from "./directory.ts";
import { automationStudioLlmStepLogWriter } from "./files.ts";
import { automationStudioLlmStepLogOpenFolder } from "./folder.ts";
import { automationStudioLlmStepLogListStep } from "./listing.ts";
import { automationStudioLlmStepLogNaming } from "./naming.ts";
import { automationStudioLlmStepLogScope } from "./scope.ts";

/**
 * One plain line in the run's step log, as its own `NNNN-note` folder holding `meta.json`
 * alone (kind `note`, the `line` and the scope's part, round, phase and agent). The caller
 * writes the line and it must carry no page text: it says a thing happened, never what the
 * page held. Nothing when the step log is off, and best-effort when it is on: a line that
 * cannot be written never changes or fails what it notes.
 */
export function automationStudioLlmStepLogNote(line: string, env: Readonly<Record<string, string | undefined>> = process.env): void {
  const directory = automationStudioLlmStepLogDirectory(env);
  if (!directory) return;
  try {
    const scope = automationStudioLlmStepLogScope.current();
    const folder = automationStudioLlmStepLogOpenFolder(directory, "note");
    const at = new Date().toISOString();
    automationStudioLlmStepLogWriter(folder.path).meta({
      step: folder.step, kind: "note", callId: null, toolId: null, startedAt: at, finishedAt: at, ms: 0,
      part: scope?.part ?? null, round: scope?.round ?? null, phase: scope?.phase ?? automationStudioLlmStepLogNaming.phaseOfKind("note"),
      role: scope?.role ?? null, briefId: scope?.briefId ?? null, status: "ok", line, summary: line
    });
    automationStudioLlmStepLogListStep(directory, { step: folder.step, kind: "note", tool: undefined, summary: line, costUsd: undefined, role: scope?.role, briefId: scope?.briefId });
  } catch {
    /* best-effort: a line that cannot be written never fails what it notes */
  }
}
