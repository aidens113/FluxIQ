// The lasting classes a part's steps can cause, read from what each step declared
// (a static version of `runtime/adaptation/flow-change/lasting-acts.ts`), through
// the parts it calls.
//
// **Fails closed.** A step that can act and declared nothing, one whose
// declaration this cannot read, one that is marked lasting but names no class, and
// a call whose part is not known are not guessed at: the part is reported as
// unclassified and is not saved, because a card that said "nothing lasting" about
// a step nobody classified would be the one lie a guard could not catch.
import { AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES, type AutomationStudioAttemptActClass } from "@fluxiq/contracts/automation";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY, automationStudioNodeExplicitLastingRisk } from "../../../engine/automation/defensive/index.ts";
import { partCalleeOf } from "./calls.ts";
import type { AutomationStudioPartStep } from "./steps.ts";
import type { AutomationStudioPartCallee } from "./types.ts";

export type AutomationStudioPartLastingClasses =
  | { classes: AutomationStudioAttemptActClass[] }
  | { problem: "part.unclassified_step" | "part.unreadable_consequences" | "part.unresolved_call"; nodeId: string };

export function partLastingClassesOf(steps: readonly AutomationStudioPartStep[], callees: Readonly<Record<string, AutomationStudioPartCallee>>): AutomationStudioPartLastingClasses {
  const found = new Set<AutomationStudioAttemptActClass>();
  for (const step of steps) {
    if (!step.acting) continue;
    if (step.isCall) {
      const callee = partCalleeOf(step, callees);
      if (!callee) return { problem: "part.unresolved_call", nodeId: step.node.id };
      for (const kept of callee.lastingClasses) found.add(kept);
      continue;
    }
    const declared = step.node.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
    if (!Array.isArray(declared)) return { problem: "part.unclassified_step", nodeId: step.node.id };
    for (const item of declared) {
      const known = AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES.find((candidate) => candidate === item);
      if (!known) return { problem: "part.unreadable_consequences", nodeId: step.node.id };
      found.add(known);
    }
    if (declared.length === 0 && automationStudioNodeExplicitLastingRisk(step.node)) return { problem: "part.unclassified_step", nodeId: step.node.id };
  }
  return { classes: AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES.filter((known) => found.has(known)) };
}
