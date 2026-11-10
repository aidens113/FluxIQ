// The one rule for a re-read and a next page, and what the store and the sink's account then hold.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../../../../../engine/automation/contracts.ts";
import { automationStudioAnswerFirstListAfterRead, automationStudioAnswerFirstReadDatasetId, automationStudioAnswerFirstRowSink, automationStudioAnswerFirstRowTies, type AutomationStudioAnswerFirstListPage } from "../index.ts";
import { call, liveAnswer, READ_ROWS_KEY, stubStore } from "./support.ts";

const COLUMNS = ["title", "price", "state"];
const row = (title: string, price = 10, state = "Open"): JsonObject => ({ title, price, state });
const page = (...titles: string[]): AutomationStudioAnswerFirstListPage => ({ rows: titles.map((title) => row(title)) });

function after(pages: AutomationStudioAnswerFirstListPage[], read: JsonObject[], over: { place?: string; says?: "append" | "replace"; moved?: boolean } = {}) {
  const held = pages.flatMap((each) => each.rows);
  return automationStudioAnswerFirstListAfterRead({ pages, held, read, columns: COLUMNS, evidence: { ...(over.place ? { place: over.place } : {}), ...(over.says ? { says: over.says } : {}) }, moved: over.moved === true });
}

const titles = (rows: readonly JsonObject[]) => rows.map((each) => each.title);
/** Ten rows of one list, in the order its site sorts them. */
const SHELF = ["Alder bench", "Birch stool", "Cedar shelf", "Dogwood rack", "Elm crate", "Fir desk", "Gum chest", "Hazel lamp", "Ivy basket", "Juniper tray"];

describe("what a list holds after another read of it", () => {
  it("rows it has none of are the next page", () => {
    expect(after([page("Alder bench", "Birch stool")], [row("Cedar shelf")])).toMatchObject({ over: false, rows: [row("Alder bench"), row("Birch stool"), row("Cedar shelf")] });
  });

  it("the same rows in another order are a sort", () => {
    const moved = after([page("Alder bench", "Birch stool")], [row("Birch stool"), row("Alder bench")]);
    expect(moved.over).toBe(true);
    expect(titles(moved.rows)).toEqual(["Birch stool", "Alder bench"]);
  });

  it("fewer of the same rows are a filter", () => {
    expect(after([page("Alder bench", "Birch stool", "Cedar shelf")], [row("Cedar shelf")])).toMatchObject({ over: true, rows: [row("Cedar shelf")] });
  });

  it("a read taking up where the list ended is the next page of a feed", () => {
    const fed = after([page("Alder bench", "Birch stool", "Cedar shelf")], [row("Birch stool"), row("Cedar shelf"), row("Dogwood rack")]);
    expect(fed.over).toBe(false);
    expect(titles(fed.rows)).toEqual(["Alder bench", "Birch stool", "Cedar shelf", "Dogwood rack"]);
  });

  it("a known row in a mostly new page is a repeat; most rows known, out of order, with one new, is a sort of a longer list", () => {
    expect(after([page("Alder bench", "Birch stool", "Cedar shelf")], [row("Alder bench"), row("Dogwood rack"), row("Elm crate")]).over).toBe(false);
    expect(after([page("Alder bench", "Birch stool", "Cedar shelf")], [row("Cedar shelf"), row("Alder bench"), row("Dogwood rack")]).over).toBe(true);
  });

  it("the same page with a value changed carries on, in place, and other pages stand", () => {
    const changed = after([page("Alder bench", "Birch stool"), page("Cedar shelf")], [row("Alder bench", 12), row("Birch stool")]);
    expect(changed.over).toBe(false);
    expect(changed.rows).toEqual([row("Alder bench", 12), row("Birch stool"), row("Cedar shelf")]);
    expect(changed.pages).toHaveLength(2);
  });

  it("a page the call or address names and the list has not held is the next page, whatever it repeats", () => {
    const beyond = after([{ ...page("Alder bench", "Birch stool"), place: "page=1" }], [row("Alder bench"), row("Birch stool")], { place: "page=9" });
    expect(beyond.over).toBe(false);
    expect(beyond.rows).toHaveLength(2);
  });

  it("a page it has held, read again with its rows moved, starts over", () => {
    expect(after([{ ...page("Alder bench", "Birch stool"), place: "page=2" }], [row("Birch stool"), row("Alder bench")], { place: "page=2" }).over).toBe(true);
  });

  it("a first read that named no page is page 1, unless the rows share nothing, as on a site counting from nought", () => {
    expect(after([page("Alder bench", "Birch stool")], [row("Birch stool"), row("Alder bench")], { place: "page=1" }).over).toBe(true);
    expect(after([page("Alder bench")], [row("Birch stool")], { place: "page=1" }).over).toBe(false);
  });

  it("the model's `replace` starts over, unless the address says it is another page", () => {
    expect(after([page("Alder bench")], [row("Birch stool")], { says: "replace" }).over).toBe(true);
    expect(after([{ ...page("Alder bench"), place: "page=1" }], [row("Birch stool")], { says: "replace", place: "page=2" }).over).toBe(false);
  });

  it("another view starts over, and the model's `append` keeps both", () => {
    expect(after([page("Alder bench")], [row("Birch stool")], { moved: true }).over).toBe(true);
    expect(after([page("Alder bench")], [row("Birch stool")], { moved: true, says: "append" }).over).toBe(false);
  });

  // run-mwa19obz-abd5d558: two rows read off an unsorted view, then all ten read sorted under the Flow's own append.
  it("a read holding every row of a short list and more, out of its order, is the list read whole again, whatever `append` says", () => {
    const again = after([page(SHELF[8]!, SHELF[6]!)], SHELF.map((title) => row(title)), { moved: true, says: "append" });
    expect(again.over).toBe(true);
    expect(titles(again.rows)).toEqual(SHELF);
  });
});

