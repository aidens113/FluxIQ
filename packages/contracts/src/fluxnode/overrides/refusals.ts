// The named refusals of overrides, as zod custom issues with `params.code`. They read the
// raw value, because the strict shape drops an unknown key before any refinement sees it.
// Internal to this directory.

import { FLUXNODE_PROMPT_SECTIONS } from "./section-ids.ts";
import { FLUXNODE_SAFETY_WORD_PATTERN } from "./safety-word-pattern.ts";
import { FLUXNODE_CORE_TOOL_POLICIES } from "./tool-policies.ts";

type Add = (path: (string | number)[], code: string, message: string) => void;

// Property names each object level accepts; `null` marks a level whose keys are data.
const TEXT_ENTRY_KEYS = ["mode", "text"];
const LEVELS: Record<string, string[]> = {
  "": ["prompts", "judgeCriteria", "tools", "models", "deadlines", "retryWaits", "pace"],
  models: ["explore", "judge", "repair"],
  deadlines: ["llmCallMs", "judgeMs", "personWaitMs", "modelSilence"],
  "deadlines.modelSilence": ["baseMs", "capMs"],
  retryWaits: ["backoffMs", "perNodeMs", "perRunMs"],
  pace: ["minStepGapMs"]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Adds every named refusal the raw value earns, and answers the unknown keys it named as safety words. */
export function refuseFluxNodeOverrides(raw: unknown, add: Add): { namedUnknownPaths: Set<string> } {
  const named = new Set<string>();
  if (!isRecord(raw)) return { namedUnknownPaths: named };
  for (const [level, keys] of Object.entries(LEVELS)) {
    const path = level === "" ? [] : level.split(".");
    let node: unknown = raw;
    for (const step of path) node = isRecord(node) ? node[step] : undefined;
    if (isRecord(node)) scanKeys(node, keys, path, add, named);
  }
  for (const group of ["prompts", "tools"] as const) {
    const entries = raw[group];
    if (!isRecord(entries)) continue;
    for (const [id, entry] of Object.entries(entries)) {
      if (isRecord(entry)) scanKeys(entry, TEXT_ENTRY_KEYS, [group, id], add, named);
      const replace = isRecord(entry) && entry["mode"] === "replace";
      if (group === "prompts") refusePrompt(id, replace, add);
      else if (replace && FLUXNODE_CORE_TOOL_POLICIES[id] !== "open") {
        add(["tools", id], "overrides.tool_append_only", `The tool "${id}" may only be appended to, not replaced: its description holds a rule that must stay.`);
      }
    }
  }
  return { namedUnknownPaths: named };
}

function scanKeys(node: Record<string, unknown>, known: string[], path: string[], add: Add, named: Set<string>): void {
  for (const key of Object.keys(node)) {
    if (known.includes(key) || !FLUXNODE_SAFETY_WORD_PATTERN.test(key)) continue;
    named.add([...path, key].join("\u0000"));
    add([...path, key], "overrides.safety_not_overridable", `"${key}" reaches a safety gate (permissions, scope, robot checks, secrets or screening); those are Core's and cannot be overridden.`);
  }
}

function refusePrompt(id: string, replace: boolean, add: Add): void {
  const section = FLUXNODE_PROMPT_SECTIONS[id];
  if (section === undefined) {
    if (FLUXNODE_SAFETY_WORD_PATTERN.test(id)) add(["prompts", id], "overrides.safety_not_overridable", `"${id}" reaches a safety gate; those are Core's and cannot be overridden.`);
    else add(["prompts", id], "overrides.unknown_section", `"${id}" is not a prompt section; see FLUXNODE_PROMPT_SECTIONS.`);
    return;
  }
  if (section.policy === "locked") add(["prompts", id], "overrides.section_locked", `The section "${id}" is locked: it holds words for a mechanical gate or a reply format.`);
  else if (section.policy === "append_only" && replace) add(["prompts", id], "overrides.section_append_only", `The section "${id}" may only be appended to, not replaced: it holds a safety rule that must stay.`);
}
