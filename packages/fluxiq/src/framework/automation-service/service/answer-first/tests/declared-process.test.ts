// @fluxiq-test-group real-sql
// A read's declared `process` shapes the result of that read as a saved run's would (t869, paid run
// `run-mw37vz9n-a77a02c2`: the model declared a sort on every read of a saved list and Core ignored it
// on a read by hand). Through the real service: what the judge was shown and what the person got are the
// same rows, in the order the read asked for, and the stored rows stay as the read returned them.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { complete, fakeLibrary, READ_LOANS, runNode, scriptedAttempt } from "./fake-library.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const NAMES = ["Atlas of Rivers", "Birds of the Coast", "Clockmaking"];
const declared = (process: JsonObject) => runNode("read", READ_LOANS, { recordOutput: { datasetId: "loans", process } });

async function answered(process: JsonObject | undefined) {
  const attempt = await scriptedAttempt({ library: fakeLibrary(), script: [process ? declared(process) : runNode("read", READ_LOANS, {}), complete("Listed.")] }, cleanups);
  if (attempt.answered.status !== "answered") throw new Error(`expected an answer, got ${attempt.answered.status}`);
  const judges = attempt.requests.filter((request) => request.taskKind === "loop_verification");
  const shown = judges.length ? /"sampleRows":(\[.*?\])/u.exec(JSON.stringify(judges.at(-1)!.context)) : null;
  return { result: attempt.answered.result, judged: shown ? (JSON.parse(shown[1]!) as JsonObject[]).map((row) => row.title) : [] };
}

describe("a read's own declared process", () => {
  it("a declared sort orders the result, for the judge and the person alike", async () => {
    const { result, judged } = await answered({ sort: [{ field: "title", order: "desc" }] });
    const expected = [...NAMES].reverse();
    expect(result?.rows?.previewRows?.map((row) => row.title)).toEqual(expected);
    expect(judged).toEqual(expected);
  });

  it("a declared where and limit shape it too", async () => {
    const { result, judged } = await answered({ sort: [{ field: "title", order: "desc" }], limit: 2 });
    expect(result?.rows?.previewRows?.map((row) => row.title)).toEqual(["Clockmaking", "Birds of the Coast"]);
    expect(result?.rows?.totalRows).toBe(2);
    expect(judged).toEqual(["Clockmaking", "Birds of the Coast"]);
  });

  it("a read declaring none, or one the contract does not accept, keeps the read's order", async () => {
    expect((await answered(undefined)).result?.rows?.previewRows?.map((row) => row.title)).toEqual(NAMES);
    expect((await answered({ sort: [{ field: "no_such_column", order: "desc" }] })).result?.rows?.previewRows?.map((row) => row.title)).toEqual(NAMES);
  });

  it("a later read of the same list declaring another sort wins, though the store keeps its first processing", async () => {
    const sorted = (id: string, order: string) => runNode(id, READ_LOANS, { shape: id, recordOutput: { datasetId: "loans", process: { sort: [{ field: "title", order }] } } });
    const attempt = await scriptedAttempt({ library: fakeLibrary(), script: [sorted("one", "asc"), sorted("two", "desc"), complete("Listed.")] }, cleanups);
    if (attempt.answered.status !== "answered") throw new Error(`expected an answer, got ${attempt.answered.status}`);
    expect(attempt.answered.result?.rows?.previewRows?.map((row) => row.title)).toEqual([...NAMES].reverse());
    expect(attempt.answered.attempt.status).toBe("achieved");
  });
});
