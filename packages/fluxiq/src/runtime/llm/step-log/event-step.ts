// A step folder `NNNN-<kind>` that records one thing Core decided, with no model call and no tool
// call of its own: `meta.json` alone, with the step's scope (part, round, phase, role, brief), and a
// row in `index.md`. A model ladder's climb (`escalate`) and the model's decision about a caught
// repeat (`loop_decision`) are written this way (t962). Best-effort, as every step folder is: no
// write when the step log is off, and a log that cannot be written never touches the work.

import type { JsonObject } from "../../../core/index.ts";
import { automationStudioLlmStepLogDirectory } from "./directory.ts";
import { automationStudioLlmStepLogWriter } from "./files.ts";
import { automationStudioLlmStepLogFolderRefused, automationStudioLlmStepLogOpenFolder } from "./folder.ts";
import { automationStudioLlmStepLogListStep } from "./listing.ts";
import { automationStudioLlmStepLogScope } from "./scope.ts";

/** Writes `fields` as a `kind` step's `meta.json`, beside its step number, timing, scope and `summary`. */
export function automationStudioLlmStepLogEvent(kind: string, fields: JsonObject, summary: string, tool?: string, env: Readonly<Record<string, string | undefined>> = process.env): void {
  const directory = automationStudioLlmStepLogDirectory(env);
  if (!directory) return;
  try {
    const folder = automationStudioLlmStepLogOpenFolder(directory, kind);
    const scope = automationStudioLlmStepLogScope.current();
    const at = new Date().toISOString();
    automationStudioLlmStepLogWriter(folder.path).meta({
      step: folder.step, kind, ...fields,
      startedAt: at, finishedAt: at, ms: 0,
      part: scope?.part ?? null, round: scope?.round ?? null, phase: scope?.phase ?? "explore", role: scope?.role ?? null, briefId: scope?.briefId ?? null,
      status: "ok", summary
    });
    automationStudioLlmStepLogListStep(directory, { step: folder.step, kind, tool, summary, costUsd: undefined, role: scope?.role, briefId: scope?.briefId });
  } catch (error) {
    if (!automationStudioLlmStepLogFolderRefused(error)) return;
  }
}
