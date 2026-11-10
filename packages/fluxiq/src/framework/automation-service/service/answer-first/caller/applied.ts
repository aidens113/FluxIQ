// An attempt's input with its caller's grant and person port in place (fluxnode-plan N6). Absent
// options leave the input exactly as the chat made it.
//
// **The scope is the standing grant.** Its consequences replace the request's, and the permission
// gate is given no way to ask: an act outside the grant is refused, the domain says so to the model,
// and the rounds look for another way, as they do after a person's no. Nothing asks mid-run.
//
// **A person-ask sink replaces the Flow's conversation** for every question an attempt puts to a
// person: a check only a person can clear, a stuck attempt's question and, with no scope, a
// permission question (through the creation's port, which opens nothing once the reading was
// refused, as the conversation's does).

import type { AutomationStudioAnswerFirstAttemptInput } from "../attempt/index.ts";
import { automationStudioAnswerFirstPersonSinkPort } from "./person-sink.ts";

export function automationStudioAnswerFirstCallerApplied(input: AutomationStudioAnswerFirstAttemptInput): AutomationStudioAnswerFirstAttemptInput {
  const caller = input.caller;
  if (!caller) return input;
  const port = caller.personAsk ? automationStudioAnswerFirstPersonSinkPort(caller.personAsk) : undefined;
  const { ask, ...ground } = input.permissionGround;
  const signal = input.cancellation.signal();
  const permissionGround = caller.scope
    ? { ...ground, permittedConsequences: [...caller.scope.permittedConsequences] }
    : port ? { ...ground, ask: { ...ask, port: input.creation.askPort(port), ...(signal ? { signal } : {}) } } : input.permissionGround;
  return { ...input, permissionGround, ...(port ? { personAsk: { port } } : {}) };
}
