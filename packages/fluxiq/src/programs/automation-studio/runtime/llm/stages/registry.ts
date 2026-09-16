// Where a domain says what a stage means for it.
//
// L15 gives a domain two powers and withholds a third. It may ADD instructions
// to any stage, it may REPLACE a stage's instructions outright, and it may not
// touch the order. This file is where all three are decided, and the third is
// decided by refusing rather than by no one having thought of it: a bundle
// carrying anything order-shaped is rejected with a named code, and so is a
// contribution reaching for a Core-reserved instruction id.
//
// The mechanism is the registry pattern the node registry established and the
// harness-option registry followed one directory away -- a bundle per domain,
// validated on the way in, duplicates refused. There is deliberately no second
// prompt channel: what comes out of here is an ordinary
// AutomationStudioResolvedInstruction, which is what Core's instruction
// resolution has always produced and what the context packet has always
// carried.

import type { AutomationStudioResolvedInstruction } from "../harness/index.ts";
import {
  AUTOMATION_STUDIO_CORE_LOOP_EVIDENCE_TOOL_POLICY_INSTRUCTION,
  AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTIONS,
  AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTION_ID_PREFIX,
  AUTOMATION_STUDIO_LOOP_PROTOCOL_INSTRUCTION_ID,
  AUTOMATION_STUDIO_LOOP_STAGE_SCOPE_KIND,
  automationStudioLoopProtocolInstruction
} from "./instructions.ts";
import { isAutomationStudioLoopStage, type AutomationStudioLoopStage } from "./protocol.ts";

/** Maximum contributions one registry may hold, across every domain and stage. */
export const AUTOMATION_STUDIO_LOOP_STAGE_INSTRUCTION_LIMIT = 40;

/**
 * One instruction a domain attaches to one stage.
 *
 * `mode` is the whole of L15's second power. `extend` leaves Core's default in
 * place and adds beside it; `replace` takes its place. There is no third mode,
 * and in particular none that reaches the ordering statement.
 */
export type AutomationStudioLoopStageInstructionContribution = {
  instructionId: string;
  stage: AutomationStudioLoopStage;
  mode: "extend" | "replace";
  title: string;
  body: string;
  priority?: number;
  requirement?: "advisory" | "required";
  tags?: string[];
};

export type AutomationStudioLoopStageInstructionBundle = {
  schemaVersion: "0.1";
  domainId: string;
  instructions: AutomationStudioLoopStageInstructionContribution[];
};

const BUNDLE_KEYS = new Set(["schemaVersion", "domainId", "instructions"]);
const CONTRIBUTION_KEYS = new Set(["instructionId", "stage", "mode", "title", "body", "priority", "requirement", "tags"]);
// Any key by which a registration could try to state an order of its own. Named
// explicitly so the refusal says what was attempted instead of "unknown field".
const ORDER_KEYS = new Set(["order", "stages", "stageorder", "stagesequence", "sequence", "protocol", "stageprotocol"]);
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,200}$/;
const CORE_STAGE_PRIORITY_FLOOR = 900;

export class AutomationStudioLoopStageInstructionRegistry {
  private readonly contributions: AutomationStudioLoopStageInstructionContribution[] = [];
  private readonly domains = new Set<string>();
  private readonly replacedStages = new Map<AutomationStudioLoopStage, string>();

