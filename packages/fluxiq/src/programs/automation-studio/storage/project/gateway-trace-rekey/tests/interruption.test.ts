// @fluxiq-test-group real-sql
// t745 u3b: a rekey stopped part way, by its batch limit or by a protection that
// starts failing, leaves every committed batch converted and every other row in
// its old form, all of it still reading exactly; the next protected open
// resumes and ends in the same state as an uninterrupted run. A damaged chunk
// keeps its event in the old form, counted, still failing when read, while
// every other event converts, and the next open does not loop on it.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioProjectContentProtection } from "../../content-protection.ts";
import { AutomationStudioProjectContentStore } from "../../content-store.ts";
import { digestsOf, hostProtection, projectKeyring } from "../../gateway-trace/tests/keyed-trace-support.ts";
import { expectKeyedEndState, filesUnder, needlesFound } from "./keyed-end-state.ts";
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

/** A host protection whose seal fails from the (`sealsAllowed` + 1)-th call on; opening keeps working. */
function failingProtection(inner: AutomationStudioProjectContentProtection, sealsAllowed: number): AutomationStudioProjectContentProtection {
  let seals = 0;
  return {
    providerId: inner.providerId,
    seal: async (input) => {
      seals += 1;
      if (seals > sealsAllowed) throw new Error("host key service unavailable");
      return inner.seal(input);
    },
    open: (input) => inner.open(input)
  };
}

async function keyedEvents(target: MigratedProject): Promise<number> {
  return (await target.rows<{ n: number }>("select count(*) as n from client_gateway_trace_events where event_chunk_address_key_id is not null"))[0]!.n;
}

