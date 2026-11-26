// Project declared views once, with their latest whole payload in one tail.
//
// **Every read stays in view until the same list's same page is read again (t1048).** A held group is one kind of view
// (`./view-groups.ts`), and the web domain's read rows are one: `read.extracted`. Held whole under one group,
// `holder:read`, each read replaced the last, so a read of a list's second page took the first page's rows out of the
// model's view. Run-mwvgjb8c-5a1f2ae3 read page 1 (15 rows, the right one among them), then page 2 (11 rows); from the
// next decision on, page 1's rows were in no request, and the model chose the cheapest row it could still see, on page 2.
// So a held view whose answer says which list it read is held per read of that list: by the list's `listKey`, the
// `place` its pager said and the address it read (`engine/automation/records/read/`: the domain makes the key from the
// site's structure, never from a handle, a call or its rows). Page 1 and page 2 of one list are two reads, and both stay;
// the same page of the same list read again replaces only its own earlier rows. A held view whose answer names no list
// keeps one group per holder, as before: nothing tells two of its reads apart, and nothing is invented to.
import { createHash } from "node:crypto";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { automationStudioRecordReadHolders, automationStudioRecordReadListKey, automationStudioRecordReadPlace } from "../../../engine/automation/records/read/index.ts";
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
 * "holder:<holder>", or "holder:<holder>:<read>" where the answer names the list
 * it read (header): one group per list, place and address read. Recall's restored
 * payload has its own tool-qualified group, independent of the client groups. An
 * absent member is not invented; an empty array/null is present and replaces that
 * group's previous view. Where a top member holds a declared group, its nested
 * members are references too: the independent holder group alone carries the
 * latest whole payload.
 */
export function automationStudioLlmEvidenceCurrentView(
  records: readonly AutomationStudioLlmEvidenceEntry[],
  observedStateKeys: readonly string[]
): { history: AutomationStudioLlmEvidenceEntry[]; currentView?: AutomationStudioLlmEvidenceEntry } {
  const declared = automationStudioLlmEvidenceViewGroups(observedStateKeys);
  const groups: ViewGroup[] = declared.map((group) => ({ ...group, group: group.holder === undefined ? "top" : `holder:${group.holder}` }));
  if (groups.length) groups.push({ members: ["restored"], toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, group: `tool:${AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID}:restored` });
  /** Each shown group's latest view by its name, in the order the group first appeared, with the declared group it is one of. */
  const latest = new Map<string, { declared: ViewGroup; entry: JsonObject }>();
  const history = records.map(({ callId, toolId, value }) => {
    const replacements = new Map<string, Map<string, JsonValue>>();
    const present: Array<{ group: ViewGroup; name: string; payload: JsonObject }> = [];
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
      const name = nameOf(group, value);
      present.push({ group, name, payload });
      const replacement = replacements.get(group.holder ?? "") ?? new Map<string, JsonValue>();
      for (const key of Object.keys(payload)) replacement.set(key, { "core.view_reference": { callId, group: name } });
      replacements.set(group.holder ?? "", replacement);
    }
    // A declared top-level member may itself hold another declared group.
    // Keep its metadata in the top payload, but show its nested members through
    // the independent held group, so a later top-only view cannot erase rows.
    const nested = new Map([...replacements].filter(([holder]) => holder !== ""));
    if (toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID && isObject(value) && Object.hasOwn(value, "restored")) {
      nested.set("", new Map([["restored", { "core.view_reference": { callId, group: `tool:${toolId}:restored` } }]]));
    }
    for (const { group, name, payload } of present) {
      const shown = group.group === "top" ? project(payload, nested) : payload;
      latest.set(name, { declared: group, entry: { group: name, callId, ...(group.holder === undefined ? {} : { holder: group.holder }), value: shown } });
    }
    return { callId, toolId, value: project(value, replacements) };
  });
  if (!latest.size) return { history };
  const toolId = "core.current_view";
  const shown = groups.flatMap((group) => [...latest.values()].filter((held) => held.declared === group).map((held) => held.entry));
  return { history, currentView: { callId: toolId, toolId, value: { groups: shown } } };
}

/**
 * The group a result's view of `group` is held under (header): the declared group's own name, or, for a held group
 * whose answer names the list it read, that name and the read's identity. The identity is a digest of the list's key,
 * the place and the address, so a reference stays short and reads the same on every request.
 */
function nameOf(group: ViewGroup, value: JsonValue): string {
  if (group.holder === undefined || group.toolId !== undefined) return group.group;
  const path = [group.holder, group.members[0] ?? ""];
  const listKey = automationStudioRecordReadListKey(value, path);
  if (listKey === undefined) return group.group;
  const read = JSON.stringify([listKey, automationStudioRecordReadPlace(value, path) ?? null, addressOf(value, path) ?? null]);
  return `${group.group}:${createHash("sha256").update(read).digest("hex").slice(0, 12)}`;
}

/** The address the read was made on: its holder's `url` (the web domain's read says it there), else a `location` beside it or on the answer. */
function addressOf(value: JsonValue, path: readonly string[]): string | undefined {
  for (const holder of automationStudioRecordReadHolders(value, path)) {
    for (const said of [holder.url, holder.location]) if (typeof said === "string" && said !== "") return said;
  }
  return undefined;
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
