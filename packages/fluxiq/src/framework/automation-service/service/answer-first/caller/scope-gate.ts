// A caller's scope (`AutomationStudioAnswerFirstCallerScope`; fluxnode-plan N6), held at the top of
// the attempt's call chain, before the act gate, so a refused call reaches nothing: no act is
// recorded, no row is read and no step is counted. A refusal is an answer the model reads, as the
// chain's own `no_reset` is, so the rounds look for another way within the budget; it never ends the
// task, and nobody is asked: the scope is the standing grant.
//
// **Its lasting acts.** The permission gate asks only about moving money, deleting and sending
// (`runtime/action-permission-requests/destructive.ts`) and lets every other class through. A
// scope grants each class by name, a change included, so this refuses whatever is not granted:
//   a call that declares a class outside it    refused unrun; a step only checked (`verify`) is not
//                                              an act, but one written into the Flow is refused,
//                                              since the Flow would take it on every run
//   the domain finding one as it acts          the domain's permission check answers not permitted,
//                                              with what is missing, before the gate is asked
//
// **Its sites**, where it names any:
//   a call naming an address outside them      any absolute http(s) address in what it sends
//   a call while the page is outside them      as the latest answer said (`location`, or `url`),
//                                              unless the call names an address back inside them
//
// What a class or a site is, and what the scope allows, is `./scope-rule.ts`, shared with the other
// doors the scope is held at.
//
// A saved Flow's own run, which the engine drives without this chain, is held to the same scope by
// `./replay-scope.ts`.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionPermissionCheck } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioHarnessOptionLoopBinding, AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioAnswerFirstCallerScope } from "../../flow-bootstrap-commands/index.ts";
import { automationStudioAnswerFirstScopeRule } from "./scope-rule.ts";

type Execute = AutomationStudioHarnessOptionLoopBinding["executeTool"];

const OUTSIDE_CODE = "answer_first.outside_scope";

export function automationStudioAnswerFirstScopeGate(scope: AutomationStudioAnswerFirstCallerScope | undefined, execute: Execute): Execute {
  if (scope === undefined) return execute;
  const rule = automationStudioAnswerFirstScopeRule(scope);
  const { notGranted, allowed, listed } = rule;
  /** Where the page is, as the latest answer that said so put it. */
  let onPage: string | undefined;
  return async (call) => {
    const declared = notGranted(declaredBy(call.value));
    if (declared.length) return refused(`This was not done: it is an act this task may not do (${declared.join(", ")}). Find another way to the result that does not do that.`);
    const named = rule.bySite ? rule.hostsIn(call.value) : [];
    const outside = named.find((host) => !allowed(host));
    if (outside !== undefined) return refused(`This was not done: ${outside} is outside the sites this task may use (${listed}). Find another way to the result on those sites.`);
    if (onPage !== undefined && !allowed(onPage) && !named.some(allowed)) return refused(`This was not done: the page is on ${onPage}, outside the sites this task may use (${listed}). Go back to one of them, by its address, and carry on from there.`);
    const answer = await execute(call.permission ? { ...call, permission: withinGrant(call.permission, notGranted) } : call);
    const at = rule.bySite ? locationOf(answer, rule.hostOf) : undefined;
    if (at !== undefined) onPage = at;
    return answer;
  };
}

/** The classes a call says it would have, where it acts or writes an act into the Flow; a step only checked declares nothing it would do. */
function declaredBy(value: JsonObject): string[] {
  if (value.replay === "verify" || value.replay === "reset") return [];
  const nested = value.parameters;
  const inner = typeof nested === "object" && nested !== null && !Array.isArray(nested) ? nested.consequences : undefined;
  return [...stringsIn(value.consequences), ...stringsIn(inner)];
}

function stringsIn(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((each): each is string => typeof each === "string") : [];
}

/** The domain's own check, with what the scope does not grant refused first: the gate would let a change through unasked. */
function withinGrant(check: AutomationStudioActionPermissionCheck, notGranted: (classes: readonly unknown[]) => AutomationStudioActionConsequence[]): AutomationStudioActionPermissionCheck {
  return async (declaration) => {
    const missing = notGranted(Array.isArray(declaration.consequences) ? declaration.consequences : []);
    return missing.length ? { permitted: false, missing, requestId: null } : await check(declaration);
  };
}

/** Where an answer says the page is, from its evidence's `location` (or `url`), when that is an http(s) address. */
function locationOf(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult, hostOf: (text: string) => string | undefined): string | undefined {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer) || answer.kind !== "llm_evidence_tool_execution") return undefined;
  const evidence = (answer as AutomationStudioLlmEvidenceToolExecutionResult).evidence;
  if (typeof evidence !== "object" || evidence === null || Array.isArray(evidence)) return undefined;
  const place = typeof evidence.location === "string" ? evidence.location : typeof evidence.url === "string" ? evidence.url : undefined;
  return place === undefined ? undefined : hostOf(place);
}

function refused(instruction: string): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: OUTSIDE_CODE, instruction }, effectApplied: false, targetsUnchanged: true, resultCode: OUTSIDE_CODE };
}
