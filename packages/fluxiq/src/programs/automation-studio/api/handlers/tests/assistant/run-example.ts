// What the run-endpoint assistant suites share: a disposable service with a
// project, a Flow that may run, one started run, and the registry over them.

import { vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../api-contracts/automation.ts";
import { registerAutomationStudioApi } from "../../index.ts";
import { createCacheApiTestService } from "../test-service.ts";
import { assistantTestActor, expectExampleAccepted } from "./assistant-example.ts";

/** A project, a Flow with an active instruction, and a run started on it. */
export async function createRunExample() {
  const { service, cleanup } = await createCacheApiTestService();
  const project = await service.createProject({ name: "Assistant runs" });
  const flow = await service.createFlow({ projectId: project.id, name: "To run" });
  // Deleting asks for a PIN, which the assistant gets from a press the page makes; here a stub grants it.
  const registry = new GlobalProgramApiRegistry({ identityAccess: { authorizeSessionPin: vi.fn().mockResolvedValue({ authorized: true }) } as any });
  registerAutomationStudioApi(registry, service);
  const ids = { projectId: project.id, flowId: flow.flowId };
  // A Flow runs only once it has an active instruction.
  await expectExampleAccepted(registry, AUTOMATION_STUDIO_ENDPOINTS.saveFlowInstruction, { ...ids, title: "Be brief", body: "Keep every message short." });
  const session = await service.startRuntimeSession(ids);
  return { service, cleanup, registry, ...ids, runId: session.runId };
}

/**
 * Calls `endpoint` with `example` after checking its declared input accepts it, and returns the response
 * unjudged: for an endpoint whose example names something that does not exist, where the handler's own
 * refusal of it, not a payload refusal, is what a test reads.
 */
export async function callAcceptedExample(registry: GlobalProgramApiRegistry, endpoint: string, example: Record<string, unknown>) {
  const declared = registry.endpoints().find((entry) => entry.programId === "automation-studio" && entry.endpoint === endpoint)?.assistant;
  if (declared === undefined || "hidden" in declared) throw new Error(`${endpoint} is not exposed to the assistant.`);
  const read = declared.input.read(example);
  if (!read.ok) throw new Error(`${endpoint} input refused its example: ${read.error}`);
  return await registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: assistantTestActor, payload: { ...example, authSessionId: assistantTestActor.sessionId } });
}
