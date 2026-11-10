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
// Core never parses a domain's own spellings (`runtime/flow-bootstrap/start-location.ts`): only an
// absolute http(s) address is a site, so a domain whose places are not web addresses is unaffected.
// A site covers itself and its subdomains, with a port only where given: the FluxNode scope's own
// rule (`fluxNodeScopeAllowsSite`), so the two cannot disagree.
//
// Not covered: a saved Flow's own run, which the engine drives without this chain (its plan steps
// still meet the permission gate). Its steps were worked out under this same scope, which is part
// of a caller's task key.

import { fluxNodeScopeAllowsSite } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { isAutomationStudioActionConsequence, type AutomationStudioActionConsequence, type AutomationStudioActionPermissionCheck } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioHarnessOptionLoopBinding, AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioAnswerFirstCallerScope } from "../../flow-bootstrap-commands/index.ts";

type Execute = AutomationStudioHarnessOptionLoopBinding["executeTool"];

const OUTSIDE_CODE = "answer_first.outside_scope";
/** How deep into a call's value addresses are looked for, and how many strings at most: a call's value is small, and this bounds a strange one. */
const MOST_DEPTH = 6;
const MOST_STRINGS = 400;

export function automationStudioAnswerFirstScopeGate(scope: AutomationStudioAnswerFirstCallerScope | undefined, execute: Execute): Execute {
  if (scope === undefined) return execute;
  const granted = new Set<string>(scope.permittedConsequences);
  const notGranted = (classes: readonly string[]): AutomationStudioActionConsequence[] => classes.filter((each): each is AutomationStudioActionConsequence => isAutomationStudioActionConsequence(each) && !granted.has(each));
  const sites = scope.sites === undefined ? undefined : { acts: [], sites: [...scope.sites] };
  const allowed = (host: string): boolean => sites === undefined || fluxNodeScopeAllowsSite(sites, host);
  const listed = scope.sites?.length ? scope.sites.join(", ") : "none";
  /** Where the page is, as the latest answer that said so put it. */
  let onPage: string | undefined;
  return async (call) => {
    const declared = notGranted(declaredBy(call.value));
    if (declared.length) return refused(`This was not done: it is an act this task may not do (${declared.join(", ")}). Find another way to the result that does not do that.`);
    const named = sites === undefined ? [] : hostsIn(call.value);
    const outside = named.find((host) => !allowed(host));
    if (outside !== undefined) return refused(`This was not done: ${outside} is outside the sites this task may use (${listed}). Find another way to the result on those sites.`);
    if (onPage !== undefined && !allowed(onPage) && !named.some(allowed)) return refused(`This was not done: the page is on ${onPage}, outside the sites this task may use (${listed}). Go back to one of them, by its address, and carry on from there.`);
    const answer = await execute(call.permission ? { ...call, permission: withinGrant(call.permission, notGranted) } : call);
    const at = sites === undefined ? undefined : locationOf(answer);
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
function withinGrant(check: AutomationStudioActionPermissionCheck, notGranted: (classes: readonly string[]) => AutomationStudioActionConsequence[]): AutomationStudioActionPermissionCheck {
  return async (declaration) => {
    const missing = notGranted(Array.isArray(declaration.consequences) ? declaration.consequences : []);
    return missing.length ? { permitted: false, missing, requestId: null } : await check(declaration);
  };
}

/** The host of every absolute http(s) address in a call's value. */
function hostsIn(value: JsonValue): string[] {
  const hosts = new Set<string>();
  let seen = 0;
  const visit = (node: JsonValue, depth: number): void => {
    if (seen >= MOST_STRINGS || depth > MOST_DEPTH) return;
    if (typeof node === "string") {
      seen += 1;
      const host = hostOf(node);
      if (host !== undefined) hosts.add(host);
    } else if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
    } else if (node !== null && typeof node === "object") {
      for (const item of Object.values(node)) visit(item, depth + 1);
    }
  };
  visit(value, 0);
  return [...hosts];
}

function hostOf(text: string): string | undefined {
  const trimmed = text.trim();
  if (!/^https?:\/\//iu.test(trimmed) || !URL.canParse(trimmed)) return undefined;
  const host = new URL(trimmed).host.toLowerCase();
  return host.length ? host : undefined;
}

/** Where an answer says the page is, from its evidence's `location` (or `url`), when that is an http(s) address. */
function locationOf(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): string | undefined {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer) || answer.kind !== "llm_evidence_tool_execution") return undefined;
  const evidence = (answer as AutomationStudioLlmEvidenceToolExecutionResult).evidence;
  if (typeof evidence !== "object" || evidence === null || Array.isArray(evidence)) return undefined;
  const place = typeof evidence.location === "string" ? evidence.location : typeof evidence.url === "string" ? evidence.url : undefined;
  return place === undefined ? undefined : hostOf(place);
}

function refused(instruction: string): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: OUTSIDE_CODE, instruction }, effectApplied: false, targetsUnchanged: true, resultCode: OUTSIDE_CODE };
}
