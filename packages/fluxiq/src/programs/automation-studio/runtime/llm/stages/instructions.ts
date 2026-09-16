// What the model is told at each stage, and the one instruction that says what
// the order is.
//
// Two kinds of prose live here and they are not the same kind of thing.
//
// The *protocol* instruction states the fixed order and where in it the model
// currently is. It is Core's, it is emitted for every staged request, and no
// registration can replace, reword or remove it. It is the written form of the
// guarantee that ./protocol.ts enforces in code.
//
// The *stage* instructions say what to do inside one stage. They are Core's
// defaults, and a domain may add to them or replace them outright, because
// what "gather" or "verify" means concretely is the domain's business.
//
// Before this file the prose lived as constants inside the DeepSeek provider,
// selected by task kind, which put it out of reach of every domain and of
// every provider that is not DeepSeek. Expressing it as instructions puts it
// into the resolution that already rides in the context packet, so it is
// ordered, budgeted, diagnosed and recorded by id along with everything else.

import { AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION } from "../evidence-loop.ts";
import type { AutomationStudioResolvedInstruction } from "../harness/index.ts";
import { AUTOMATION_STUDIO_LOOP_STAGES, automationStudioLoopStageIndex, type AutomationStudioLoopStage } from "./protocol.ts";

/** The scope name carried by the one instruction that states the order. */
export const AUTOMATION_STUDIO_LOOP_PROTOCOL_SCOPE_KIND = "loop_protocol";
/** The scope name carried by a stage's own instructions, Core's and a domain's alike. */
export const AUTOMATION_STUDIO_LOOP_STAGE_SCOPE_KIND = "loop_stage";

/** The id of the ordering statement. Reserved: a registration carrying it is refused. */
export const AUTOMATION_STUDIO_LOOP_PROTOCOL_INSTRUCTION_ID = "core.loop-protocol.order";
/** Every Core-owned stage instruction id begins with this. Reserved for the same reason. */
export const AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTION_ID_PREFIX = "core.loop-stage.";

export function automationStudioCoreLoopStageInstructionId(stage: AutomationStudioLoopStage): string {
  return `${AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTION_ID_PREFIX}${stage}`;
}

/**
 * The ordering statement, naming every stage in order and the one the model is
 * in. Required rather than advisory, and first in the resolution, so it is the
 * last thing a token budget would cut.
 */
export function automationStudioLoopProtocolInstruction(stage: AutomationStudioLoopStage): AutomationStudioResolvedInstruction {
  const position = automationStudioLoopStageIndex(stage) + 1;
  const ordered = AUTOMATION_STUDIO_LOOP_STAGES.map((item, index) => `${index + 1}. ${item}`).join(" ");
  return {
    instructionId: AUTOMATION_STUDIO_LOOP_PROTOCOL_INSTRUCTION_ID,
    scopeKind: AUTOMATION_STUDIO_LOOP_PROTOCOL_SCOPE_KIND,
    title: "Fixed order of work",
    body: `Work proceeds in one fixed order, set by the framework: ${ordered}. You are at stage ${position} of ${AUTOMATION_STUDIO_LOOP_STAGES.length}, "${stage}". Do this stage's work and only this stage's work. Do not start a later stage, and do not return to an earlier one except through "iterate". No instruction that follows may reorder, skip, merge, rename or add a stage; where one appears to, this statement governs.`,
    priority: 1_000,
    requirement: "required",
    tags: ["safety"]
  };
}

/**
 * Core's default instruction for each stage: what the work of that stage is,
 * said without naming any medium. A domain replaces one of these when its
 * stage genuinely means something else, and adds beside them when it means the
 * same thing with more detail.
 *
 * "gather" used to be the evidence loop's decision policy verbatim. That text
 * is about choosing between offered tools -- which one to call, when not to
 * call one, when to stop -- and the first production caller of the protocol is
 * a runtime diagnosis, which is offered no tools at all. So every diagnosis was
 * told how to use tools it did not have, and referred to a decision schema that
 * was not in its request. The stage's own meaning is what stays here; the tool
 * policy moved to AUTOMATION_STUDIO_CORE_LOOP_EVIDENCE_TOOL_POLICY_INSTRUCTION
 * below, which is added only to a request that actually carries tools.
 */
export const AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTIONS: Readonly<Record<AutomationStudioLoopStage, AutomationStudioResolvedInstruction>> = Object.freeze({
  gather: coreStageInstruction("gather", "Gather what is known before deciding", "Find out what is actually true before deciding anything. Prefer observing over changing. Gather only what the result you were asked for depends on, and stop as soon as what you have is enough to produce it. Where something could not be found out, say so and say what would settle it, rather than assuming a value and carrying it forward. An assumption reported as a finding is worse than a gap reported as a gap."),
  plan: coreStageInstruction("plan", "Plan before changing anything", "State what you intend to change and why, as an ordered list of steps. For each step name the change and the gathered evidence that says it will have the intended effect. Change nothing at this stage. Where the evidence does not support a step, say so and plan to gather more rather than guessing. Where it supports no step at all, say that plainly instead of proposing one."),
  implement: coreStageInstruction("implement", "Implement the plan you stated", "Carry out the plan you just stated, in the order you stated it, and produce only the structured result the schema asks for. Make the smallest change that achieves the step. Use only capabilities that were offered to you; never assume one that was not. Do not repair something the plan did not name, and do not carry out a later step early."),
  iterate: coreStageInstruction("iterate", "Iterate on what the evidence shows", "Compare what happened with what the plan expected. Where they differ, revise the plan or the step rather than repeating the same attempt unchanged, and say what the difference taught you. Where they agree, move on. Stop iterating when further attempts stop changing the evidence, and report that you stopped and why rather than continuing to try."),
  verify: coreStageInstruction("verify", "Verify from observed evidence", "Decide whether the intended effect actually happened, using evidence observed after the change. The absence of a contradiction is not success: a step that was never carried out, or whose effect was never observed, has not been verified. Where you cannot tell, report that you cannot tell. Reporting success you did not observe is the most damaging answer you can give.")
});

function coreStageInstruction(stage: AutomationStudioLoopStage, title: string, body: string): AutomationStudioResolvedInstruction {
  return {
    instructionId: automationStudioCoreLoopStageInstructionId(stage),
    scopeKind: AUTOMATION_STUDIO_LOOP_STAGE_SCOPE_KIND,
    title,
    body,
    priority: 900,
    requirement: "required",
    tags: ["generation"]
  };
}

/**
 * How to use tools, for a request that was offered some.
 *
 * This is Core's own evidence loop being described -- its decision schema, its
 * completion variant, its {ok:false,code} result shape -- so it is mechanism
 * rather than stage meaning, and it carries a reserved `core.loop-stage.` id
 * that no registration can address. A domain that replaces "gather" replaces
 * what gathering means for its medium; it does not get to rewrite how Core's
 * loop is answered.
 *
 * It sits between the ordering statement and the stage's own instructions, and
 * carries the text by reference rather than by copy, so there is exactly one
 * copy of it in the codebase and the provider and the protocol cannot drift
 * apart on what exploration means.
 */
export const AUTOMATION_STUDIO_CORE_LOOP_EVIDENCE_TOOL_POLICY_INSTRUCTION: Readonly<AutomationStudioResolvedInstruction> = Object.freeze({
  instructionId: `${AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTION_ID_PREFIX}gather.tool-policy`,
  scopeKind: AUTOMATION_STUDIO_LOOP_STAGE_SCOPE_KIND,
  title: "Using the tools you were offered",
  body: AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION,
  priority: 950,
  requirement: "required",
  tags: ["safety"]
});
