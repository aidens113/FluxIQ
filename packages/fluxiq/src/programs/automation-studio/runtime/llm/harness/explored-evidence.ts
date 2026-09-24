// The explored packets a runtime patch is shown, and the rule a slot of them
// must satisfy.
//
// The packet builder applies the rule while it builds the slot, and a provider
// applies the same rule to the slot it is about to send, so a request that was
// built some other way, or altered after it was built, is refused before it
// leaves the process. That is the shape the failure-evidence slot already had:
// one rule, run by its builder and re-run by the adapter.

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import { automationStudioLlmTokenBudgetBytes } from "../token-estimation.ts";
import { isAutomationStudioExploredEvidenceLabel } from "./explored-evidence-label.ts";
import { automationStudioEvidenceKey } from "./failure-evidence.ts";
import { isJsonObject, isRecord } from "./json-bounds.ts";
import type { AutomationStudioLlmExploredEvidencePacket, AutomationStudioLlmHarnessInput } from "./task-request.ts";
import { resolveAutomationStudioLlmTokenLimits } from "./token-limits.ts";

export type AutomationStudioLlmExploredEvidenceSlot = {
  schemaVersion: "automation-studio.exploration-evidence.v1";
  packets: AutomationStudioLlmExploredEvidencePacket[];
  withheldPackets: number;
};

const SLOT_SCHEMA_VERSION = "automation-studio.exploration-evidence.v1";
const SLOT_KEYS = ["schemaVersion", "packets", "withheldPackets"] as const;
const ENTRY_KEYS = ["evidenceId", "toolId", "packet"] as const;
/**
 * What a runtime patch request costs besides its context: the provider's system
 * prompt, the `runtime_patch` output schema and the request envelope. An empty
 * runtime patch request measured 3,774 bytes by the DeepSeek adapter's own
 * estimate on 2026-09-16; the rest is headroom for the explored-evidence
 * instruction and for growth. `harness.test.ts` sends the largest slot the room
 * admits through that estimate, so outgrowing this reserve fails the build
 * rather than a live patch call.
 */
const RUNTIME_PATCH_REQUEST_OVERHEAD_BYTES = 6_000;
const EXPLORED_EVIDENCE_TOOL_ID = /^[a-z0-9_.:-]{1,200}$/iu;

/**
 * The explored packets a runtime patch or a re-planning diagnosis may be shown,
 * bounded twice.
 *
 * By count, at the loop's own ceiling on the evidence one exploration can
 * gather. By bytes, at the smaller of the caller's allowance and the room the
 * rest of the request left under its input-token limit -- so carrying the
 * exploration can never push a patch call that would have been sent over its
 * budget and get it refused. Newest first, because the newest page is the one
 * the repair runs against; a packet that does not fit, or that is not a
 * bounded packet free of the domain's denied keys, is withheld and counted.
 *
 * Two tasks may be shown them, and both are calls the exploration was run for.
 * A runtime patch names a control the look revealed. A runtime diagnosis made at
 * the `plan` stage is the loop weighing its own earlier refusal against the page
 * it has now seen (`recovery/annotation/replan.ts`), and shown none of these
 * packets it would be the first diagnosis asked again, at the same price, for
 * the same answer.
 *
 * A caller defect -- the wrong task, no allowance, labels that are missing,
 * repeated or not Core's -- is refused outright.
 */
