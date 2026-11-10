// The columns the person named are the answer's (`../row-sink.ts`, run-mwb2kkv5-1baeee11): a read of name, price,
// rating and link, asked for "columns name, price and rating", delivers those three; asked for none, nothing changes.
import type { AutomationStudioRecordProcessing, AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../../../../../engine/automation/contracts.ts";
import { automationStudioFlowBootstrapInstructionColumns } from "../../../../../../runtime/flow-authoring/bootstrap/answerability/index.ts";
import { automationStudioAnswerFirstRowSink } from "../index.ts";
import { call, liveAnswer, READ_ROWS_KEY, stubStore } from "./support.ts";

/** A request shaped as the run's: its columns named, then how each is written, with a full stop inside a price. */
const NAMED = "Find every desk lamp the shop sells for delivery that is rated 4 stars or higher, best rated first. Give me a table with columns name, price and rating, where name is the lamp's name as listed, price is the current price written like $12.97, and rating is the average star rating as a number, like 4.6.";
/** The same request with no column named. */
const UNNAMED = "Find every desk lamp the shop sells for delivery that is rated 4 stars or higher, best rated first, and list them.";

/** A read's rows: the three named columns and a link nothing asked for. */
function lamp(n: number): JsonObject {
  return { name: `Lamp ${n}`, price: `$${n}.99`, rating: `4.${n}`, link: `https://shop.example/lamp/${n}` };
}

/** `lamp(n)` as the answer shows it. */
function shown(n: number): JsonObject {
  return { name: `Lamp ${n}`, price: `$${n}.99`, rating: `4.${n}` };
}

function field(id: string, label = id): AutomationStudioRecordSchema["fields"][number] {
  return { id, label, valueType: "string" };
}

/** The schema a replayed step's derived record output declares: every field the read reads (step 0066 of the run). */
const READ_SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [field("name", "Name"), field("price", "Price"), field("rating", "Rating"), field("link", "Link")] };

/** A batch a saved Flow's run captured. */
function runBatch(attemptId: string, rows: JsonObject[], schema = READ_SCHEMA, process?: AutomationStudioRecordProcessing): AutomationStudioRecordBatch {
  return { nodeId: "s11", attemptId, batchKey: attemptId, datasetId: "lamps-d11", writeMode: "append", schema, rows, invalidCount: 0, truncated: false, ...(process ? { process } : {}) };
}

function sinkOver(instructionText: string | undefined) {
  const store = stubStore();
  const sink = automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (batch) => store.onRecordBatch(batch), ...(instructionText !== undefined ? { instructionText } : {}) });
  return { store, sink };
}

/** The processing one run batch is stored with, and the answer's columns, under `instructionText`. */
async function asked(instructionText: string, schema: AutomationStudioRecordSchema, process?: AutomationStudioRecordProcessing) {
  const { store, sink } = sinkOver(instructionText);
  const row = Object.fromEntries(schema.fields.map((each) => [each.id, `${each.id} 1`]));
  await sink.recordBatch(runBatch("run.1.pass.1", [row], schema, process));
  return { process: store.batches[0]!.process, columns: sink.summary().columns.map((column) => column.id) };
}

