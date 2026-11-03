import type { RuntimeFailureRecord } from "@fluxiq/contracts/runtime";
import type { AutomationNodeTargetResolution } from "../../components/automation/index.ts";
import type { JsonObject } from "../../core/index.ts";

/** Target preparation cannot replace output identity, confirmation or authority. */
export type OutputTargetPreparation =
  | {
      ok: true;
      parameters?: Record<string, unknown>;
      diagnostics?: JsonObject;
      resolution?: AutomationNodeTargetResolution;
    }
  | {
      ok: false;
      error: string;
      failure: RuntimeFailureRecord;
      resolution?: AutomationNodeTargetResolution;
    };