  register(bundle: AutomationStudioLoopStageInstructionBundle): this {
    assertNoOrderKey(bundle as unknown as Record<string, unknown>, BUNDLE_KEYS, "bundle");
    if (bundle.schemaVersion !== "0.1") throw new Error("loop_stage.bundle_invalid: Automation Studio loop stage instruction bundle schema version is unsupported.");
    if (typeof bundle.domainId !== "string" || !IDENTIFIER.test(bundle.domainId)) throw new Error("loop_stage.bundle_invalid: Automation Studio loop stage instruction bundle requires the id of the domain contributing it.");
    if (this.domains.has(bundle.domainId)) throw new Error(`loop_stage.domain_already_registered: Automation Studio loop stage instructions for domain "${bundle.domainId}" are already registered. Build a new host runtime instead of registering twice.`);
    if (!Array.isArray(bundle.instructions) || !bundle.instructions.length) throw new Error("loop_stage.bundle_invalid: Automation Studio loop stage instruction bundle declares no instructions.");
    if (this.contributions.length + bundle.instructions.length > AUTOMATION_STUDIO_LOOP_STAGE_INSTRUCTION_LIMIT) {
      throw new Error(`loop_stage.bundle_invalid: Automation Studio loop stage instructions exceed the limit of ${AUTOMATION_STUDIO_LOOP_STAGE_INSTRUCTION_LIMIT}.`);
    }
    const replacements = new Map<AutomationStudioLoopStage, string>();
    const declared = new Set<string>();
    for (const contribution of bundle.instructions) {
      assertContribution(contribution, bundle.domainId);
      if (declared.has(contribution.instructionId) || this.contributions.some((held) => held.instructionId === contribution.instructionId)) {
        throw new Error(`loop_stage.duplicate_instruction_id: Automation Studio loop stage instruction "${contribution.instructionId}" is already registered.`);
      }
      declared.add(contribution.instructionId);
      if (contribution.mode !== "replace") continue;
      const held = this.replacedStages.get(contribution.stage) ?? replacements.get(contribution.stage);
      if (held !== undefined) throw new Error(`loop_stage.replacement_conflict: Automation Studio loop stage "${contribution.stage}" is already wholly overridden by instruction "${held}". Only one replacement may exist for a stage.`);
      replacements.set(contribution.stage, contribution.instructionId);
    }
    for (const contribution of bundle.instructions) this.contributions.push({ ...contribution });
    for (const [stage, instructionId] of replacements) this.replacedStages.set(stage, instructionId);
    this.domains.add(bundle.domainId);
    return this;
  }

  /**
   * The instructions for one stage: Core's default unless a domain replaced it,
   * then every addition, ordered by declared priority and then by id so the
   * same registrations always produce the same prompt.
   *
   * The ordering statement is not here. It is added by
   * `automationStudioLoopStageInstructions` below, which is what callers use,
   * so no registry state -- and no absent registry -- can drop it.
   */
  stageInstructions(stage: AutomationStudioLoopStage): AutomationStudioResolvedInstruction[] {
    const forStage = this.contributions.filter((contribution) => contribution.stage === stage);
    const replacement = forStage.find((contribution) => contribution.mode === "replace");
    const base = replacement ? resolvedContribution(replacement) : AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTIONS[stage];
    const additions = forStage
      .filter((contribution) => contribution.mode === "extend")
      .sort((left, right) => (right.priority ?? 500) - (left.priority ?? 500) || left.instructionId.localeCompare(right.instructionId));
    return [base, ...additions.map(resolvedContribution)];
  }

  /** Whether a domain has taken this stage over entirely, and with what. */
  replacementFor(stage: AutomationStudioLoopStage): string | undefined {
    return this.replacedStages.get(stage);
  }
}

/**
 * Everything the model is told about the protocol for one staged request: the
 * ordering statement first, then Core's tool policy where the request carries
 * tools, then that stage's instructions.
 *
 * The ordering statement is produced here rather than stored anywhere, so it
 * exists for a caller that registered nothing, for a caller whose domain
 * replaced every stage, and for a caller that has no registry at all. That is
 * the mechanical form of "the ordering itself is Core's": there is no state a
 * domain can reach that would make this function return without it.
 *
 * `toolsOffered` is why the tool policy is a separate instruction rather than
 * part of "gather". A runtime diagnosis gathers with no tools at all, and until
 * this existed it was handed the evidence loop's tool policy anyway -- told how
 * to choose between offered tools, and referred to a decision schema its
 * request did not contain. The policy is now attached to the condition that
 * makes it true rather than to the stage that usually implies it.
 */
export function automationStudioLoopStageInstructions(
  stage: AutomationStudioLoopStage,
  registry?: AutomationStudioLoopStageInstructionRegistry,
  options?: { toolsOffered?: boolean }
): AutomationStudioResolvedInstruction[] {
  return [
    automationStudioLoopProtocolInstruction(stage),
    ...(stage === "gather" && options?.toolsOffered === true ? [AUTOMATION_STUDIO_CORE_LOOP_EVIDENCE_TOOL_POLICY_INSTRUCTION] : []),
    ...(registry ? registry.stageInstructions(stage) : [AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTIONS[stage]])
  ];
}

