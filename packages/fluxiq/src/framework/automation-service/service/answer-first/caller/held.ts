// A caller's options for one generation (`AutomationStudioAnswerFirstCallerOptions`), read where the
// service reads them: the ones the call brought, read and refused (`./options.ts`), or, for a
// person's press in the panel that brought none, the ones the attempt kept (`./kept.ts`).
//
// **A press goes on under what the attempt began with.** Carry on is the same attempt, so it takes
// that attempt's own; Run again starts a new one at the same task, so it takes the task's latest
// attempt's, which its press found (`../run-again/run-again.ts`). Each press holds them in its scope
// (`../carry-on/hold.ts`, `../run-again/hold.ts`), which only a route sets, for this Flow only and
// until its attempt opens. So the task key, model, budget, judge mode, scope and inputs stand, and a
// press has no check or person port of its own (`AutomationStudioAnswerFirstKeptCallerOptions`).
//
// Kept options are read again through the same strict reader as given ones, so kept options that no
// longer read refuse the press as invalid input, as given ones would, rather than run it as the chat's
// with the caller's grant and key silently gone. A call that brings options always wins.
//
// **The start is held to the scope's sites** here, with the options, so a start off them is refused as
// the invalid input it is (`flow_bootstrap.invalid_input`, as an invalid option is) before a purse
// opens or anything is asked, run or written. Only an http(s) start is a site (`./scope-rule.ts`). A
// FluxNode's spec refuses such a start when it is registered (`spec.start_out_of_scope`); this holds
// the same rule for every caller, and for a press that goes on under kept options.

import type { AutomationStudioAnswerFirstCallerOptions } from "../../flow-bootstrap-commands/index.ts";
import { automationStudioAnswerFirstCarryOnScope } from "../carry-on/index.ts";
import { automationStudioAnswerFirstRunAgainScope } from "../run-again/index.ts";
import { automationStudioAnswerFirstCallerOptionsRead } from "./options.ts";
import { automationStudioAnswerFirstScopeRule } from "./scope-rule.ts";

export function automationStudioAnswerFirstCallerOptionsHeld(given: unknown, at: { projectId: string; flowId: string; startLocation?: string | undefined }): AutomationStudioAnswerFirstCallerOptions | undefined {
  const read = given === undefined ? keptByPress(at) : given;
  const options = read === undefined ? undefined : automationStudioAnswerFirstCallerOptionsRead(read);
  const rule = options?.scope ? automationStudioAnswerFirstScopeRule(options.scope) : undefined;
  const host = rule?.bySite && at.startLocation !== undefined ? rule.hostOf(at.startLocation) : undefined;
  if (rule && host !== undefined && !rule.allowed(host)) throw new Error(`Answer-first caller startLocation is on ${host}, outside scope.sites (${rule.listed}).`);
  return options;
}

function keptByPress(at: { projectId: string; flowId: string }): unknown {
  const carried = automationStudioAnswerFirstCarryOnScope.getStore();
  if (carried && !carried.opened && carried.projectId === at.projectId && carried.flowId === at.flowId) return carried.kept?.attempts.find((attempt) => attempt.attemptId === carried.attemptId)?.caller;
  const again = automationStudioAnswerFirstRunAgainScope.getStore();
  if (again && !again.opened && again.projectId === at.projectId && again.flowId === at.flowId) return again.caller;
  return undefined;
}
