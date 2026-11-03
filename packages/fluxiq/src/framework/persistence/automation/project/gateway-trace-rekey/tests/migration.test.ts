// @fluxiq-test-group real-sql
// t745 u3b: a project whose traces were written before it had a protection is
// converted to the keyed forms the first time a protected store opens. Every
// event ends chunked under the current key (no inline or object row is left),
// no old-form chunk or use row is left, artifacts are keyed and sealed,
// manifests sealed, the legacy event object and the unsealed artifact objects
// are gone with their files, and every read gives exactly what it gave before.
// Afterwards no plain SHA-256 of a pre-migration chunk, body or artifact, and
// no marker of the plaintext, is in any file under the project directory, with
// the store still open (the scrub vacuumed the database and truncated the WAL) and
// after it closes. A second
// protected open changes nothing.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hostProtection, projectKeyring } from "../../gateway-trace/tests/keyed-trace-support.ts";
import { expectKeyedEndState, fileExists, filesUnder, formRows, needlesFound, objectRows } from "./keyed-end-state.ts";
import { LEGACY_TRACE, MigratedProject, PLAIN_TRACE, readProject } from "./migrated-project.ts";

let rootDir: string;
let project: MigratedProject | undefined;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-trace-rekey-test-"));
});

afterEach(async () => {
  await project?.closePool();
  project = undefined;
  await rm(rootDir, { recursive: true, force: true });
});

describe("rekeying a project's traces at its first protected open", () => {
  it("converts every old form, keeps every read exact, and leaves no plain digest or plaintext in any file", async () => {
    const created = await MigratedProject.create(rootDir, "project.trace-rekey", "one");
    project = created.project;
    const oldObjects = await objectRows(project);
    expect(oldObjects).toHaveLength(3);
    const oldForms = await project.rows<{ inline: number; object: number; chunked: number }>(
      "select sum(event_json is not null) as inline, sum(event_object_id is not null) as object, sum(event_chunk_digests is not null) as chunked from client_gateway_trace_events"
    );
    // Each trace's small events (its artifacts' events among them) inline, the 0030 large event in an object, the plain large event chunked.
    expect(oldForms).toEqual([{ inline: 4, object: 1, chunked: 1 }]);
    expect(project.oldChunkDigests.length).toBeGreaterThan(20);

    const key = hostProtection(7);
    const store = await project.open({ protection: key });
    try {
      expect(store.rekey).toMatchObject({
        events: { converted: 6, skipped: 0, objectsRemoved: 1 },
        artifacts: { rekeyed: 2, sealed: 2, skipped: 0, objectsRemoved: 2 },
        manifests: { sealed: 2, skipped: 0 },
        skipped: [],
        complete: true,
        scrub: { status: "done", checkpoint: { busy: 0 } }
      });
      expect(store.rekey!.chunks.chunksDeleted).toBe(project.oldChunkDigests.length);
      expect(await readProject(store)).toEqual(created.before);
      const measures = [await store.measureTrace(LEGACY_TRACE), await store.measureTrace(PLAIN_TRACE)];
      expect(measures.map((measure) => [measure.inlineEvents, measure.objectEvents, measure.chunkedEvents])).toEqual([[0, 0, 2], [0, 0, 4]]);

      // With the store still open: the WAL was truncated, so nothing old is in it or the database.
      expect(needlesFound(await filesUnder(project.directory), project.needles())).toEqual([]);
    } finally {
      await store.close();
    }

    const keyring = await projectKeyring(project.databasePool, project.projectId, key);
    expect(store.rekey!.keyId).toBe(keyring.currentKeyId);
    await expectKeyedEndState(project, keyring.currentKeyId);
    for (const object of oldObjects) {
      expect(await project.rows("select object_id from objects where object_id = ?", [object.object_id])).toEqual([]);
      expect(await fileExists(path.join(rootDir, object.relative_path))).toBe(false);
    }

    await project.restartPool();
    const files = await filesUnder(project.directory);
    expect(files.some((file) => file.name.endsWith("project.sqlite"))).toBe(true);
    expect(needlesFound(files, project.needles())).toEqual([]);
  });

  it("is a no-op on the next protected open", async () => {
    const created = await MigratedProject.create(rootDir, "project.trace-rekey", "two");
    project = created.project;
    const key = hostProtection(7);
    await (await project.open({ protection: key })).close();
    const converted = await formRows(project);

    const again = await project.open({ protection: key });
    try {
      expect(again.rekey).toMatchObject({
        events: { converted: 0, skipped: 0, objectsRemoved: 0 },
        chunks: { chunksDeleted: 0, usesDeleted: 0 },
        artifacts: { rekeyed: 0, sealed: 0, skipped: 0, objectsRemoved: 0 },
        manifests: { sealed: 0, skipped: 0 },
        batches: 0,
        complete: true,
        scrub: { status: "not-requested" }
      });
      expect(await readProject(again)).toEqual(created.before);
    } finally {
      await again.close();
    }
    expect(await formRows(project)).toEqual(converted);
  });

  it("leaves a store without protection alone", async () => {
    const created = await MigratedProject.create(rootDir, "project.trace-rekey", "three");
    project = created.project;
    const before = await formRows(project);
    const plain = await project.open();
    try {
      expect(plain.rekey).toBeUndefined();
      expect(await readProject(plain)).toEqual(created.before);
    } finally {
      await plain.close();
    }
    expect(await formRows(project)).toEqual(before);
  });
});
