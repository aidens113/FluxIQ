// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IoRegistry } from "../../../io/index.ts";
import { automationStudioActivityHub } from "../../../runtime/automation-activity/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../runtime/native-nodes/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioActivityControlReader, type AutomationStudioNodeDefinition } from "../nodes/index.ts";
import { AutomationStudioService } from "../service.ts";

// The bundle's hook, from registration to a run's step card, through the real
// service: a sentence is said far below anything that knows a domain, so this is
// what proves the service puts the bound domain's reader in the run's scope.

const PRESS: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1",
  id: "example.output.press-click",
  version: "1.0.0",
  label: "Press",
  description: "Presses a control.",
  category: "action",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "press" },
  availability: { kind: "domain", domainId: "example" },
  capabilities: { executable: true },
  outputAction: { fixedOutputId: "press" },
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "failed", label: "Failed", valueType: "any" }],
  parameters: [{ id: "control", label: "Control", valueType: "json", allowStateBinding: false }]
};

let tempRoot: string;
let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-activity-control-hook-"));
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});

afterEach(async () => {
  unsubscribe();
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

async function ranStepTitles(activityControlReader: AutomationStudioActivityControlReader | undefined): Promise<string[]> {
  const io = new IoRegistry();
  io.registerOutput("example", {
    definition: { id: "press", title: "Press" },
    mode: "request",
    dispatch: async (request) => ({ ok: true, domainId: "example", outputId: request.outputId, payload: {} })
  });
  const native = new AutomationStudioNativeNodeRuntime().register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [PRESS] },
    {
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        press: () => ({ status: "success", outputs: { success: true }, effects: [{ type: "policy.output.dispatch", payload: { outputId: "press", parameters: {} } }] })
      },
      ...(activityControlReader ? { activityControlReader } : {})
    }
  );
  const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(native);
  services.add(service);
  const project = await service.createProject({ name: "Control hook", domainId: "example" });
  const flow = await service.createFlow({ projectId: project.id, flowId: "flow.press", name: "Press" });
  const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
  const blank = await service.getFlow(project.id, subflow.graphFlowId!);
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...blank,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "press", definitionId: PRESS.id, definitionVersion: PRESS.version, parameterValues: { control: { words: "Add to basket" } } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "start.press", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "press", targetPortId: "in" },
        { id: "press.end", sourceNodeId: "press", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    }
  });
  await service.setFlowMapFallback({ projectId: project.id, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  await service.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "Press the control." });
  const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
  expect(run.status).toBe("succeeded");
  return seen.flatMap((event) => event.detail?.ref === "press" && event.detail.status === "started" ? [event.detail.title] : []);
}

describe("the activity hook through the service", () => {
  it("names the control a run's step carries by the bound domain's reader", { timeout: 120_000 }, async () => {
    const reader: AutomationStudioActivityControlReader = (parameters) => ({ names: [(parameters as { control?: { words?: unknown } }).control?.words], kinds: [] });
    expect(await ranStepTitles(reader)).toEqual(["Clicking “Add to basket”"]);
  });

  it("says the verb alone for a domain whose bundle has none", { timeout: 120_000 }, async () => {
    expect(await ranStepTitles(undefined)).toEqual(["Clicking on the page"]);
  });
});
