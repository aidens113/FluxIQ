// Every gate of a project build read as one at promotion (t551): a builder's
// gate's request and declarations reach the permission outcome the proposal
// stores, as a candidate build's one gate's do. The gates are the real ones;
// the person and the domain are stand-ins on a bike-repair booking site.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionDeclaration } from "../../../action-permissions/index.ts";
import { automationStudioFlowBootstrapActionPermissions } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioAskAnswer, AutomationStudioParkingPort } from "../../../parking/index.ts";
import { automationStudioBootstrapPermissionOutcome } from "../../flow-bootstrap-commands/index.ts";
import { AutomationStudioProjectBuildPermissions, type AutomationStudioProjectBuildPorts } from "../index.ts";

const CANCEL: AutomationStudioActionDeclaration = { consequences: ["delete"], control: { name: "Cancel booking", kind: "button" }, verb: "press" };
const BOOK: AutomationStudioActionDeclaration = { consequences: ["create_new"], control: { name: "Book a service slot", kind: "button" }, verb: "press" };

/** A thread whose person answers every question no. */
function decliningThread(): AutomationStudioParkingPort {
  return {
    open: () => undefined,
    awaitAnswer: async (ask) => ({ askId: ask.askId, answeredAt: 1, kind: "deny", value: null, actorId: "person" }) satisfies AutomationStudioAskAnswer
  };
}

function gate(input: { prefix: string; at: number; ask?: AutomationStudioParkingPort }) {
  let next = 0;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: [],
    instructionIds: ["instruction.bikes"],
    newRequestId: () => `${input.prefix}:${++next}`,
    now: () => input.at,
    deriveInstructed: async () => [],
    ...(input.ask ? { ask: { port: input.ask, timeoutMs: 1_000 } } : {}),
    executeTool: async (call) => {
      const verdict = await call.permission!(call.value.declaration as unknown as AutomationStudioActionDeclaration);
      return { kind: "llm_evidence_tool_execution", evidence: { pressed: verdict.permitted }, effectApplied: verdict.permitted };
    }
  });
  const press = (callId: string, declaration: AutomationStudioActionDeclaration) => permissions.executeTool({ callId, toolId: "example.press", value: { declaration } as unknown as JsonObject });
  return { permissions, press };
}

const project = (): AutomationStudioProjectBuildPorts => ({ permissions: { deriveInstructed: async () => [] } }) as unknown as AutomationStudioProjectBuildPorts;

describe("a project build's permission outcome", () => {
  it("carries a builder's declined plan step and its declarations, which the build's own gate alone never saw", async () => {
    const build = gate({ prefix: "build", at: 1 });
    const brief = gate({ prefix: "brief", at: 2, ask: decliningThread() });
    const ports = project();
    AutomationStudioProjectBuildPermissions.of(ports).add(brief.permissions);
    await brief.press("call.book", BOOK);
    const step = await brief.permissions.planStep({ definitionId: "example.press", ref: "cancel.cancel" })(CANCEL);
    expect(step).toMatchObject({ permitted: false, declined: true, requestId: "brief:1" });

    const alone = await automationStudioBootstrapPermissionOutcome(build.permissions, () => 0);
    expect(alone.permissionRequest).toBeUndefined();
    expect(alone.declaredConsequences).toBeUndefined();

    const outcome = await automationStudioBootstrapPermissionOutcome(AutomationStudioProjectBuildPermissions.of(ports).view(build.permissions), () => 0);
    expect(outcome.permissionRequest).toMatchObject({ requestId: "brief:1", missing: ["delete"], action: { kind: "flow_step", ref: "cancel.cancel" } });
    // The booking, then the cancel step twice: asked, and checked again once the person answered.
    expect(outcome.declaredConsequences?.map((record) => record.consequences)).toEqual([["create_new"], ["delete"], ["delete"]]);
    expect(outcome.consequenceCrossCheck).toBeDefined();
  });

  it("names the latest standing request of any gate, and the build's own declarations last", async () => {
    const build = gate({ prefix: "build", at: 5 });
    const early = gate({ prefix: "early", at: 2 });
    const ports = project();
    AutomationStudioProjectBuildPermissions.of(ports).add(early.permissions);
    await early.press("call.cancel.early", CANCEL);
    await build.press("call.cancel.build", CANCEL);
    const view = AutomationStudioProjectBuildPermissions.of(ports).view(build.permissions);
    expect(view.request()?.requestId).toBe("build:1");
    expect(view.declarations().map((record) => record.action.ref)).toEqual(["call.cancel.early", "call.cancel.build"]);
    // One record per build: another build's gates are never read here.
    expect(AutomationStudioProjectBuildPermissions.of(project()).view(build.permissions).declarations()).toHaveLength(1);
  });
});
