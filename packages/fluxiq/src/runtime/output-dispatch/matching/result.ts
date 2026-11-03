import type { AutomationNodeTargetResolution } from "../../../components/automation/index.ts";
import type { JsonObject } from "../../../core/index.ts";
import type { OutputTargetPreparation } from "../target-preparation.ts";
import type { OutputTargetSelection } from "./selection.ts";
export type OutputTargetMatchResult = {
  ok: true;
  selectedCandidate?: OutputTargetSelection;
  diagnostics: JsonObject;
  resolution: AutomationNodeTargetResolution;
} | Extract<OutputTargetPreparation, {
  ok: false;
}>;