function resolvedContribution(source: AutomationStudioLoopStageInstructionContribution): AutomationStudioResolvedInstruction {
  return {
    instructionId: source.instructionId,
    scopeKind: AUTOMATION_STUDIO_LOOP_STAGE_SCOPE_KIND,
    title: source.title,
    body: source.body,
    priority: source.priority ?? 500,
    requirement: source.requirement ?? "required",
    tags: source.tags ?? []
  };
}

function assertContribution(contribution: AutomationStudioLoopStageInstructionContribution, domainId: string): void {
  assertNoOrderKey(contribution as unknown as Record<string, unknown>, CONTRIBUTION_KEYS, `contribution "${String(contribution?.instructionId)}"`);
  if (!isAutomationStudioLoopStage(contribution.stage)) {
    throw new Error(`loop_stage.unknown_stage: Automation Studio loop stage "${String(contribution.stage)}" does not exist. A domain contributes to a stage Core declares; it cannot introduce one.`);
  }
  if (typeof contribution.instructionId !== "string" || !IDENTIFIER.test(contribution.instructionId)) throw new Error("loop_stage.bundle_invalid: Automation Studio loop stage instruction id is invalid.");
  if (contribution.instructionId === AUTOMATION_STUDIO_LOOP_PROTOCOL_INSTRUCTION_ID || contribution.instructionId.startsWith(AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTION_ID_PREFIX)) {
    throw new Error(`loop_stage.reserved_instruction_id: Automation Studio loop stage instruction id "${contribution.instructionId}" is Core's. Contribute under domain "${domainId}" and use mode "replace" to take a stage over.`);
  }
  if (contribution.mode !== "extend" && contribution.mode !== "replace") throw new Error(`loop_stage.bundle_invalid: Automation Studio loop stage instruction "${contribution.instructionId}" must declare mode "extend" or "replace".`);
  if (typeof contribution.title !== "string" || !contribution.title.length || contribution.title.length > 200) throw new Error(`loop_stage.bundle_invalid: Automation Studio loop stage instruction "${contribution.instructionId}" has an invalid title.`);
  if (typeof contribution.body !== "string" || !contribution.body.length || contribution.body.length > 4000) throw new Error(`loop_stage.bundle_invalid: Automation Studio loop stage instruction "${contribution.instructionId}" has an invalid body.`);
  if (contribution.priority !== undefined && (!Number.isSafeInteger(contribution.priority) || contribution.priority < 0 || contribution.priority >= CORE_STAGE_PRIORITY_FLOOR)) {
    throw new Error(`loop_stage.bundle_invalid: Automation Studio loop stage instruction "${contribution.instructionId}" must declare a priority below Core's own, which is ${CORE_STAGE_PRIORITY_FLOOR}.`);
  }
  if (contribution.requirement !== undefined && contribution.requirement !== "advisory" && contribution.requirement !== "required") throw new Error(`loop_stage.bundle_invalid: Automation Studio loop stage instruction "${contribution.instructionId}" has an invalid requirement.`);
  if (contribution.tags !== undefined && (!Array.isArray(contribution.tags) || contribution.tags.length > 10 || contribution.tags.some((tag) => typeof tag !== "string" || !IDENTIFIER.test(tag)))) {
    throw new Error(`loop_stage.bundle_invalid: Automation Studio loop stage instruction "${contribution.instructionId}" has invalid tags.`);
  }
}

/**
 * The refusal that makes the order non-overridable rather than merely
 * undocumented. Anything registered may only say what happens inside a stage,
 * so a key by which a registration could state a sequence of its own is refused
 * by name, and any other unknown key is refused as invalid.
 */
function assertNoOrderKey(value: Record<string, unknown>, allowed: Set<string>, subject: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`loop_stage.bundle_invalid: Automation Studio loop stage instruction ${subject} is not an object.`);
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) continue;
    if (ORDER_KEYS.has(key.toLowerCase().replace(/[^a-z]/gu, ""))) {
      throw new Error(`loop_stage.order_not_overridable: Automation Studio loop stage instruction ${subject} declares "${key}". The order of the loop's stages is Core's and cannot be reordered, replaced or extended by a registration; a domain may only change what happens inside a stage.`);
    }
    throw new Error(`loop_stage.bundle_invalid: Automation Studio loop stage instruction ${subject} declares unknown field "${key}".`);
  }
}
