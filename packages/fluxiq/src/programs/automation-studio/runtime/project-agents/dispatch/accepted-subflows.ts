import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, type AutomationStudioSubflowProposal } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/evidence-loop.ts";

// Every subflow proposal Core accepted for a brief of one build, with the
// script its builder sent for it (A8 social `run-mv96rz6h`, t622). A repair
// builder of a passing subflow was never shown the subflow it repaired: it was
// told to keep every other step as it was, saw a blank Flow and rewrote the
// subflow from nothing. The dispatcher keeps this memory for the build
// (`./run-brief.ts`) so a repair's opening look can show the subflow's
// accepted script and its steps as Core resolved them (`yourSubflow`).
//
// A proposal is told by the builder loop's `accepted`; its script is read off
// the submit tool's own answer, which carries the subflow as Core accepted it
// (`flow-bootstrap/subflow-candidate/builder-loop.ts`, `acceptedScript`). The
// latest `MAX_HELD` are kept.

/** The most accepted proposals one build's memory keeps, the latest first kept. */
const MAX_HELD = 200;

type Held = { proposal: AutomationStudioSubflowProposal; script?: string; plan?: JsonObject };
type Loop = AutomationStudioLlmEvidenceLoopInput;

const key = (briefId: string, revision: number, digest: string): string => JSON.stringify([briefId, revision, digest]);

export class AutomationStudioProjectAcceptedSubflows {
  private readonly held = new Map<string, Held>();
  /** Scripts the submit tool answered with before `accepted` was told, by the same key. */
  private readonly sent = new Map<string, Pick<Held, "script" | "plan">>();

  /** Core accepted `proposal`. */
  accepted(proposal: Readonly<AutomationStudioSubflowProposal>): void {
    const at = key(proposal.scope.briefId, proposal.revision, proposal.digest);
    const kept: Held = { ...(this.sent.get(at) ?? this.held.get(at) ?? {}), proposal: structuredClone(proposal) as AutomationStudioSubflowProposal };
    this.sent.delete(at);
    this.held.delete(at);
    this.held.set(at, kept);
    while (this.held.size > MAX_HELD) this.held.delete(this.held.keys().next().value!);
  }

  /** The proposal brief `briefId` had accepted at `revision` and `digest`, with its script where it was seen; undefined when this build holds none. */
  find(ref: { briefId: string; revision: number; digest: string }): Readonly<Held> | undefined {
    const found = this.held.get(key(ref.briefId, ref.revision, ref.digest));
    return found ? structuredClone(found) : undefined;
  }

  /** `loop` for brief `briefId`, its submit tool's accepted answers read for the script they carry (header). */
  watch(briefId: string, loop: Loop): Loop {
    const inner = loop.executeTool;
    const executeTool: Loop["executeTool"] = async (call) => {
      const ran = await inner(call);
      if (call.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID) this.answered(briefId, ran);
      return ran;
    };
    return { ...loop, executeTool };
  }

  private answered(briefId: string, ran: unknown): void {
    const evidence = isObject(ran) && ran.kind === "llm_evidence_tool_execution" && isObject(ran.evidence) ? ran.evidence : undefined;
    if (!evidence || evidence.ok !== true || typeof evidence.revision !== "number" || typeof evidence.digest !== "string") return;
    const said = typeof evidence.script === "string" ? { script: evidence.script } : isObject(evidence.plan) ? { plan: structuredClone(evidence.plan) } : undefined;
    if (!said) return;
    const at = key(briefId, evidence.revision, evidence.digest);
    const held = this.held.get(at);
    if (held) Object.assign(held, said);
    else this.sent.set(at, said);
    while (this.sent.size > MAX_HELD) this.sent.delete(this.sent.keys().next().value!);
  }
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
