// Source tests T11 and T14 over the persisted store. T11: a captured artifact
// stays readable after its live source is gone and survives the content sweep,
// and once its content object is removed the completeness evaluator reports it
// missing. T14: truncated rows, a sequence gap, a removed artifact or an
// unclosed manifest make the trace incomplete, never complete.
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceCompleteness, ClientGatewayTraceStore } from "../../../../../../client-gateway/trace/index.ts";
import { evaluateClientGatewayTraceCompleteness } from "../../../../../../client-gateway/trace/index.ts";
import { TRACE_ID, artifactInput, correlation, newRecorder, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { AutomationStudioProjectContentStore } from "../../content-store.ts";
import { SqliteTraceFixture } from "./sqlite-trace-fixture.ts";

let fixture: SqliteTraceFixture;

beforeEach(async () => {
  fixture = await SqliteTraceFixture.create();
});

afterEach(async () => {
  await fixture.dispose();
});

async function evaluate(store: ClientGatewayTraceStore): Promise<ClientGatewayTraceCompleteness> {
  const manifest = await store.readManifest(TRACE_ID);
  if (manifest === undefined) throw new Error("the trace has no manifest");
  const events = await store.readEventRange(TRACE_ID, 1, Number.MAX_SAFE_INTEGER);
  const availableArtifacts = await store.listArtifacts(TRACE_ID);
  return evaluateClientGatewayTraceCompleteness({ manifest, events, availableArtifacts, compatibility: { status: "compatible" }, recorderActive: false });
}

function codes(completeness: ClientGatewayTraceCompleteness): string[] {
  return completeness.issues.map((issue) => issue.code);
}

/** Four events and one artifact at sequence 5, closed: complete when nothing is damaged. */
async function recordClosedTrace(source: Uint8Array) {
  const { recorder } = newRecorder({ store: fixture.store });
  recorder.record(textEvent('{"n":1}', { correlation: correlation({ commandId: "cmd-1" }) }));
  recorder.record(textEvent('{"n":2}'));
  recorder.record(textEvent('{"n":3}'));
  recorder.record(textEvent('{"n":4}'));
  recorder.recordArtifact(artifactInput(source));
  return recorder.close({ terminationReason: "completed", terminationDetail: null });
}

async function contentPathOf(artifactId: string): Promise<string> {
  const [row] = await fixture.rows<{ relative_path: string }>(
    "select objects.relative_path from client_gateway_trace_artifacts join objects on objects.object_id = client_gateway_trace_artifacts.object_id where trace_id = ? and artifact_id = ?",
    [TRACE_ID, artifactId]
  );
  if (row === undefined) throw new Error(`artifact ${artifactId} has no content object`);
  return path.join(fixture.rootDir, row.relative_path);
}

describe("T11: captured artifacts outlive their live source", () => {
  it("reads an artifact back after its source file is deleted and the captured buffer is overwritten", async () => {
    const sourcePath = path.join(fixture.rootDir, "live-screenshot.png");
    await writeFile(sourcePath, Buffer.from([9, 8, 7, 6]));
    const source = new Uint8Array(await readFile(sourcePath));
    const manifest = await recordClosedTrace(source);
    await rm(sourcePath);
    source.fill(0);
    const reopened = await fixture.reopen();
    expect([...(await reopened.readArtifact(TRACE_ID, manifest.artifacts[0]!.id))!]).toEqual([9, 8, 7, 6]);
    expect((await evaluate(reopened)).status).toBe("complete");
  });

  it("is pinned against the content sweep", async () => {
    const manifest = await recordClosedTrace(new Uint8Array([5, 5, 5]));
    const content = await AutomationStudioProjectContentStore.open({ pool: fixture.databasePool, projectId: SqliteTraceFixture.projectId });
    try {
      expect((await content.sweepUnreferencedObjects()).deleted).toEqual([]);
    } finally {
      await content.close();
    }
    expect([...(await fixture.store.readArtifact(TRACE_ID, manifest.artifacts[0]!.id))!]).toEqual([5, 5, 5]);
  });

  it("is reported missing, never complete, once its content object is removed", async () => {
    const manifest = await recordClosedTrace(new Uint8Array([4, 4]));
    const artifactId = manifest.artifacts[0]!.id;
    await rm(await contentPathOf(artifactId));
    expect(await fixture.store.readArtifact(TRACE_ID, artifactId)).toBeUndefined();
    expect(await fixture.store.listArtifacts(TRACE_ID)).toEqual([]);
    const completeness = await evaluate(fixture.store);
    expect(completeness.status).toBe("incomplete");
    expect(completeness.issues).toContainEqual(expect.objectContaining({ code: "missing_artifact", artifactId }));
  });

  it("is reported missing once its content object's row is gone", async () => {
    const manifest = await recordClosedTrace(new Uint8Array([3, 3]));
    const artifactId = manifest.artifacts[0]!.id;
    await fixture.sql("delete from object_references where owner_kind = 'client_gateway_trace'");
    await fixture.sql("delete from objects");
    expect(await fixture.store.readArtifact(TRACE_ID, artifactId)).toBeUndefined();
    expect(codes(await evaluate(fixture.store))).toContain("missing_artifact");
  });
});

describe("T14: damaged traces are incomplete, never complete", () => {
  it("evaluates an undamaged trace as complete", async () => {
    await recordClosedTrace(new Uint8Array([1]));
    expect(await evaluate(fixture.store)).toMatchObject({ status: "complete", issues: [] });
  });

  it("reports truncated rows", async () => {
    await recordClosedTrace(new Uint8Array([1]));
    await fixture.sql("delete from client_gateway_trace_events where trace_id = ? and sequence > 2", [TRACE_ID]);
    const completeness = await evaluate(fixture.store);
    expect(completeness.status).toBe("incomplete");
    expect(completeness.issues).toContainEqual(expect.objectContaining({ code: "truncated", range: { from: 3, to: 5 } }));
  });

  it("reports a sequence gap", async () => {
    await recordClosedTrace(new Uint8Array([1]));
    await fixture.sql("delete from client_gateway_trace_events where trace_id = ? and sequence = 2", [TRACE_ID]);
    const completeness = await evaluate(fixture.store);
    expect(completeness.status).toBe("incomplete");
    expect(completeness.issues).toContainEqual(expect.objectContaining({ code: "sequence_gap", range: { from: 2, to: 2 } }));
  });

  it("reports an artifact whose row was removed", async () => {
    const manifest = await recordClosedTrace(new Uint8Array([1]));
    await fixture.sql("delete from client_gateway_trace_artifacts where trace_id = ?", [TRACE_ID]);
    const completeness = await evaluate(fixture.store);
    expect(completeness.status).toBe("incomplete");
    expect(completeness.issues).toContainEqual(expect.objectContaining({ code: "missing_artifact", artifactId: manifest.artifacts[0]!.id }));
  });

  it("reports a trace that was flushed and never closed as truncated", async () => {
    const { recorder } = newRecorder({ store: fixture.store });
    recorder.record(textEvent('{"n":1}'));
    await recorder.flush();
    const completeness = await evaluate(await fixture.reopen());
    expect(completeness.status).toBe("incomplete");
    expect(codes(completeness)).toContain("truncated");
  });
});
