import { automationStudioLlmRunNodesIdentity } from "./identity.ts";
import { automationStudioLlmRunNodesEffectiveInput, automationStudioLlmRunNodesEffectSafe, automationStudioLlmRunNodesOriginal, automationStudioLlmRunNodesSameInput } from "./prior-call.ts";
import { automationStudioLlmRunNodesReadReceipt } from "./result.ts";
import type {
  AutomationStudioLlmRunNodesIdentity,
  AutomationStudioLlmRunNodesInput,
  AutomationStudioLlmRunNodesMemberReceipt,
  AutomationStudioLlmRunNodesOriginal,
  AutomationStudioLlmRunNodesResult,
  AutomationStudioLlmRunNodesStopReason
} from "./types.ts";

/** Sequential coordinator only. The injected member path owns every real execution and its accounting. */
export async function runAutomationStudioLlmPriorNodes(input: AutomationStudioLlmRunNodesInput): Promise<AutomationStudioLlmRunNodesResult> {
  const requested = callsOf(input.value);
  if (requested === "invalid") return refused([], 0, "input_invalid");
  const duplicates = requested.findIndex((callId, index) => requested.indexOf(callId) !== index);
  if (duplicates !== -1) return refused(requested, duplicates, "duplicate_call");
  const originals: AutomationStudioLlmRunNodesOriginal[] = [];
  for (const [index, callId] of requested.entries()) {
    try {
      const prior = input.ports.lookupPriorCall(callId);
      if (!prior) return refused(requested, index, "unknown_call");
      const original = automationStudioLlmRunNodesOriginal(prior, callId, input.loopId);
      if (!original) return refused(requested, index, "ineligible_original");
      originals.push(original);
    } catch {
      return refused(requested, index, "provenance_unreadable");
    }
  }
  // Complete prevalidation: an unsafe or revoked final original dispatches no earlier member.
  for (const [index, original] of originals.entries()) {
    const reason = await eligibility(input, original);
    if (reason) return refused(requested, index, reason);
  }
  let identity: AutomationStudioLlmRunNodesIdentity;
  try {
    identity = automationStudioLlmRunNodesIdentity(originals, input.world);
    if (await input.ports.listGuard.admit(identity) !== true) return refused(requested, 0, "list_guard_refused", identity);
  } catch {
    return refused(requested, 0, "list_guard_unreadable");
  }
  const executed: AutomationStudioLlmRunNodesMemberReceipt[] = [];
  let stop: AutomationStudioLlmRunNodesResult["stop"];
  for (const [index, original] of originals.entries()) {
    let reason = await allowance(input);
    if (!reason) reason = await eligibility(input, original);
    // Authority resolution may await; cancellation and the existing purse/time guards still bind at dispatch.
    if (!reason) reason = await allowance(input);
    if (reason) {
      stop = { index, priorCallId: original.callId, reason };
      break;
    }
    try {
      const actual = await input.ports.runMember({ index, original, value: structuredClone(original.input), signal: input.signal });
      executed.push({ index, priorCallId: original.callId, kind: "returned", callId: actual.callId, result: actual.result });
      const read = automationStudioLlmRunNodesReadReceipt(actual.result);
      if (read.kind !== "succeeded") reason = read.reason;
      else if (read.resultCode !== original.resultCode) reason = "result_code_changed";
      else if (input.signal?.aborted) reason = "cancelled";
      if (reason) {
        stop = { index, priorCallId: original.callId, reason };
        break;
      }
    } catch (error) {
      executed.push({ index, priorCallId: original.callId, kind: "threw", error });
      stop = { index, priorCallId: original.callId, reason: "member_threw" };
      break;
    }
  }
  const result: AutomationStudioLlmRunNodesResult = {
    kind: stop ? "stopped" : "completed",
    requested,
    executed,
    skipped: requested.slice(executed.length),
    identity
  };
  if (stop) result.stop = stop;
  try {
    await input.ports.listGuard.recorded(identity, result);
    result.listRecord = "recorded";
  } catch {
    // The actual receipts stand. The owning loop must fail closed on its guard's record failure.
    result.listRecord = "failed";
    result.kind = "stopped";
    if (!result.stop) result.stop = { index: requested.length, reason: "list_guard_record_failed" };
  }
  return result;
}

async function eligibility(input: AutomationStudioLlmRunNodesInput, original: AutomationStudioLlmRunNodesOriginal): Promise<AutomationStudioLlmRunNodesStopReason | undefined> {
  try {
    const prior = input.ports.lookupPriorCall(original.callId);
    const current = prior && automationStudioLlmRunNodesOriginal(prior, original.callId, input.loopId);
    if (!current) return "ineligible_original";
    if (current.definitionId !== original.definitionId || current.definitionVersion !== original.definitionVersion || current.authorityKey !== original.authorityKey
      || current.resultCode !== original.resultCode || !automationStudioLlmRunNodesSameInput(automationStudioLlmRunNodesEffectiveInput(current), automationStudioLlmRunNodesEffectiveInput(original))) return "authority_changed";
    const authority = await input.ports.resolveAuthority(original);
    if (!authority) return "authority_unavailable";
    if (authority.definitionId !== original.definitionId || authority.definitionVersion !== original.definitionVersion || authority.authorityKey !== original.authorityKey) return "authority_changed";
    if (authority.observedEffect && !automationStudioLlmRunNodesEffectSafe(authority.observedEffect)) return "unsafe_effect";
  } catch {
    return "authority_unavailable";
  }
  if (!input.ports.resolveRerunEffect) return "effect_unavailable";
  try {
    const parameters = structuredClone(original.input.parameters);
    const effect = await input.ports.resolveRerunEffect(original.definitionId, parameters);
    if (!effect) return "effect_unavailable";
    return automationStudioLlmRunNodesEffectSafe(effect) ? undefined : "unsafe_effect";
  } catch {
    return "effect_unavailable";
  }
}

async function allowance(input: AutomationStudioLlmRunNodesInput): Promise<AutomationStudioLlmRunNodesStopReason | undefined> {
  if (input.signal?.aborted) return "cancelled";
  try {
    const read = await input.ports.allowance();
    if (input.signal?.aborted) return "cancelled";
    if (read.allowed === true) return undefined;
    return read.allowed === false && ["cancelled", "tool_calls", "time", "purse", "unavailable"].includes(read.reason) ? read.reason : "allowance_unreadable";
  } catch {
    return "allowance_unreadable";
  }
}

function callsOf(value: unknown): string[] | "invalid" {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => key !== "calls")) return "invalid";
    const descriptor = Object.getOwnPropertyDescriptor(value, "calls");
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return "invalid";
    const calls: unknown = descriptor.value;
    if (!Array.isArray(calls) || !calls.length) return "invalid";
    const copied: unknown[] = [...calls];
    if (!copied.every((callId): callId is string => typeof callId === "string" && callId.length > 0 && callId.trim() === callId && !/\s/u.test(callId))) return "invalid";
    return copied;
  } catch {
    return "invalid";
  }
}

function refused(requested: readonly string[], index: number, reason: AutomationStudioLlmRunNodesStopReason, identity?: AutomationStudioLlmRunNodesIdentity): AutomationStudioLlmRunNodesResult {
  return {
    kind: "rejected",
    requested,
    executed: [],
    skipped: [...requested],
    stop: { index, priorCallId: requested[index], reason },
    identity
  };
}
