// @fluxiq-test-group real-sql
// Lane T P3-E2: a trace the host's wiring persists is sealed with the
// protection the service's own content stores use, read from the same place
// (`reusableLlmContextContentProtection`, bound by the framework after the
// service is built). No event text or artifact byte reaches the project's
// files as plaintext, and the trace reads back exactly through the wiring.
// With no protection configured, traces are stored as before.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { artifactInput, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { AutomationStudioAesGcmProjectContentProtection, AutomationStudioProjectDatabasePool, AutomationStudioProjectGatewayTraceStore } from "../../../../storage/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import type { AutomationStudioGatewayTraceEpisodes } from "../../index.ts";
import { AutomationStudioGatewayTraceProjectStore, AutomationStudioGatewayTraceServicePools, createAutomationStudioGatewayTraceHost } from "../index.ts";
import type { AutomationStudioGatewayTraceHost } from "../types.ts";

const PROJECT = "project.host-protection";
const TRACE = "trace.host-protection";
const SMALL_MARKER = "MARKER-host-small-91c2e0";
const LARGE_MARKER = "MARKER-host-large-4ab7d3";
const ARTIFACT_MARKER = "MARKER-host-artifact-e6f015";

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function protection(): AutomationStudioAesGcmProjectContentProtection {
  return new AutomationStudioAesGcmProjectContentProtection(() => ({ keyId: "key.host", key: Buffer.alloc(32, 11) }));
}

/** A service over a temporary data directory and the host's trace wiring over its pool, as `programs/_shared/runtime.ts` builds them. */
async function servedHost() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-gateway-trace-host-protection-"));
  const service = new AutomationStudioService({ dataDir, seedFixture: false });
  const host = createAutomationStudioGatewayTraceHost({ enabled: true, pool: () => AutomationStudioGatewayTraceServicePools.of(service), options: { newTraceId: () => TRACE } });
  cleanups.push(async () => {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
  cleanups.push(() => service.close());
  cleanups.push(host.uninstall);
  const projectDirectory = path.join(dataDir, "programs", "automation-studio", "projects", PROJECT);
  return { service, host, projectDirectory, dataDir };
}

/** Records a small event, a large one (chunked) and an artifact into one episode's trace through the host's capture source. */
async function recordThroughHost(host: AutomationStudioGatewayTraceHost): Promise<void> {
  const episodes = host.episodes as AutomationStudioGatewayTraceEpisodes;
  const episode = { projectId: PROJECT, episodeId: "run.host-protection", activity: "execution" as const, context: { schema: { name: "test.host-protection", version: "1" }, value: null } };
  await episodes.run(episode, async () => {
    const sink = host.source?.current();
    if (sink === undefined) throw new Error("the host's capture source gave no open trace inside the episode");
    sink.record(textEvent(`{"small":"${SMALL_MARKER}"}`));
    const items = Array.from({ length: 2_000 }, (_, index) => `{"id":"e${index}","label":"${index === 1_000 ? LARGE_MARKER : `Item ${index}`}"}`);
    sink.record(textEvent(`{"entries":[${items.join(",")}]}`));
    sink.recordArtifact(artifactInput(new Uint8Array(Buffer.from(`${ARTIFACT_MARKER}:${"x".repeat(2_000)}`, "utf8"))));
  });
}

async function projectFiles(directory: string): Promise<Array<{ name: string; bytes: Buffer }>> {
  const files: Array<{ name: string; bytes: Buffer }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await projectFiles(name)));
    if (entry.isFile()) files.push({ name, bytes: await readFile(name) });
  }
  return files;
}

function filesHolding(files: ReadonlyArray<{ name: string; bytes: Buffer }>, marker: string): string[] {
  return files.filter((file) => file.bytes.includes(Buffer.from(marker, "utf8"))).map((file) => path.basename(file.name));
}

