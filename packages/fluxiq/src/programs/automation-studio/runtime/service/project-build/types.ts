import type { AutomationStudioFlowInstruction, AutomationStudioFlowPort } from "../../../model/index.ts";
import type { automationStudioFlowBootstrapActionPermissions } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmHarnessInput, AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import type { AutomationStudioParkingPort } from "../../parking/index.ts";
import type { AutomationStudioHostResourcePort } from "../../project-agents/index.ts";
import type { startAutomationStudioBuildRouting } from "../../route-state/index.ts";
import type { AutomationStudioBuildCancellation } from "../flow-bootstrap-commands/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "./whole-trials.ts";

/**
 * What a project build takes from the service beside the candidate build's own
 * input (unit A5c): the service builds these once per build, in the candidate
 * branch of `generateFlowBootstrapAdaptationInternal`, from what that branch
 * already built. Everything a brief needs of its own -- harness options and
 * node descriptions, build routing, the permission gate and person-needed, its
 * ledger -- is made per brief from these (`./brief-ports.ts`).
 *
 * - `buildId`: the build record's id, minted per build.
 * - `repair`: a repair's re-author; a project build refuses it until A7.
 * - `ledger`: the build's one lasting-act ledger; the supervisor's own acts are
 *   its `supervisor` ledger, which the service's build-level gate also holds.
 * - `host`: the domain's host-resource port; absent, one local resource.
 * - `binding`: the bound domain's evidence runtime, whole.
 * - `permissions`: the build's gate input without its executor and ledger, so a
 *   brief's gate asks the same person through the same thread.
 * - `runHarness`: the service's harness call, before any routing is applied.
 * - `trialEnvironment`: what every trial is run with; the whole candidate's
 *   trials (`./whole-trials.ts`) come in the candidate input as `trial`.
 */
export type AutomationStudioProjectBuildPorts = {
  buildId: string;
  repair: boolean;
  ledger: AutomationStudioSiteResetProjectLedger;
  paths: { projects: AutomationStudioProjectPaths; flows: AutomationStudioFlowPaths };
  host: AutomationStudioHostResourcePort | undefined;
  hostRuntime: Parameters<typeof startAutomationStudioBuildRouting>[0]["hostRuntime"];
  cancellation: AutomationStudioBuildCancellation;
  flowInputs: readonly AutomationStudioFlowPort[];
  instructions: readonly AutomationStudioFlowInstruction[];
  binding: AutomationStudioLlmEvidenceRuntimeBinding;
  permissions: Omit<Parameters<typeof automationStudioFlowBootstrapActionPermissions>[0], "executeTool" | "siteReset">;
  personAsk: { port: AutomationStudioParkingPort } | undefined;
  runHarness(request: AutomationStudioLlmHarnessInput): Promise<AutomationStudioLlmTaskResult>;
  trialEnvironment: AutomationStudioProjectBuildTrialEnvironment;
};
