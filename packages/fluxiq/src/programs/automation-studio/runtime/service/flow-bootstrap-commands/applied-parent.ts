// The parent Flow as applying a Flow Bootstrap adaptation saves it.
//
// Split out of the service's apply (`../../service.ts`), which saves the
// topology's graphs, Subflows and Router and then this: the parent with the
// adaptation that built it named, the instructions it was built from, what
// those instructions were read to ask for, and what the Flow as a whole
// requires a runtime to support (contract C10). Where the adaptation's build
// judged a trial yes, it also records that trial against the versions apply
// saved, for a playback's result check to hold a double no to (t662,
// `../../flow-version/judged-build-trial/`); where it judged none, an earlier
// build's record is removed.
import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { AutomationStudioBootstrapAdaptation, AutomationStudioBootstrapTopology } from "../../flow-bootstrap/index.ts";
import { automationStudioMetadataWithJudgedBuildTrial, type AutomationStudioFlowJudgedBuildTrial } from "../../flow-version/index.ts";

/**
 * The parent Flow with the metadata apply writes on it. Everything else the
 * parent holds, and every metadata key apply does not write, is kept.
 *
 * `requires` is the Flow-level union of what its graphs require (a handler, a
 * call to a part, a page fact; `topology.requires`), joined with what the
 * parent already required, so an extend never drops a requirement an earlier
 * build wrote. A topology that requires nothing leaves the parent's
 * `requires` as it was, absent on a Flow nothing required before.
 */
export function automationStudioBootstrapAppliedParent(
  parent: AutomationStudioFlowArtifact,
  adaptation: Pick<AutomationStudioBootstrapAdaptation, "adaptationId" | "sourceInstructionIds" | "instructedConsequences"> & { topology: Pick<AutomationStudioBootstrapTopology, "requires"> },
  /** The build's judged-yes trial of what apply saved (`automationStudioAppliedJudgedBuildTrial`); absent removes any earlier one. */
  judgedBuildTrial?: AutomationStudioFlowJudgedBuildTrial
): AutomationStudioFlowArtifact {
  const required = adaptation.topology.requires ?? [];
  const earlier = Array.isArray(parent.metadata?.requires) ? parent.metadata.requires.filter((entry): entry is string => typeof entry === "string") : [];
  return {
    ...parent,
    metadata: {
      ...automationStudioMetadataWithJudgedBuildTrial(parent.metadata, judgedBuildTrial),
      bootstrapAdaptationId: adaptation.adaptationId,
      bootstrapSourceInstructionIds: [...adaptation.sourceInstructionIds],
      // Read at run time by `currentAutomationStudioInstructedConsequences`, with no model, while each instruction's text is unchanged.
      ...(adaptation.instructedConsequences?.length ? { bootstrapInstructedConsequences: structuredClone(adaptation.instructedConsequences) } : {}),
      // Read by the requirement gate before any run (`../runtime-session/requirement-gate.ts`).
      ...(required.length ? { requires: [...new Set([...earlier, ...required])] } : {})
    }
  };
}
