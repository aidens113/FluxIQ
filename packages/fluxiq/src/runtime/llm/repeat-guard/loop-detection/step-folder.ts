// A step of the ladder as its own step folder, `NNNN-loop`, so the Lab can read
// from a run's log what the loop detector did (`packages/test-runner`,
// `loop-replay/`): `meta.json` alone, kind `loop`, its `rung`, `pattern` and
// `repeats` and Core's tool ids. A refusal also has its own answer step
// (`../../step-log/answer-step.ts`). Best-effort, and no write when the step log
// is off: a log that cannot be written never touches the loop.

import { automationStudioLlmStepLogDirectory } from "../../step-log/directory.ts";
import { automationStudioLlmStepLogWriter } from "../../step-log/files.ts";
import { automationStudioLlmStepLogFolderRefused, automationStudioLlmStepLogOpenFolder } from "../../step-log/folder.ts";
import { automationStudioLlmStepLogListStep } from "../../step-log/listing.ts";
import { automationStudioLlmStepLogScope } from "../../step-log/scope.ts";
import type { AutomationStudioLlmLoopFinding, AutomationStudioLlmLoopSignal } from "./types.ts";

/** Which step of the ladder a step folder says. */
export type AutomationStudioLlmLoopStepRung = "steer" | "refuse" | AutomationStudioLlmLoopSignal["kind"];

export function automationStudioLlmLoopStepFolder(iteration: number, rung: AutomationStudioLlmLoopStepRung, finding: AutomationStudioLlmLoopFinding, env: Readonly<Record<string, string | undefined>> = process.env): void {
  const directory = automationStudioLlmStepLogDirectory(env);
  if (!directory) return;
  try {
    const folder = automationStudioLlmStepLogOpenFolder(directory, "loop");
    const scope = automationStudioLlmStepLogScope.current();
    const at = new Date().toISOString();
    const summary = `${rung} ${finding.pattern} x${finding.repeats}`;
    automationStudioLlmStepLogWriter(folder.path).meta({
      step: folder.step, kind: "loop", iteration, rung, pattern: finding.pattern, repeats: finding.repeats, toolIds: [...finding.toolIds],
      startedAt: at, finishedAt: at, ms: 0,
      part: scope?.part ?? null, round: scope?.round ?? null, phase: scope?.phase ?? "explore", role: scope?.role ?? null, briefId: scope?.briefId ?? null,
      status: "ok", summary
    });
    automationStudioLlmStepLogListStep(directory, { step: folder.step, kind: "loop", tool: finding.toolIds[0], summary, costUsd: undefined, role: scope?.role, briefId: scope?.briefId });
  } catch (error) {
    if (!automationStudioLlmStepLogFolderRefused(error)) return;
  }
}
