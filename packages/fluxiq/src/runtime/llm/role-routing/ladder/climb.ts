// One rung up the model ladder, where a cause says the attempt cannot get there on the model it is
// on, and the record of it: the attempt's ladder (`./state.ts`, which its row carries), a step
// folder `NNNN-escalate` the Lab reads (`meta.json` alone: kind `escalate`, `from`, `to`,
// `reason`, `pattern`), and one chat step in a person's words. Each cause climbs exactly one rung,
// and the next call of the attempt is served there (`./frame.ts`). Nothing where there is no
// ladder or it is at the top: the caller's steer stands, and the purse ends what goes on.
//
// The log is best-effort, as every step folder is: a log that cannot be written never touches
// the climb.

import { emitAutomationStudioActivity } from "../../../activity/index.ts";
import { automationStudioLlmStepLogEvent } from "../../step-log/index.ts";
import type { AutomationStudioLlmModelEscalation, AutomationStudioLlmModelLadder } from "./state.ts";

/** Climbs `ladder` one rung for `cause`, and records it where it climbed. Answers the climb, or nothing. */
export function automationStudioLlmModelLadderClimb(
  ladder: AutomationStudioLlmModelLadder,
  cause: Parameters<AutomationStudioLlmModelLadder["escalate"]>[0],
  iteration: number,
  env: Readonly<Record<string, string | undefined>> = process.env
): AutomationStudioLlmModelEscalation | undefined {
  const escalation = ladder.escalate(cause);
  if (!escalation) return undefined;
  const text = `FluxIQ was not getting this done, so it switched to a stronger model (${escalation.to}) for the rest of this attempt.`;
  emitAutomationStudioActivity({ phase: "thinking", label: "Switched to a stronger model", detail: { kind: "thought", title: "Switched to a stronger model", text, status: "succeeded" } });
  const summary = `${escalation.from} -> ${escalation.to} (${escalation.reason}${escalation.pattern ? ` ${escalation.pattern}` : ""})`;
  automationStudioLlmStepLogEvent("escalate", { iteration, from: escalation.from, to: escalation.to, reason: escalation.reason, pattern: escalation.pattern ?? null, level: ladder.level }, summary, undefined, env);
  return escalation;
}