/** The trace as the host's wiring reads it: every event's text payload, and the artifact bytes. */
async function readThroughWiring(service: AutomationStudioService) {
  const pool = AutomationStudioGatewayTraceServicePools.of(service);
  if (pool === undefined) throw new Error("the service adopted no pool");
  const store = new AutomationStudioGatewayTraceProjectStore({ pool, projectId: PROJECT, protection: AutomationStudioGatewayTraceServicePools.protectionOf(pool) });
  const events = await store.readEventRange(TRACE, 1, Number.MAX_SAFE_INTEGER);
  const texts = events.flatMap((event) => (event.payload.encoding === "text" ? [event.payload.text] : []));
  const [artifact] = await store.listArtifacts(TRACE);
  if (artifact === undefined) throw new Error("the trace holds no artifact");
  const bytes = await store.readArtifact(TRACE, artifact.id);
  return { texts, artifact: Buffer.from(bytes ?? new Uint8Array()).toString("utf8") };
}

describe("the host's trace wiring under the service's content protection", () => {
  it("seals what it persists with the protection the service binds after it is built, and reads it back", async () => {
    const { service, host, projectDirectory } = await servedHost();
    service.bindReusableLlmContext({ enabled: true, contentProtection: protection(), selectForFreshEvidence: () => undefined });
    await recordThroughHost(host);
    const pool = AutomationStudioGatewayTraceServicePools.of(service);
    await pool?.closeIdleProject(PROJECT);

    const files = await projectFiles(projectDirectory);
    expect(files.some((file) => file.name.endsWith("project.sqlite"))).toBe(true);
    expect(filesHolding(files, SMALL_MARKER)).toEqual([]);
    expect(filesHolding(files, LARGE_MARKER)).toEqual([]);
    expect(filesHolding(files, ARTIFACT_MARKER)).toEqual([]);

    const read = await readThroughWiring(service);
    expect(read.texts.some((text) => text.includes(SMALL_MARKER))).toBe(true);
    expect(read.texts.some((text) => text.includes(LARGE_MARKER))).toBe(true);
    expect(read.artifact.startsWith(ARTIFACT_MARKER)).toBe(true);
    // Sealed with that protection, not merely written somewhere else: a store opened without it cannot read the trace.
    const bare = await AutomationStudioProjectGatewayTraceStore.open({ pool: pool!, projectId: PROJECT });
    try {
      await expect(bare.readEventRange(TRACE, 1, Number.MAX_SAFE_INTEGER)).rejects.toThrow("protected");
    } finally {
      await bare.close();
    }
  });

  it("stores traces as before when the service has no protection", async () => {
    const { service, host, projectDirectory } = await servedHost();
    await recordThroughHost(host);
    await AutomationStudioGatewayTraceServicePools.of(service)?.closeIdleProject(PROJECT);

    const files = await projectFiles(projectDirectory);
    // The scan sees plaintext where it is: the control for the sealed case above.
    expect(filesHolding(files, SMALL_MARKER).length).toBeGreaterThan(0);
    expect(filesHolding(files, ARTIFACT_MARKER).length).toBeGreaterThan(0);

    const read = await readThroughWiring(service);
    expect(read.texts.some((text) => text.includes(SMALL_MARKER))).toBe(true);
    expect(read.texts.some((text) => text.includes(LARGE_MARKER))).toBe(true);
    expect(read.artifact.startsWith(ARTIFACT_MARKER)).toBe(true);
  });

  it("refuses a pool no service adopted, rather than guessing that its traces need no seal", async () => {
    expect(AutomationStudioGatewayTraceServicePools.of({})).toBeUndefined();
    const { service: served, dataDir } = await servedHost();
    const pool = AutomationStudioGatewayTraceServicePools.of(served);
    expect(AutomationStudioGatewayTraceServicePools.protectionOf(pool!)()).toBeUndefined();
    const stray = new AutomationStudioProjectDatabasePool({ rootDir: path.join(dataDir, "stray") });
    expect(() => AutomationStudioGatewayTraceServicePools.protectionOf(stray)).toThrow("adopted by no service");
  });
});