describe("which row is which", () => {
  it("a row changed everywhere but its name is that row", () => {
    expect(automationStudioAnswerFirstRowTies([row("Alder bench", 10, "Open"), row("Birch stool", 20, "Open")], [row("Birch stool", 25, "Sold"), row("Alder bench", 10, "Open")], COLUMNS)).toEqual([1, 0]);
  });

  it("a bare number or a date ties nothing", () => {
    const columns = ["title", "due"];
    expect(automationStudioAnswerFirstRowTies([{ title: "Alder bench", due: "2030-01-01" }], [{ title: "Birch stool", due: "2030-01-01" }], columns)).toEqual([undefined]);
    expect(automationStudioAnswerFirstRowTies([row("Alder bench", 10)], [row("Birch stool", 10)], COLUMNS)).toEqual([undefined]);
  });

  it("a word two rows of a read share tells neither from the other", () => {
    expect(automationStudioAnswerFirstRowTies([row("Alder bench", 10, "Open"), row("Birch stool", 20, "Open")], [row("Cedar shelf", 30, "Open"), row("Dogwood rack", 40, "Open")], COLUMNS)).toEqual([undefined, undefined]);
  });

  it("a state each short page happens to have once is no tie against the name", () => {
    expect(automationStudioAnswerFirstRowTies([row("Alder bench", 10, "Sold"), row("Birch stool", 20, "Open")], [row("Cedar shelf", 30, "Sold"), row("Dogwood rack", 40, "Open")], COLUMNS)).toEqual([undefined, undefined]);
  });

  it("a shared address ties rows whose words changed", () => {
    const columns = ["title", "link"];
    expect(automationStudioAnswerFirstRowTies([{ title: "Alder bench", link: "/item/1" }], [{ title: "Alder bench, reduced", link: "/item/1" }], columns)).toEqual([0]);
  });

  it("two rows of one read are never one row", () => {
    expect(automationStudioAnswerFirstRowTies([row("Alder bench", 10)], [row("Alder bench", 10), row("Alder bench", 20)], COLUMNS)).toEqual([0, undefined]);
  });
});

describe("the list's identity", () => {
  const base = { toolId: "core.run_node", columns: ["title"] };
  it("does not change with how a saved step's replay went, or with the page", () => {
    const asked = { node: "read", parameters: { fields: { title: "x" } }, consequences: [] };
    const id = automationStudioAnswerFirstReadDatasetId({ ...base, value: asked });
    expect(automationStudioAnswerFirstReadDatasetId({ ...base, value: { ...asked, replay: "step", from: { location: "a" }, produced: { records: 3 } } })).toBe(id);
    expect(automationStudioAnswerFirstReadDatasetId({ ...base, value: { ...asked, page: 2 } })).toBe(id);
  });

  it("changes with the view read and the name the model gave, and a name holds across how it was asked", () => {
    const one = automationStudioAnswerFirstReadDatasetId({ ...base, value: {}, list: "a" });
    expect(automationStudioAnswerFirstReadDatasetId({ ...base, value: {}, list: "b" })).not.toBe(one);
    expect(automationStudioAnswerFirstReadDatasetId({ ...base, value: { handle: "x" }, named: "loans", list: "a" })).toBe(automationStudioAnswerFirstReadDatasetId({ ...base, value: { handle: "y" }, named: "loans", list: "b" }));
  });
});

