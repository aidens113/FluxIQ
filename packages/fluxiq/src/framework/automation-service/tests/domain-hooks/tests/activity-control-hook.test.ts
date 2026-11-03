// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IoRegistry } from "../../../../../io/index.ts";
import { automationStudioActivityHub } from "../../../../../runtime/automation-activity/index.ts";
import { automationStudioDomainReadings, runWithAutomationStudioDomainReadings } from "../../../../../runtime/domain-readings/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../../../runtime/native-nodes/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioActivityControlReader, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { AutomationStudioService } from "../../../service.ts";

// The bundle's hook, from registration to a run's step card, through the real
// service: a sentence is said far below anything that knows a domain, so this is
// what proves the service puts the bound domain's reader in the run's scope, and
// only that domain's.

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

const namedBy = (prefix: string): AutomationStudioActivityControlReader => (parameters) => ({ names: [`${prefix} ${String((parameters as { control?: { words?: unknown } } | undefined)?.control?.words)}`], kinds: [] });

type Prepared = { run(): Promise<{ status: string; runId: string }>; projectId: string; dispatched: string[] };

/** A service with one domain and one Flow, whose press waits on `hold` while it runs, so another run can be in flight beside it. */
async function prepared(name: string, activityControlReader: AutomationStudioActivityControlReader | undefined, hold: () => Promise<void> = async () => undefined): Promise<Prepared> {
  const dispatched: string[] = [];
  const io = new IoRegistry();
  io.registerOutput("example", {
    definition: { id: "press", title: "Press" },
    mode: "request",
    dispatch: async (request) => {
      dispatched.push(String((automationStudioDomainReadings()?.activityControlReader?.({ control: { words: "seen in dispatch" } })?.names ?? ["none"])[0]));
      await hold();
      return { ok: true, domainId: "example", outputId: request.outputId, payload: {} };
    }
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
  const service = new AutomationStudioService({ dataDir: path.join(tempRoot, name) }).bindIoRuntime(io, "example").bindNativeNodeRuntime(native);
  services.add(service);
  const project = await service.createProject({ name: `Control hook ${name}`, domainId: "example" });
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
  return { run: () => service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId }), projectId: project.id, dispatched };
}

/** The titles a run's press step started under, by the project it belongs to. */
const titlesOf = (projectId: string): string[] => seen.flatMap((event) => event.subject.projectId === projectId && event.detail?.ref === "press" && event.detail.status === "started" ? [event.detail.title] : []);

describe("the activity hook through the service", () => {
  it("names the control a run's step carries by the bound domain's reader", { timeout: 120_000 }, async () => {
    const one = await prepared("one", namedBy("the domain's"));
    expect((await one.run()).status).toBe("succeeded");
    expect(titlesOf(one.projectId)).toEqual(["Clicking “the domain's Add to basket”"]);
  });

  it("says the verb alone for a domain whose bundle has none", { timeout: 120_000 }, async () => {
    const one = await prepared("one", undefined);
    expect((await one.run()).status).toBe("succeeded");
    expect(titlesOf(one.projectId)).toEqual(["Clicking on the page"]);
  });
});

// The question asked of this design: can one run ever read another run's or another
// domain's reader? Each case below is a way it could have.
describe("two runs in one process", () => {
  it("each read their own domain's reader, in flight at the same time", { timeout: 120_000 }, async () => {
    // Neither press answers until both are in flight, so the two runs truly overlap on one event loop.
    let arrive: () => void = () => undefined;
    const bothIn = new Promise<void>((resolve) => { arrive = resolve; });
    let arrived = 0;
    const hold = async (): Promise<void> => {
      arrived += 1;
      if (arrived === 2) arrive();
      await bothIn;
    };
    const first = await prepared("first", namedBy("first"), hold);
    const second = await prepared("second", namedBy("second"), hold);
    const [ranFirst, ranSecond] = await Promise.all([first.run(), second.run()]);
    expect([ranFirst.status, ranSecond.status]).toEqual(["succeeded", "succeeded"]);
    expect(arrived).toBe(2);
    expect(titlesOf(first.projectId)).toEqual(["Clicking “first Add to basket”"]);
    expect(titlesOf(second.projectId)).toEqual(["Clicking “second Add to basket”"]);
    // Deep in each run's own dispatch, after the overlap began.
    expect(first.dispatched).toEqual(["first seen in dispatch"]);
    expect(second.dispatched).toEqual(["second seen in dispatch"]);
  });

  it("do not leak into a run of a domain with no reader, in flight beside them", { timeout: 120_000 }, async () => {
    const reading = await prepared("reading", namedBy("reading"));
    const none = await prepared("none", undefined);
    await Promise.all([reading.run(), none.run()]);
    expect(titlesOf(reading.projectId)).toEqual(["Clicking “reading Add to basket”"]);
    expect(titlesOf(none.projectId)).toEqual(["Clicking on the page"]);
    expect(none.dispatched).toEqual(["none"]);
  });

  it("do not leak into a run started from inside one: it reads its own domain's, or none", { timeout: 120_000 }, async () => {
    const own = await prepared("own", namedBy("own"));
    const none = await prepared("none", undefined);
    await runWithAutomationStudioDomainReadings({ activityControlReader: namedBy("the outer run's") }, async () => {
      await own.run();
      await none.run();
      // The outer work's own readings are as they were.
      expect(automationStudioDomainReadings()?.activityControlReader?.({ control: { words: "x" } })?.names[0]).toBe("the outer run's x");
    });
    expect(titlesOf(own.projectId)).toEqual(["Clicking “own Add to basket”"]);
    expect(titlesOf(none.projectId)).toEqual(["Clicking on the page"]);
    expect(none.dispatched).toEqual(["none"]);
  });
});
