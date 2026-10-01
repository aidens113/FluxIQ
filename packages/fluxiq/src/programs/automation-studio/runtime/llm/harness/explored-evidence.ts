// The explored packets a runtime patch is shown, and the rule a slot of them
// must satisfy.
//
// The packet builder applies the rule while it builds the slot, and a provider
// applies the same rule to the slot it is about to send, so a request that was
// built some other way, or altered after it was built, is refused before it
// leaves the process. That is the shape the failure-evidence slot already had:
// one rule, run by its builder and re-run by the adapter.

import { AutomationStudioLlmRequestRefusedError } from "./request-refusal.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { screenAutomationStudioLlmEvidence } from "./evidence-screen.ts";
import { isAutomationStudioExploredEvidenceLabel } from "./explored-evidence-label.ts";
import { automationStudioEvidenceKey } from "./failure-evidence.ts";
import { isJsonObject, isRecord } from "./json-bounds.ts";
import type { AutomationStudioLlmExploredEvidencePacket, AutomationStudioLlmHarnessInput } from "./task-request.ts";

export type AutomationStudioLlmExploredEvidenceSlot = {
  schemaVersion: "automation-studio.exploration-evidence.v1";
  packets: AutomationStudioLlmExploredEvidencePacket[];
};

const SLOT_SCHEMA_VERSION = "automation-studio.exploration-evidence.v1";
const SLOT_KEYS = ["schemaVersion", "packets"] as const;
const ENTRY_KEYS = ["evidenceId", "toolId", "packet"] as const;
const EXPLORED_EVIDENCE_TOOL_ID = /^[a-z0-9_.:-]{1,200}$/iu;

/**
 * What stands in the slot for a packet Core will not send: one that carries a
 * key the domain declared as raw payload, or a string shaped like a
 * credential. The entry keeps its label and tool, so the model is told a look
 * happened and was withheld rather than shown a gap -- there is no count
 * beside the list, because the list itself says it.
 */
const AUTOMATION_STUDIO_WITHHELD_EXPLORED_PACKET_SCHEMA = "automation-studio.explored-packet-withheld.v1";

/**
 * The explored packets a runtime patch or a re-planning diagnosis is shown:
 * every one of them, in the order the exploration gathered them.
 *
 * There is no byte allowance, no count and no newest-first selection
 * (2026-09-30, "the model sees the whole page"): a packet that was gathered is
 * a packet the model is shown. What would make the request too large for the
 * model's context window is the provider's to refuse loudly, never this
 * builder's to trim quietly.
 *
 * Two tasks may be shown them, and both are calls the exploration was run for.
 * A runtime patch names a control the look revealed. A runtime diagnosis made at
 * the `plan` stage is the loop weighing its own earlier refusal against the page
 * it has now seen (`recovery/annotation/replan.ts`), and shown none of these
 * packets it would be the first diagnosis asked again, at the same price, for
 * the same answer.
 *
 * A packet that is not a JSON object, carries one of the domain's denied keys
 * or a credential-shaped string is replaced by a withheld marker in its place.
 * A caller defect -- the wrong task, labels that are missing, repeated or not
 * Core's -- is refused outright.
 */
export function packAutomationStudioLlmExploredEvidence(
  input: AutomationStudioLlmHarnessInput,
  exploration: NonNullable<AutomationStudioLlmHarnessInput["explorationEvidence"]>,
  deniedKeys: readonly string[]
): AutomationStudioLlmExploredEvidenceSlot {
  if (input.taskKind !== "runtime_patch" && input.taskKind !== "runtime_diagnosis") throw new AutomationStudioLlmRequestRefusedError("llm.request.exploration_evidence_invalid", "Exploration evidence is available only to runtime patch and runtime diagnosis tasks.");
  if (!Array.isArray(exploration.packets)) throw new AutomationStudioLlmRequestRefusedError("llm.request.exploration_evidence_invalid", "Exploration evidence requires a list of packets.");
  const labels = new Set<string>();
  for (const entry of exploration.packets) {
    if (!labelledEntry(entry, labels)) throw new AutomationStudioLlmRequestRefusedError("llm.request.exploration_evidence_invalid", "Exploration evidence packets require distinct bounded labels.");
    labels.add(entry.evidenceId);
  }
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  const packets = exploration.packets.map((entry) => ({
    evidenceId: entry.evidenceId,
    toolId: entry.toolId,
    packet: carriedPacket(entry.packet, denied, deniedKeys)
  }));
  return { schemaVersion: SLOT_SCHEMA_VERSION, packets };
}

/**
 * Whether a value is a slot the packet builder could have produced under
 * `deniedKeys`: exactly its fields, distinct labels Core writes, and every
 * packet a JSON object free of the domain's denied keys.
 * There is no count or byte bound; the request's size is the provider's to
 * check against the model's context window.
 */
export function isAutomationStudioLlmExploredEvidenceSlot(value: unknown, deniedKeys: readonly string[]): value is AutomationStudioLlmExploredEvidenceSlot {
  if (!isRecord(value) || !exactKeys(value, SLOT_KEYS) || value.schemaVersion !== SLOT_SCHEMA_VERSION || !Array.isArray(value.packets)) return false;
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  const labels = new Set<string>();
  for (const entry of value.packets as unknown[]) {
    if (!isRecord(entry) || !exactKeys(entry, ENTRY_KEYS) || !labelledEntry(entry, labels) || !screenedExploredPacket(entry.packet, denied)) return false;
    labels.add(entry.evidenceId as string);
  }
  return true;
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

/** The packet as sent: a copy of it, or the withheld marker in its place. */
function carriedPacket(packet: unknown, denied: ReadonlySet<string>, deniedKeys: readonly string[]): JsonObject {
  if (!isJsonObject(packet)) return withheldPacket("not_json");
  if (!screenedExploredPacket(packet, denied)) return withheldPacket("denied_key");
  if (screenAutomationStudioLlmEvidence(packet, deniedKeys).secretShaped) return withheldPacket("secret_shaped");
  return JSON.parse(JSON.stringify(packet)) as JsonObject;
}

function withheldPacket(reason: "not_json" | "denied_key" | "secret_shaped"): JsonObject {
  return { schemaVersion: AUTOMATION_STUDIO_WITHHELD_EXPLORED_PACKET_SCHEMA, withheld: reason };
}

/**
 * Whether a value is a packet Core will carry: an acyclic JSON object with none
 * of the domain's denied keys at any depth. No string, key or packet is too
 * long to carry, and a packet need not name a schema: a domain's refusal is
 * evidence too.
 */
function screenedExploredPacket(packet: unknown, deniedKeys: ReadonlySet<string>): packet is JsonObject {
  if (!isJsonObject(packet)) return false;
  const pending: unknown[] = [packet];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    const children = Array.isArray(value) ? value.map((item) => ["", item] as const) : Object.entries(value);
    for (const [key, child] of children) {
      if (deniedKeys.has(automationStudioEvidenceKey(key))) return false;
      pending.push(child);
    }
  }
  return true;
}
