// @fluxiq-test-group real-sql
// t745 u3b: after an address key rotation the next protected open rekeys every
// row under the retired key to the new one (events re-cut, the retired key's
// chunks and uses deleted, artifact digests rekeyed) and every read stays
// exact. Two projects with the same content, even under the same host key,
// convert independently and share no chunk digest.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rotateAutomationStudioContentAddressKey } from "../../content-address/index.ts";
import { hostProtection, projectKeyring } from "../../gateway-trace/tests/keyed-trace-support.ts";
import { expectKeyedEndState, filesUnder, formRows, needlesFound } from "./keyed-end-state.ts";
import { MigratedProject, readProject } from "./migrated-project.ts";

let rootDir: string;
const projects: MigratedProject[] = [];

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-trace-rekey-test-"));
});

afterEach(async () => {
  for (const project of projects.splice(0)) await project.closePool();
  await rm(rootDir, { recursive: true, force: true });
});

async function chunkDigests(project: MigratedProject): Promise<string[]> {
  return (await project.rows<{ digest: Buffer }>("select digest from client_gateway_trace_chunks")).map((row) => row.digest.toString("hex"));
}

describe("rekeying after a key rotation, and across projects", () => {
  it("moves every keyed row to the new key on the next protected open", async () => {
    const created = await MigratedProject.create(rootDir, "project.trace-rekey", "rotate");
    const project = created.project;
    projects.push(project);
    const key = hostProtection(7);
    await (await project.open({ protection: key })).close();
    const first = (await projectKeyring(project.databasePool, project.projectId, key)).currentKeyId;
    const firstChunks = await chunkDigests(project);

    const lease = await project.databasePool.acquire(project.projectId);
    let second: string;
    try {
      second = (await rotateAutomationStudioContentAddressKey({ database: lease.database, projectId: project.projectId, protection: key })).keyId;
    } finally {
      await lease.release();
    }
    expect(second).not.toBe(first);

    const store = await project.open({ protection: key });
    try {
      expect(store.rekey).toMatchObject({
        keyId: second,
        events: { converted: 6, skipped: 0, objectsRemoved: 0 },
        chunks: { chunksDeleted: firstChunks.length, usesDeleted: firstChunks.length },
        artifacts: { rekeyed: 2, sealed: 0, skipped: 0 },
        manifests: { sealed: 0, skipped: 0 },
        complete: true,
        skipped: []
      });
      expect(await readProject(store)).toEqual(created.before);
    } finally {
      await store.close();
    }
    await expectKeyedEndState(project, second);
    expect((await chunkDigests(project)).filter((digest) => firstChunks.includes(digest))).toEqual([]);
  });

  it("keeps two projects apart: each converts at its own open, under its own key", async () => {
    const one = await MigratedProject.create(rootDir, "project.trace-rekey-one", "same");
    const two = await MigratedProject.create(rootDir, "project.trace-rekey-two", "same");
    projects.push(one.project, two.project);
    const key = hostProtection(7);
    const twoBefore = await formRows(two.project);

    const storeOne = await one.project.open({ protection: key });
    try {
      expect(storeOne.rekey?.complete).toBe(true);
      expect(await readProject(storeOne)).toEqual(one.before);
    } finally {
      await storeOne.close();
    }
    expect(await formRows(two.project)).toEqual(twoBefore);

    const storeTwo = await two.project.open({ protection: key });
    try {
      expect(storeTwo.rekey?.complete).toBe(true);
      expect(await readProject(storeTwo)).toEqual(two.before);
    } finally {
      await storeTwo.close();
    }
    const keyOne = (await projectKeyring(one.project.databasePool, one.project.projectId, key)).currentKeyId;
    const keyTwo = (await projectKeyring(two.project.databasePool, two.project.projectId, key)).currentKeyId;
    expect(keyOne).not.toBe(keyTwo);
    await expectKeyedEndState(one.project, keyOne);
    await expectKeyedEndState(two.project, keyTwo);
    const digestsTwo = await chunkDigests(two.project);
    expect((await chunkDigests(one.project)).filter((digest) => digestsTwo.includes(digest))).toEqual([]);
    for (const project of [one.project, two.project]) {
      await project.restartPool();
      expect(needlesFound(await filesUnder(project.directory), project.needles())).toEqual([]);
    }
  });
});