describe("an interrupted rekey", () => {
  it("stopped by its batch limit, reads exactly in between and is finished by the next open", async () => {
    const created = await MigratedProject.create(rootDir, "project.trace-rekey", "limit");
    project = created.project;
    const key = hostProtection(7);
    const partial = await project.open({ protection: key, rekey: { batchSize: 1, maxBatches: 2 } });
    try {
      expect(partial.rekey).toMatchObject({ events: { converted: 2 }, batches: 2, complete: false, manifests: { sealed: 0 }, artifacts: { rekeyed: 0 } });
      expect(await readProject(partial)).toEqual(created.before);
    } finally {
      await partial.close();
    }
    expect(await keyedEvents(project)).toBe(2);

    const resumed = await project.open({ protection: key });
    try {
      expect(resumed.rekey).toMatchObject({ events: { converted: 4, skipped: 0 }, artifacts: { rekeyed: 2, sealed: 2 }, manifests: { sealed: 2 }, complete: true, skipped: [] });
      expect(await readProject(resumed)).toEqual(created.before);
    } finally {
      await resumed.close();
    }
    await expectKeyedEndState(project, (await projectKeyring(project.databasePool, project.projectId, key)).currentKeyId);
    await project.restartPool();
    expect(needlesFound(await filesUnder(project.directory), project.needles())).toEqual([]);
  });

  it("stopped by a protection that fails part way, keeps its committed batch and is finished by the next open", async () => {
    const created = await MigratedProject.create(rootDir, "project.trace-rekey", "failing");
    project = created.project;
    const key = hostProtection(7);
    // One seal makes the address key, the next seals the first event's one chunk; the large event's chunks then fail.
    await expect(project.open({ protection: failingProtection(key, 3), rekey: { batchSize: 1 } })).rejects.toThrow(/host key service unavailable/);
    expect(await keyedEvents(project)).toBe(1);

    const resumed = await project.open({ protection: key });
    try {
      expect(resumed.rekey).toMatchObject({ events: { converted: 5, skipped: 0 }, complete: true, skipped: [] });
      expect(await readProject(resumed)).toEqual(created.before);
    } finally {
      await resumed.close();
    }
    await expectKeyedEndState(project, (await projectKeyring(project.databasePool, project.projectId, key)).currentKeyId);
    await project.restartPool();
    expect(needlesFound(await filesUnder(project.directory), project.needles())).toEqual([]);
  });

  it("stopped between an artifact's sealed put and its row update, reuses the sealed copy on the next open", async () => {
    const created = await MigratedProject.create(rootDir, "project.trace-rekey", "crash");
    project = created.project;
    const key = hostProtection(7);
    // What a crash right after the put leaves: the sealed copy and its trace reference, the row still unsealed and plain.
    const content = await AutomationStudioProjectContentStore.open({ pool: project.databasePool, projectId: project.projectId, protection: key });
    let sealedId: string;
    try {
      const put = await content.putBytes({ content: project.artifacts[0]!, mediaType: "application/octet-stream", extension: "bin", owner: { ownerKind: "client_gateway_trace", ownerId: PLAIN_TRACE, purpose: "artifact" }, protect: true });
      sealedId = put.object.objectId;
    } finally {
      await content.close();
    }
    const store = await project.open({ protection: key });
    try {
      expect(store.rekey).toMatchObject({ artifacts: { rekeyed: 2, sealed: 2, skipped: 0, objectsRemoved: 2 }, complete: true });
      expect(await readProject(store)).toEqual(created.before);
    } finally {
      await store.close();
    }
    const rows = await project.rows<{ object_id: string }>("select object_id from client_gateway_trace_artifacts where trace_id = ? order by rowid", [PLAIN_TRACE]);
    expect(rows[0]!.object_id).toBe(sealedId);
    expect(await project.rows("select object_id from objects where object_id not in (select object_id from client_gateway_trace_artifacts)")).toEqual([]);
    await expectKeyedEndState(project, (await projectKeyring(project.databasePool, project.projectId, key)).currentKeyId);
  });

  it("leaves an event with a damaged chunk in its old form, counted and still failing, and converts the rest", async () => {
    const created = await MigratedProject.create(rootDir, "project.trace-rekey", "damaged");
    project = created.project;
    const [chunked] = await project.rows<{ sequence: number; digests: Buffer }>(
      "select sequence, event_chunk_digests as digests from client_gateway_trace_events where trace_id = ? and event_chunk_digests is not null",
      [PLAIN_TRACE]
    );
    const digests = digestsOf(chunked!.digests);
    const damaged = digests[Math.floor(digests.length / 2)]!;
    await project.sql("update client_gateway_trace_chunks set stored = zeroblob(length(stored)) where digest = ?", [damaged]);
    // The damaged event's intact chunks stay in the old form and are sealed in place: their plaintext rows must
    // not survive in the file (the seal-in-place pass requests a scrub in its own transaction).
    const intact = await project.rows<{ stored: Buffer }>(
      `select stored from client_gateway_trace_chunks where digest in (${digests.map(() => "?").join(", ")}) and digest <> ? and length(stored) >= 64`,
      [...digests, damaged]
    );
    expect(intact.length).toBeGreaterThan(0);

    const key = hostProtection(7);
    for (const attempt of [1, 2]) {
      const store = await project.open({ protection: key });
      try {
        expect(store.rekey).toMatchObject({
          events: { converted: attempt === 1 ? 5 : 0, skipped: 1 },
          skipped: [{ kind: "event", where: `${PLAIN_TRACE}#${chunked!.sequence}`, reason: "its chunks cannot be read or verified" }],
          complete: true
        });
        expect(store.rekey?.leftoverChunksSealed).toBe(attempt === 1 ? new Set(digests.map((digest) => digest.toString("hex"))).size : 0);
        expect(store.rekey?.scrub.status).toBe(attempt === 1 ? "done" : "not-requested");
        await expect(store.readEventRange(PLAIN_TRACE, chunked!.sequence, chunked!.sequence)).rejects.toThrow();
        const before = created.before.traces[PLAIN_TRACE]!.events;
        const others = (await store.readEventRange(PLAIN_TRACE, 1, chunked!.sequence - 1)).concat(await store.readEventRange(PLAIN_TRACE, chunked!.sequence + 1, Number.MAX_SAFE_INTEGER));
        expect(others.map((event) => JSON.stringify(event))).toEqual(before.filter((_, index) => index + 1 !== chunked!.sequence));
        expect((await readProject(store).catch((error: unknown) => error)) instanceof Error).toBe(true);
        expect(JSON.stringify(await store.readEventRange(LEGACY_TRACE, 1, Number.MAX_SAFE_INTEGER))).toBe(`[${created.before.traces[LEGACY_TRACE]!.events.join(",")}]`);
      } finally {
        await store.close();
      }
    }

    // Only the damaged event's chunks stay in the old form (sealed by the open), each with the trace's use of it.
    const oldChunks = await project.rows<{ digest: Buffer; sealed: number }>("select digest, encryption is not null as sealed from client_gateway_trace_chunks where address_key_id is null order by digest");
    const named = [...new Set(digests.map((digest) => digest.toString("hex")))].sort();
    expect(oldChunks.map((row) => row.digest.toString("hex"))).toEqual(named);
    expect(oldChunks.every((row) => row.sealed === 1)).toBe(true);
    const oldUses = await project.rows<{ trace_id: string }>(
      "select u.trace_id from client_gateway_trace_chunk_uses u join client_gateway_trace_chunks c on c.digest = u.digest where c.address_key_id is null"
    );
    expect(oldUses).toHaveLength(named.length);
    expect(oldUses.every((use) => use.trace_id === PLAIN_TRACE)).toBe(true);
    const oldEvents = await project.rows<{ sequence: number }>("select sequence from client_gateway_trace_events where event_chunk_address_key_id is null");
    expect(oldEvents).toEqual([{ sequence: chunked!.sequence }]);
    await project.closePool();
    const leftovers = intact.map((row, index) => ({ label: `intact chunk ${index}`, bytes: row.stored.subarray(0, 64) }));
    expect(needlesFound(await filesUnder(project.directory), leftovers)).toEqual([]);
  });
});
