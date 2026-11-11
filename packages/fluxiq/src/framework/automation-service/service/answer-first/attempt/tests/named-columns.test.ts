// @fluxiq-test-group real-sql
// An attempt's answer holds the columns the person named, and no others (run-mwb2kkv5-1baeee11: asked for
// three columns, the person got a fourth, a link nobody asked for). Two places must know the named columns,
// and each is handed them from the instruction: the row sink (`../run-attempt.ts`), and the round's loop
// (`../round.ts`), whose forward run sends a read again with the record output the saved Flow's assembly
// gives it. These run whole attempts through the real service. A lending library is none of the Lab's
// realistic scenarios.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { complete, fakeLibrary, fakeLibraryNodes, READ_LOANS, runNode, scriptedAttempt, type FakeLibrary } from "../../tests/fake-library.ts";
import { PERMITTED } from "../../tests/honest-attempts.ts";
import { forwardFrom, pressCardByHand } from "../../tests/library-site.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const NAMED = "List every loan on my library account, with columns title and due.";
const linkOf = (title: string) => `library://loan/${encodeURIComponent(title)}`;

async function answered(instruction: string) {
  const library = fakeLibrary();
  // Each row as the page writes it: the two columns a person might name, and a link to the loan's page.
  library.shapes = { linked: (loan) => ({ title: loan.title, due: loan.due, link: linkOf(loan.title) }) };
  const attempt = await scriptedAttempt({ library, instruction, script: [runNode("read", READ_LOANS, { shape: "linked" }), complete("Listed.")] }, cleanups);
  if (attempt.answered.status !== "answered") throw new Error(`expected an answer, got ${attempt.answered.status}`);
  const rows = attempt.answered.result?.rows;
  const judges = attempt.requests.filter((request) => request.taskKind === "loop_verification");
  const judged = judges.length ? /"sampleRows":(\[.*?\])/u.exec(JSON.stringify(judges.at(-1)!.context)) : null;
  return {
    columns: rows?.columns?.map((column) => column.id),
    preview: rows?.previewRows?.map((row) => Object.keys(row)),
    judged: judged ? (JSON.parse(judged[1]!) as JsonObject[]).map((row) => Object.keys(row)) : [],
    totalRows: rows?.totalRows
  };
}

describe("an attempt answers with the columns the person named", () => {
  it("a read that brings a link beside the named columns delivers only the named ones, to the person and the judge alike", async () => {
    const { columns, preview, judged, totalRows } = await answered(NAMED);
    expect(columns).toEqual(["title", "due"]);
    expect(totalRows).toBe(3);
    for (const keys of preview ?? []) expect(keys).not.toContain("link");
    expect(judged.length).toBeGreaterThan(0);
    for (const keys of judged) expect(keys).not.toContain("link");
  });

  it("a request that names no columns keeps every column the read brought", async () => {
    const { columns, totalRows } = await answered("List every loan on my library account.");
    expect(columns).toEqual(["title", "due", "link"]);
    expect(totalRows).toBe(3);
  });
});

/** An extraction, as a domain declares one: the fields it reads, a record-output parameter, and where its rows are. */
const READ_LIST = "domain.library.read_list";
const LIST_NODE: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: READ_LIST, version: "1.0.0", label: "Read list", description: "Read every row of a list.", category: "action",
  source: { kind: "importer", domainId: "library", packageId: "library.lists", implementationKey: READ_LIST },
  availability: { kind: "domain", domainId: "library" }, requiredRuntimeCapabilities: ["library.actions"], capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any", required: false }],
  outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "records", label: "Records", valueType: "array" }],
  parameters: [
    { id: "list", label: "List", valueType: "json", required: true },
    { id: "recordOutput", label: "Save extracted records", valueType: "json", defaultValue: null, allowStateBinding: false, ui: { control: "record-output" } }
  ],
  safety: { requiredPermissions: [] },
  metadata: { recordsPath: "read.extracted" }
};
const LIST_PARAMETERS: JsonObject = { list: { item: ".loan", fields: { title: ".title", due: ".due", link: "a@href" } } };

/** The library's answer to the list read, by hand or sent again: every loan with its link. */
function listAnswer(value: JsonObject, library: FakeLibrary): AutomationStudioLlmEvidenceToolExecutionResult | undefined {
  if (value.node !== READ_LIST) return undefined;
  const rows = library.loans.map((loan) => ({ title: loan.title, due: loan.due, link: linkOf(loan.title) }));
  const ranWith = { node: READ_LIST, parameters: (value.parameters ?? {}) as JsonObject, consequences: [] };
  return {
    kind: "llm_evidence_tool_execution", evidence: { read: { extracted: rows }, page: { heading: "Your account" } }, effectApplied: true, outputs: { records: rows },
    draft: { actionId: READ_LIST, input: value, ranWith, replay: { from: { location: "library://account" } }, proposes: true, effect: "observe" },
    ...(value.replay === "step" ? { resultCode: "core.replay.replayed" } : {})
  };
}

describe("a round's forward run sends a read again with the columns the person named", () => {
  async function forwarded(instruction: string) {
    const attempt = await scriptedAttempt({
      instruction,
      fault: (call, library) => listAnswer(call.value, library),
      before: (service) => { service.bindNativeNodeRuntime(fakeLibraryNodes().register(
        { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "library.lists", packageVersion: "1.0.0", domainId: "library", nodes: [LIST_NODE] },
        { packageId: "library.lists", packageVersion: "1.0.0", implementations: { [READ_LIST]: () => ({ status: "success" as const, route: "success", outputs: { success: true } }) } }
      )); },
      ...PERMITTED,
      // The opening look is step 1, the read by hand step 2 and the card's press step 3: the forward run sends the read again, and checks the press.
      script: [runNode("read", READ_LIST, LIST_PARAMETERS, [], { add: true }), pressCardByHand(), forwardFrom(2), complete("Listed.")]
    }, cleanups);
    if (attempt.answered.status !== "answered") throw new Error(`expected an answer, got ${attempt.answered.status}`);
    const again = attempt.library.calls.filter((call) => call.value.node === READ_LIST && call.value.replay === "step");
    const declared = again.map((call) => (((call.value.parameters as JsonObject).recordOutput as JsonObject | undefined)?.schema as { fields?: { id: string }[] } | undefined)?.fields?.map((field) => field.id));
    // The forward run's read is the hand read's step sent again: the same list, never "a list of its own" (`../../rows/row-sink.ts`, run-mwb9b59w-aa0784db).
    const replaced = JSON.stringify(attempt.requests).includes("answer_first.result_list_replaced");
    return { declared, replaced, columns: attempt.answered.result?.rows?.columns?.map((column) => column.id) };
  }

  it("declares only the named columns on the read it sends again, as the saved Flow's read does", async () => {
    const { declared, replaced, columns } = await forwarded(NAMED);
    expect(declared.length).toBeGreaterThan(0);
    for (const fields of declared) expect(fields).toEqual(["title", "due"]);
    expect(columns).toEqual(["title", "due"]);
    expect(replaced).toBe(false);
  });

  it("declares every field it reads when the request names no columns", async () => {
    const { declared, replaced } = await forwarded("List every loan on my library account.");
    expect(declared.length).toBeGreaterThan(0);
    for (const fields of declared) expect(fields).toEqual(["title", "due", "link"]);
    expect(replaced).toBe(false);
  });
});
