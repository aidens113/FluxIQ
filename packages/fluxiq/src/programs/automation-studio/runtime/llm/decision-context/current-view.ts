// Project declared views once, with their latest whole payload in one tail.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceEntry } from "../context-window.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID } from "../evidence-recall/tool-id.ts";
import { automationStudioLlmEvidenceViewGroups, type AutomationStudioLlmEvidenceViewGroup } from "./view-groups.ts";

type ViewGroup = AutomationStudioLlmEvidenceViewGroup & { group: string; toolId?: string };

/**
 * Each present declared member stays in its original property position, with
 * value {"core.view_reference":{callId,group}}. The reference identifies its
 * original result, never a successor. All other properties remain untouched.
 *
 * The dynamic core.current_view value is {groups:[{group,callId,holder?,value}]},
 * where value contains every present member of that group's latest result,
 * whole and in its original order. Top-level group is "top"; held groups are
 * "holder:<holder>". Recall's restored payload has its own tool-qualified
 * group, independent of the client groups. An absent member is not invented;
 * an empty array/null is present and replaces that group's previous view.
 * Where a top member holds a declared group, its nested members are references
 * too: the independent holder group alone carries the latest whole payload.
 */
export function automationStudioLlmEvidenceCurrentView(
  records: readonly AutomationStudioLlmEvidenceEntry[],
  observedStateKeys: readonly string[]
): { history: AutomationStudioLlmEvidenceEntry[]; currentView?: AutomationStudioLlmEvidenceEntry } {
  const declared = automationStudioLlmEvidenceViewGroups(observedStateKeys);
  const groups: ViewGroup[] = declared.map((group) => ({ ...group, group: group.holder === undefined ? "top" : `holder:${group.holder}` }));
  if (groups.length) groups.push({ members: ["restored"], toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, group: `tool:${AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID}:restored` });
  const latest = new Map<string, JsonObject>();
  const history = records.map(({ callId, toolId, value }) => {
    const replacements = new Map<string, Map<string, JsonValue>>();
    const present: Array<{ group: ViewGroup; payload: JsonObject }> = [];
    for (const group of groups) {
      if (group.toolId !== undefined && toolId !== group.toolId) continue;
      const holder = objectAt(value, group.holder);
      if (!holder) continue;
      const members = new Set(group.members);
      const payload: JsonObject = {};
      for (const [key, member] of Object.entries(holder)) {
        if (members.has(key)) payload[key] = member;
      }
      if (!Object.keys(payload).length) continue;
      present.push({ group, payload });
      const replacement = replacements.get(group.holder ?? "") ?? new Map<string, JsonValue>();
      for (const key of Object.keys(payload)) replacement.set(key, { "core.view_reference": { callId, group: group.group } });
      replacements.set(group.holder ?? "", replacement);
    }
    // A declared top-level member may itself hold another declared group.
    // Keep its metadata in the top payload, but show its nested members through
    // the independent held group, so a later top-only view cannot erase rows.
    const nested = new Map([...replacements].filter(([holder]) => holder !== ""));
    if (toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID && isObject(value) && Object.hasOwn(value, "restored")) {
      nested.set("", new Map([["restored", { "core.view_reference": { callId, group: `tool:${toolId}:restored` } }]]));
    }
    for (const { group, payload } of present) {
      const shown = group.group === "top" ? project(payload, nested) : payload;
      latest.set(group.group, { group: group.group, callId, ...(group.holder === undefined ? {} : { holder: group.holder }), value: shown });
    }
    return { callId, toolId, value: project(value, replacements) };
  });
  if (!latest.size) return { history };
  const toolId = "core.current_view";
  return { history, currentView: { callId: toolId, toolId, value: { groups: groups.flatMap(({ group }) => latest.has(group) ? [latest.get(group)!] : []) } } };
}

function objectAt(value: JsonValue, holder?: string): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  const selected = holder === undefined ? value : value[holder];
  return selected !== undefined && isObject(selected) ? selected : undefined;
}

function project(value: JsonValue, replacements: ReadonlyMap<string, ReadonlyMap<string, JsonValue>>): JsonValue {
  if (!replacements.size || !isObject(value)) return value;
  const projected: JsonObject = {};
  const top = replacements.get("");
  for (const [key, member] of Object.entries(value)) {
    if (top?.has(key)) {
      projected[key] = top.get(key)!;
      continue;
    }
    const held = replacements.get(key);
    if (!held || !isObject(member)) {
      projected[key] = member;
      continue;
    }
    const holder: JsonObject = {};
    for (const [name, item] of Object.entries(member)) holder[name] = held.has(name) ? held.get(name)! : item;
    projected[key] = holder;
  }
  return projected;
}

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