describe("the sink over the rule", () => {
  const schema: AutomationStudioRecordBatch["schema"] = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }, { id: "price", label: "Price", valueType: "number" }, { id: "state", label: "State", valueType: "string" }] };
  const sinkOver = () => {
    const store = stubStore();
    return { store, sink: automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (batch) => store.onRecordBatch(batch) }) };
  };

  it("three rows, the same list grown and read newest first by a saved step, then sorted by hand: the sorted read, whole", async () => {
    const { store, sink } = sinkOver();
    const named = (extra: JsonObject = {}) => ({ node: "read", parameters: { recordOutput: { datasetId: "kept", writeMode: "replace" } }, consequences: [], ...extra });
    const replayed = named({ replay: "step", from: { location: "https://example.test/kept/" }, produced: { records: 3 } });
    const costing = (title: string, price: number) => row(title, price);
    const [oak, ash, elm, fir, yew] = [costing("Oak chest", 45), costing("Ash lamp", 22), costing("Elm chair", 65), costing("Fir desk", 95), costing("Yew shelf", 60)] as const;
    await sink.fromCall(call("by-hand", "core.run_node", named()), liveAnswer([oak, ash, elm], { location: "https://example.test/kept/" }));
    await sink.fromCall(call("forward", "core.run_node", replayed), liveAnswer([fir, yew, oak, ash, elm]));
    await sink.fromCall(call("sorted", "core.run_node", named()), liveAnswer([ash, oak, yew, elm, fir], { location: "https://example.test/kept/" }));
    expect(new Set(store.batches.map((batch) => batch.datasetId)).size).toBe(1);
    expect(sink.summary().rows.map((each) => each.price)).toEqual([22, 45, 60, 65, 95]);
    expect(store.batches.at(-1)).toMatchObject({ writeMode: "replace", rows: [ash, oak, yew, elm, fir] });
  });

  it("a re-read goes to the store as a replace of the list's rows, so its order is the account's", async () => {
    const { store, sink } = sinkOver();
    await sink.fromCall(call("call.1"), liveAnswer([row("Alder bench"), row("Birch stool")]));
    const stored = await sink.fromCall(call("call.2"), liveAnswer([row("Birch stool"), row("Alder bench")]));
    expect(stored).toMatchObject({ startedOver: true });
    expect(store.batches[1]).toMatchObject({ writeMode: "replace", rows: [row("Birch stool"), row("Alder bench")] });
    expect(titles(sink.summary().rows)).toEqual(["Birch stool", "Alder bench"]);
  });

  it("a row changed in place goes as a replace too, and a next page as an append", async () => {
    const { store, sink } = sinkOver();
    await sink.fromCall(call("call.1"), liveAnswer([row("Alder bench"), row("Birch stool")]));
    await sink.fromCall(call("call.2"), liveAnswer([row("Cedar shelf")]));
    expect(store.batches[1]).toMatchObject({ writeMode: "append", rows: [row("Cedar shelf")] });
    await sink.fromCall(call("call.3"), liveAnswer([row("Alder bench", 12), row("Birch stool")]));
    expect(store.batches[2]).toMatchObject({ writeMode: "replace", rows: [row("Alder bench", 12), row("Birch stool"), row("Cedar shelf")] });
  });

  it("a store that refuses a re-read changes nothing it held", async () => {
    const { store, sink } = sinkOver();
    await sink.fromCall(call("call.1"), liveAnswer([row("Alder bench"), row("Birch stool")]));
    store.refuse.on = true;
    expect(await sink.fromCall(call("call.2"), liveAnswer([row("Birch stool")]))).toMatchObject({ rows: [], failure: { code: "answer_first.rows_not_stored" } });
    expect(titles(sink.summary().rows)).toEqual(["Alder bench", "Birch stool"]);
    expect(sink.summary().fewerThanEarlier).toBeUndefined();
  });

  it("a read whose every row the schema refuses changes nothing", async () => {
    const { store, sink } = sinkOver();
    await sink.fromCall(call("call.1"), liveAnswer([row("Alder bench"), row("Birch stool")]));
    await sink.fromCall(call("call.2"), liveAnswer([{ title: "Cedar shelf", price: "free", state: "Open" }]));
    expect(store.batches[1]).toMatchObject({ writeMode: "append", rows: [], invalidCount: 1 });
    expect(titles(sink.summary().rows)).toEqual(["Alder bench", "Birch stool"]);
  });

  it("a list that got shorter says how long it was, until it is that long again", async () => {
    const { sink } = sinkOver();
    await sink.fromCall(call("call.1"), liveAnswer([row("Alder bench"), row("Birch stool"), row("Cedar shelf")]));
    expect(sink.summary().fewerThanEarlier).toBeUndefined();
    await sink.fromCall(call("call.2"), liveAnswer([row("Birch stool")]));
    expect(sink.summary()).toMatchObject({ totalRows: 1, fewerThanEarlier: { earlierRows: 3 } });
    await sink.fromCall(call("call.3"), liveAnswer([row("Dogwood rack"), row("Elm crate")]));
    expect(sink.summary()).toMatchObject({ totalRows: 3 });
    expect(sink.summary().fewerThanEarlier).toBeUndefined();
  });

  it("a read after a run of the same list starts it over, keeping the run's schema and processing", async () => {
    const { store, sink } = sinkOver();
    await sink.recordBatch({ nodeId: "node.read", attemptId: "a", batchKey: "a", datasetId: "shelves", writeMode: "append", schema, rows: [row("Alder bench"), row("Birch stool")], invalidCount: 0, truncated: false });
    await sink.fromCall(call("read.again", "core.run_node", { node: "read" }), liveAnswer([row("Birch stool"), row("Alder bench")]));
    expect(store.batches[1]).toMatchObject({ datasetId: "shelves", writeMode: "replace", schema });
    expect(titles(sink.summary().rows)).toEqual(["Birch stool", "Alder bench"]);
  });

  // run-mwa19obz-abd5d558, steps 0039 and 0046: a Flow's run kept ten rows; a rerun whose sort did not go read two off the
  // unsorted list; the next rerun read all ten sorted. The judge was shown the two first, then the other eight.
  it("a run's list, then a short read of another view, then the whole list read sorted: the sorted read, in its order", async () => {
    const { store, sink } = sinkOver();
    const whole = SHELF.map((title, at) => row(title, at + 1));
    const read = { node: "read", parameters: { recordOutput: { datasetId: "shelves", writeMode: "append" } }, consequences: [] };
    await sink.recordBatch({ nodeId: "node.read", attemptId: "a", batchKey: "a", datasetId: "shelves", writeMode: "append", schema, rows: whole, invalidCount: 0, truncated: false });
    await sink.fromCall(call("rerun.1", "core.run_node", read), liveAnswer([whole[8]!, whole[6]!], { location: "https://example.test/shelves?q=wood" }));
    expect(titles(sink.summary().rows)).toEqual([SHELF[8], SHELF[6]]);
    await sink.fromCall(call("rerun.2", "core.run_node", read), liveAnswer(whole, { location: "https://example.test/shelves?q=wood&sort=price" }));
    expect(titles(sink.summary().rows)).toEqual(SHELF);
    expect(store.batches.at(-1)).toMatchObject({ datasetId: "shelves", writeMode: "replace" });
  });

  it("a read the model named otherwise never joins a run's list, however its columns fit", async () => {
    const { store, sink } = sinkOver();
    await sink.recordBatch({ nodeId: "node.read", attemptId: "a", batchKey: "a", datasetId: "shelves", writeMode: "append", schema, rows: [row("Alder bench")], invalidCount: 0, truncated: false });
    await sink.fromCall(call("read.other", "core.run_node", { node: "read", parameters: { recordOutput: { datasetId: "crates" } } }), liveAnswer([row("Cedar shelf")]));
    expect(store.batches[1]!.datasetId).not.toBe("shelves");
  });

  it("a read of another view after a run's list, sharing no row, is another list; one sharing a row is that list", async () => {
    const { store, sink } = sinkOver();
    await sink.recordBatch({ nodeId: "node.read", attemptId: "a", batchKey: "a", datasetId: "shelves", writeMode: "append", schema, rows: [row("Alder bench")], invalidCount: 0, truncated: false });
    await sink.fromCall(call("read.1", "core.run_node", { node: "read" }), liveAnswer([row("Alder bench")], { location: "https://example.test/one" }));
    await sink.fromCall(call("read.2", "core.run_node", { node: "read" }), liveAnswer([row("Cedar shelf")], { location: "https://example.test/two" }));
    expect(store.batches[1]!.datasetId).toBe("shelves");
    expect(store.batches[2]!.datasetId).not.toBe("shelves");
    await sink.fromCall(call("read.3", "core.run_node", { node: "read" }), liveAnswer([row("Alder bench", 12)], { location: "https://example.test/one?sort=price" }));
    expect(store.batches[3]!.datasetId).toBe("shelves");
  });
});
