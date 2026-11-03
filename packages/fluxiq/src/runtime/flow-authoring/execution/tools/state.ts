import type { ExecutionObservationContext } from "../../../execution-admission/index.ts";
import type { ExecutionRetrySeries } from "../../../execution-observation/index.ts";
import type { OrdinaryExecutionRunBindingReader } from "../../../output-dispatch/admission/index.ts";
import type { AutomationStudioBuildToolObserver } from "./observer.ts";

export type AutomationStudioBuildToolRequestState = {
  readonly observer: AutomationStudioBuildToolObserver;
  readonly role: "scope" | "invocation";
  readonly series: ExecutionRetrySeries;
  readonly run?: { readonly proof: object; readonly reader: OrdinaryExecutionRunBindingReader };
  readonly permission?: { readonly callback: object; readonly originalRequest: object; entered: boolean; series?: ExecutionRetrySeries | undefined };
} & (
  | { readonly kind: "preparing" }
  | { readonly kind: "parent" | "active"; readonly parent: ExecutionObservationContext }
);