describe("the answer holds the columns the request names", () => {
  it("reads the request's three columns, and not the words after them", () => {
    expect([...automationStudioFlowBootstrapInstructionColumns(NAMED)]).toEqual(["name", "price", "rating"]);
  });

  it("a saved Flow's run that read name, price, rating and link delivers name, price and rating, in that order", async () => {
    const { store, sink } = sinkOver(NAMED);
    await sink.recordBatch(runBatch("run.1.pass.1", [lamp(1), lamp(2)]));
    await sink.recordBatch(runBatch("run.1.pass.2", [lamp(3)]));
    // Stored whole as collected, with the answer's columns declared, the same on every batch of the dataset.
    expect(store.batches.map((batch) => batch.process)).toEqual([{ columns: ["name", "price", "rating"] }, { columns: ["name", "price", "rating"] }]);
    expect(store.batches[0]!.rows).toEqual([lamp(1), lamp(2)]);
    const summary = sink.summary();
    expect(summary.columns).toEqual([{ id: "name", label: "Name" }, { id: "price", label: "Price" }, { id: "rating", label: "Rating" }]);
    expect(summary.rows).toEqual([shown(1), shown(2), shown(3)]);
    expect(summary.totalRows).toBe(3);
    // What the judge and the person read: the read-back, from the sink's own account where no store reader is given.
    const back = await sink.readBack();
    expect(back.columns.map((column) => column.id)).toEqual(["name", "price", "rating"]);
    expect(back.rows).toEqual([shown(1), shown(2), shown(3)]);
  });

  it("a read the model ran itself delivers the named columns too, and each read's own rows stay as read", async () => {
    const { store, sink } = sinkOver(NAMED);
    await sink.fromCall(call("call.1", "web.read", { target: "list", page: 1 }), liveAnswer([lamp(1), lamp(2)]));
    await sink.fromCall(call("call.2", "web.read", { target: "list", page: 2 }), liveAnswer([lamp(3)]));
    expect(store.batches.map((batch) => batch.process)).toEqual([{ columns: ["name", "price", "rating"] }, { columns: ["name", "price", "rating"] }]);
    expect(store.batches[0]!.schema.fields.map((each) => each.id)).toEqual(["name", "price", "rating", "link"]);
    expect(sink.summary().columns.map((column) => column.id)).toEqual(["name", "price", "rating"]);
    expect(sink.summary().rows).toEqual([shown(1), shown(2), shown(3)]);
    expect(sink.readPages()[0]!.rows).toEqual([lamp(1), lamp(2)]);
  });

  it("changes nothing when the request names no column", async () => {
    const plain = sinkOver(undefined);
    const unnamed = sinkOver(UNNAMED);
    for (const { sink } of [plain, unnamed]) {
      await sink.recordBatch(runBatch("run.1.pass.1", [lamp(1)]));
      await sink.fromCall(call("call.1"), liveAnswer([lamp(2)]));
    }
    expect(unnamed.store.batches).toEqual(plain.store.batches);
    expect(unnamed.store.batches.every((batch) => batch.process === undefined)).toBe(true);
    expect(unnamed.sink.summary()).toEqual(plain.sink.summary());
    expect(unnamed.sink.summary().columns.map((column) => column.id)).toEqual(["name", "price", "rating", "link"]);
  });

  it("never drops a column when a named one is no stored column: it may be stored under another name", async () => {
    expect(await asked("List the lamps. Give me a table with columns name, price and url.", READ_SCHEMA)).toEqual({ process: undefined, columns: ["name", "price", "rating", "link"] });
  });

  it("keeps processing that declares its own columns as it is", async () => {
    expect(await asked(NAMED, READ_SCHEMA, { columns: ["name", "link"] })).toEqual({ process: { columns: ["name", "link"] }, columns: ["name", "link"] });
  });

  it("meets a name with case and separators set aside, and keeps the person's order", async () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [field("star_rating"), field("product_name"), field("link")] };
    expect(await asked("Give me columns Product name and Star-Rating.", schema)).toEqual({ process: { columns: ["product_name", "star_rating"] }, columns: ["product_name", "star_rating"] });
  });

  it("keeps a column a declared where filters by shown, as the contract requires, and the rest of the processing", async () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [...READ_SCHEMA.fields, field("brand")] };
    const result = await asked(NAMED, schema, { where: [{ field: "link", is: "present" }], limit: 5 });
    expect(result).toEqual({ process: { where: [{ field: "link", is: "present" }], limit: 5, columns: ["name", "price", "rating", "link"] }, columns: ["name", "price", "rating", "link"] });
  });

  it("changes nothing when the named columns are already every stored column, in order", async () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: READ_SCHEMA.fields.slice(0, 3) };
    expect(await asked(NAMED, schema)).toEqual({ process: undefined, columns: ["name", "price", "rating"] });
  });

  it("closes a named list whose last item ran on with the leading words that name a stored column", async () => {
    const text = "List the lamps with columns name and price exactly as the shop shows them.";
    expect([...automationStudioFlowBootstrapInstructionColumns(text)]).toEqual([]);
    expect(await asked(text, READ_SCHEMA)).toEqual({ process: { columns: ["name", "price"] }, columns: ["name", "price"] });
  });
});
