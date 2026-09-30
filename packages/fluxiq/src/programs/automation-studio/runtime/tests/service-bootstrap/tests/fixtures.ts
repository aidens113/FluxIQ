import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { expect } from "vitest";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioLlmModelCaller, AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { parseAutomationStudioFlowBootstrapGenerationError } from "../../../flow-bootstrap/index.ts";

export function plan() {
  return {
    schemaVersion: "0.1" as const,
    router: {
      name: "Instruction router",
      rules: [],
      fallback: { kind: "subflow" as const, targetSubflowKey: "primary" }
    },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary" as const,
      nodes: [
        { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
        { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
      ],
      edges: [{
        key: "start_end",
        source: { nodeKey: "start", portId: "next" },
        target: { nodeKey: "end", portId: "in" }
      }]
    }]
  };
}

export function mockProvider(runTask?: (request: AutomationStudioLlmTaskRequest) => Promise<unknown>): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock-production", model: "mock-bootstrap" },
    runTask: runTask ?? (async () => ({
      response: { kind: "flow_bootstrap", summary: "Build the active instruction.", plan: plan() },
      usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, estimatedCostUsd: 0.002 }
    }))
  };
}

export function permissionScopedNativeRuntime(permissions: string[]) {
  const action: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1",
    id: "domain.example.click",
    version: "1.0.0",
    label: "Click button",
    description: "Click a button in the active target.",
    category: "action",
    source: {
      kind: "importer",
      domainId: "example",
      packageId: "example.package",
      implementationKey: "example.click"
    },
    availability: { kind: "domain", domainId: "example" },
    requiredRuntimeCapabilities: ["example.actions"],
    capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "object", required: false }],
    outputs: [{ id: "success", label: "Success", valueType: "boolean" }],
    parameters: [],
    outputAction: { fixedOutputId: "example.click" },
    safety: { requiredPermissions: ["example.action"] }
  };
  return new AutomationStudioNativeNodeRuntime({
    permissions,
    runtimeCapabilities: ["example.actions"]
  }).register({
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "example.package",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [action]
  }, {
    packageId: "example.package",
    packageVersion: "1.0.0",
    implementations: {
      "example.click": () => ({
        status: "success",
        route: "success",
        outputs: { success: true }
      })
    }
  });
}

export async function blankFixture(
  instance: AutomationStudioService,
  instructionStatus: "active" | "disabled" | "archived" = "active",
  domainId?: string
) {
  const project = await instance.createProject({ name: "LLM Bootstrap Generation", ...(domainId ? { domainId } : {}) });
  const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.generated", name: "Blank Flow" });
  const now = Date.now();
  await instance.saveFlowInstruction(project.id, {
    schemaVersion: "0.1",
    instructionId: "instruction.build",
    title: "Build a primary path",
    body: "Create a deterministic Start to End Flow.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
    priority: 100,
    status: instructionStatus,
    requirement: "required",
    tags: ["generation"],
    createdAt: now,
    updatedAt: now
  });
  return { project, flow };
}

/**
 * A data directory built once per test file and copied into each case's own:
 * the same records, without paying in every case for a new project's schema
 * and its first writes. `value` is what the build returned (ids, snapshots).
 */
export type DataDirSeed<T> = { dir: string; files: string[]; value: T };

/**
 * Runs `build` against a service of its own over `dir`, then closes that
 * service, so every SQLite database in the seed is complete on disk and a copy
 * is a whole database rather than a copy of a live one.
 */
export async function seedDataDir<T>(dir: string, build: (instance: AutomationStudioService) => Promise<T>): Promise<DataDirSeed<T>> {
  const seeding = new AutomationStudioService({ dataDir: dir });
  let value: T;
  try {
    value = await build(seeding);
  } finally {
    await seeding.close();
  }
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else files.push(target);
    }
  };
  await walk(dir);
  return { dir, files, value };
}

/**
 * Copies a seed into `dataDir` before any service there has started, and
 * returns what its build returned. File by file, because `fs.cp` spends most
 * of its time on per-entry checks: about 170 ms here against 700 ms.
 */
export async function copyDataDirSeed<T>(seed: DataDirSeed<T>, dataDir: string): Promise<T> {
  const made = new Set<string>();
  for (const file of seed.files) {
    const target = path.join(dataDir, path.relative(seed.dir, file));
    const directory = path.dirname(target);
    if (!made.has(directory)) {
      await mkdir(directory, { recursive: true });
      made.add(directory);
    }
    await copyFile(file, target);
  }
  return seed.value;
}

/**
 * Blank projects in one data directory, each written by a service of its own as
 * the cases themselves did: a service indexes only the Flows of projects it has
 * loaded, so every project can hold `flow.generated`, which one service refuses.
 */
export async function blankFixturesPerService(dir: string, first: AutomationStudioService, count: number, ...variant: [status?: "active" | "disabled" | "archived", domainId?: string]) {
  const fixtures = [await blankFixture(first, ...variant)];
  while (fixtures.length < count) {
    const other = new AutomationStudioService({ dataDir: dir });
    try {
      fixtures.push(await blankFixture(other, ...variant));
    } finally {
      await other.close();
    }
  }
  return fixtures;
}

/** The person a build is made for. Not an authorization: nothing is issued, held or revoked. */
export function caller(): AutomationStudioLlmModelCaller {
  return { actorUserId: "user.test", actorSessionId: "session.test" };
}

export async function expectNoTopology(instance: AutomationStudioService, projectId: string, flowId: string) {
  await expect(instance.getFlowRouter(projectId, flowId)).resolves.toBeNull();
  await expect(instance.listFlowSubflowSummaries({ projectId, flowId, limit: 10, offset: 0 }))
    .resolves.toMatchObject({ total: 0 });
}

export async function rejectedGenerationDiagnostic(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected Flow Bootstrap generation to reject.");
  } catch (error) {
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
    expect(diagnostic).not.toBeNull();
    expect((error as Error).message).toBe("Flow Bootstrap generation failed (" + diagnostic!.code + ").");
    return diagnostic!;
  }
}

export function successfulHarnessResult(buildPlan: unknown = plan()) {
  return {
    ok: true,
    request: { requestId: "request.phase", estimatedInputTokens: 321 },
    response: { kind: "flow_bootstrap", summary: "Build the active instruction.", plan: buildPlan },
    provider: { provider: "mock-production", model: "mock-bootstrap" },
    usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, estimatedCostUsd: 0.002 },
    diagnostics: []
  };
}
