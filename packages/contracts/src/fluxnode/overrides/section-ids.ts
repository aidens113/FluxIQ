// Every prompt section a FluxNode may override, by id, with how far the override may go
// and which model role reads the section. The ids name the sections Core builds its
// prompts from; a developer never invents one.

/** `open`: replace or append; `append_only`: append only; `locked`: no entry at all. */
export type FluxNodeSectionPolicy = "open" | "append_only" | "locked";

/** The role whose model call reads the section. */
export type FluxNodeSectionRole = "explore" | "judge" | "repair";

const open = (role: FluxNodeSectionRole) => Object.freeze({ policy: "open" as const, role });
const appendOnly = (role: FluxNodeSectionRole) => Object.freeze({ policy: "append_only" as const, role });
const locked = (role: FluxNodeSectionRole) => Object.freeze({ policy: "locked" as const, role });

/**
 * Locked sections hold the words for the mechanical gates (output parsing, permission and
 * secret rules, the judge's reply schema); append-only ones hold a safety rule that may be
 * added to but not replaced. The gates themselves are not reachable from any override.
 */
const SECTIONS = Object.freeze({
  "core.output_rules": locked("explore"),
  "explorer.role.task": open("explore"),
  "explorer.role.work_list": open("explore"),
  "explorer.role.general_flow": open("explore"),
  "explorer.role.rows": open("explore"),
  "explorer.role.landed": appendOnly("explore"),
  "explorer.role.completion": open("explore"),
  "explorer.role.saved_flow": open("explore"),
  "domain.instructions": appendOnly("explore"),
  "core.supplementary_recordings": appendOnly("explore"),
  "core.person_limits": locked("explore"),
  "core.evidence_decision": open("explore"),
  "core.list_authoring": open("explore"),
  "core.efficiency": open("explore"),
  "core.decision_output": open("explore"),
  "core.reusable_context": appendOnly("explore"),
  "judge.fields": locked("judge"),
  "judge.order": locked("judge"),
  "judge.verification": open("judge"),
  "judge.question": open("judge"),
  "core.in_run_repair": appendOnly("repair"),
  "core.runtime_patch_consequences": locked("repair")
});

/** A prompt section's id, as a union, so a typed caller's ids autocomplete. Judge criteria are `judgeCriteria`, not a section. */
export type FluxNodePromptSectionId = keyof typeof SECTIONS;

/** Read by any string, since a developer's id may be one Core does not have (`overrides.unknown_section`). */
export const FLUXNODE_PROMPT_SECTIONS: Readonly<Record<string, { readonly policy: FluxNodeSectionPolicy; readonly role: FluxNodeSectionRole }>> = SECTIONS;
