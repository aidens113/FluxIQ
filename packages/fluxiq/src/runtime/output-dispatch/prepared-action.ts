import type { AutomationNodeTargetResolution } from "../../components/automation/index.ts";
import type { JsonObject } from "../../core/index.ts";
import type { RegisteredOutputAction } from "./action.ts";
import type { OutputTargetPreparation } from "./target-preparation.ts";
export type PreparedOutputAction = {
  ok: true;
  action: RegisteredOutputAction;
  diagnostics?: JsonObject;
  resolution?: AutomationNodeTargetResolution;
} | Extract<OutputTargetPreparation, {
  ok: false;
}>;