export function packAutomationStudioLlmExploredEvidence(
  input: AutomationStudioLlmHarnessInput,
  exploration: NonNullable<AutomationStudioLlmHarnessInput["explorationEvidence"]>,
  deniedKeys: readonly string[],
  packedBytes: number
): AutomationStudioLlmExploredEvidenceSlot {
  if (input.taskKind !== "runtime_patch" && input.taskKind !== "runtime_diagnosis") throw new Error("Exploration evidence is available only to runtime patch and runtime diagnosis tasks.");
  if (!Number.isSafeInteger(exploration.maxBytes) || exploration.maxBytes < 1) throw new Error("Exploration evidence requires a positive byte allowance.");
  if (!Array.isArray(exploration.packets)) throw new Error("Exploration evidence requires a list of packets.");
  const labels = new Set<string>();
  for (const entry of exploration.packets) {
    if (!labelledEntry(entry, labels)) throw new Error("Exploration evidence packets require distinct bounded labels.");
    labels.add(entry.evidenceId);
  }
  const limits = resolveAutomationStudioLlmTokenLimits(input.tokenLimits).limits;
  const inputTokens = Math.min(limits.maxInputTokens, limits.maxTotalTokens - limits.maxOutputTokens);
  const allowance = Math.min(exploration.maxBytes, automationStudioLlmTokenBudgetBytes(inputTokens) - packedBytes - RUNTIME_PATCH_REQUEST_OVERHEAD_BYTES);
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  const carried: AutomationStudioLlmExploredEvidencePacket[] = [];
  let withheldPackets = 0;
  for (let index = exploration.packets.length - 1; index >= 0; index -= 1) {
    const entry = exploration.packets[index]!;
    const candidate = carried.length < AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls && boundedExploredPacket(entry.packet, denied)
      ? { evidenceId: entry.evidenceId, toolId: entry.toolId, packet: JSON.parse(JSON.stringify(entry.packet)) as JsonObject }
      : undefined;
    // Measured as the slot is sent, with the key in front of it and the largest withheld count it could carry.
    if (candidate && Buffer.byteLength(JSON.stringify({ explorationEvidence: exploredEvidenceSlot([candidate, ...carried], exploration.packets.length) }), "utf8") <= allowance) carried.unshift(candidate);
    else withheldPackets += 1;
  }
  return exploredEvidenceSlot(carried, withheldPackets);
}

/**
 * Whether a value is a slot the packet builder could have produced under
 * `deniedKeys`: exactly its fields, no more packets than one exploration can
 * gather, distinct labels Core writes, and every packet bounded and free of the
 * domain's denied keys. The byte bound is the request's, which a provider
 * checks as a whole.
 */
export function isAutomationStudioLlmExploredEvidenceSlot(value: unknown, deniedKeys: readonly string[]): value is AutomationStudioLlmExploredEvidenceSlot {
  if (!isRecord(value) || !exactKeys(value, SLOT_KEYS) || value.schemaVersion !== SLOT_SCHEMA_VERSION
    || !Number.isSafeInteger(value.withheldPackets) || (value.withheldPackets as number) < 0
    || !Array.isArray(value.packets) || value.packets.length > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls) return false;
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  const labels = new Set<string>();
  for (const entry of value.packets as unknown[]) {
    if (!isRecord(entry) || !exactKeys(entry, ENTRY_KEYS) || !labelledEntry(entry, labels) || !boundedExploredPacket(entry.packet, denied)) return false;
    labels.add(entry.evidenceId as string);
  }
  return true;
}

function exploredEvidenceSlot(packets: AutomationStudioLlmExploredEvidencePacket[], withheldPackets: number): AutomationStudioLlmExploredEvidenceSlot {
  return { schemaVersion: SLOT_SCHEMA_VERSION, packets, withheldPackets };
}

/** A label Core writes, not already used in this slot, on an entry naming a bounded option id. */
function labelledEntry(entry: unknown, labels: ReadonlySet<string>): entry is { evidenceId: string; toolId: string; packet: unknown } {
  if (!isRecord(entry)) return false;
  return isAutomationStudioExploredEvidenceLabel(entry.evidenceId) && !labels.has(entry.evidenceId)
    && typeof entry.toolId === "string" && EXPLORED_EVIDENCE_TOOL_ID.test(entry.toolId);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value);
  return present.length === keys.length && present.every((key) => keys.includes(key));
}

/**
 * Whether a value is a packet Core will carry: bounded JSON with a schema
 * version, no string longer than a failure packet may hold, and none of the
 * domain's denied keys at any depth. The byte bound is the slot's, above,
 * because an explored page is allowed to be larger than a failure snapshot.
 */
function boundedExploredPacket(packet: unknown, deniedKeys: ReadonlySet<string>): packet is JsonObject {
  if (!isJsonObject(packet) || typeof packet.schemaVersion !== "string" || !/^[a-z0-9_.:-]{1,100}$/iu.test(packet.schemaVersion)) return false;
  const pending: unknown[] = [packet];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "string") { if (value.length > 2_000) return false; continue; }
    if (!value || typeof value !== "object") continue;
    const children = Array.isArray(value) ? value.map((item) => ["", item] as const) : Object.entries(value);
    for (const [key, child] of children) {
      if (key.length > 100 || deniedKeys.has(automationStudioEvidenceKey(key))) return false;
      pending.push(child);
    }
  }
  return true;
}
