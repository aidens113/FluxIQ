// @fluxiq-test-group real-sql
// A saved repeat that opens each row by its own address, on later attempts (t869).
//
// The read reads three columns and the person asks for a table of two, so assembly narrows what the read
// stores to those two (`runtime/flow-authoring/bootstrap/authoring/instruction-record-columns.ts`). The
// repeat's first step opens the row by `$row.url`, which the person never named. The forward run during
// the build sends the row it read and worked; every later run of the saved Flow stopped at that step with
// `executor.parameter.unresolved_state_path`, because the For Each was handed rows without the address.
// The listing now keeps what the repeat reads, stored and not shown
// (`runtime/flow-authoring/bootstrap/script-statements/repeat/row-fields.ts`). A lending library is none
// of the Lab's realistic scenarios.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationNodeExecutionResult, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { libraryTargetNodes, type LibraryTarget } from "../../tests/fake-library-engine.ts";
import { complete, RENEW_LOAN, runNode, toolCall, type FakeLibraryFault } from "../../tests/fake-library.ts";
import { laterAttempts } from "../../tests/later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const READ_SHELF = "domain.library.read_shelf";
const OPEN_LOAN = "domain.library.open_loan";
const TASK = "Renew every loan on my library account, then give me a table of them with columns title and due.";
const PERMITTED = { permittedConsequences: ["modify_existing" as const] };
const TITLES = ["Atlas of Rivers", "Birds of the Coast", "Clockmaking", "Dune Walks"] as const;
const READ_STEP = 2;
const OPEN_STEP = 3;
const RENEW_STEP = 4;
const FIELDS = { fields: { title: "loan-title", due: "loan-due", url: "loan-link" } };
const UNRESOLVED = "executor.parameter.unresolved_state_path";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const addressOf = (title: string): string => `library://loan/${title.toLowerCase().replace(/[^a-z]+/gu, "-")}`;
const rowsOf = (target: LibraryTarget): JsonObject[] => target.library.loans.map((loan) => ({ title: loan.title, due: loan.due, url: addressOf(loan.title) }));

const definition = (id: string, label: string, over: Partial<AutomationStudioNodeDefinition>): AutomationStudioNodeDefinition => ({
  schemaVersion: "0.1", id, version: "1.0.0", label, description: `${label}.`, category: "action",
  source: { kind: "importer", domainId: "library", packageId: "library.shelf", implementationKey: id },
  availability: { kind: "domain", domainId: "library" }, requiredRuntimeCapabilities: ["library.actions"], capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [], safety: { requiredPermissions: [] },
  ...over
});

/** A read that names its columns and stores its rows, as a page's list read does, and an open by address. */
const SHELF_NODES: AutomationStudioNodeDefinition[] = [
  definition(READ_SHELF, "Read the loans", {
    outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "records", label: "Records", valueType: "array" }],
    parameters: [{ id: "list", label: "The list", valueType: "object", required: false }, { id: "recordOutput", label: "Save records", valueType: "json", allowStateBinding: false, ui: { control: "record-output" } }],
    metadata: { recordsPath: "records" }
  }),
  definition(OPEN_LOAN, "Open a loan", { parameters: [{ id: "url", label: "Address", valueType: "string", required: true }] })
];

/** The engine's door: the read writes every row it reads through its record output, the open notes its address, the press renews the row it is handed. */
function engineOf(target: LibraryTarget, opened: string[]) {
  return libraryTargetNodes(target).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "library.shelf", packageVersion: "1.0.0", domainId: "library", nodes: SHELF_NODES },
    { packageId: "library.shelf", packageVersion: "1.0.0", implementations: {
      [READ_SHELF]: ({ parameters }): AutomationNodeExecutionResult => ({ status: "success", route: "success", outputs: { success: true }, effects: [{ type: "records.write", payload: { recordOutput: parameters.recordOutput as JsonValue, records: rowsOf(target) } }] }),
      [OPEN_LOAN]: ({ parameters }): AutomationNodeExecutionResult => {
        opened.push(String(parameters.url));
        return { status: "success", route: "success", outputs: { success: true } };
      }
    } }
  );
}

/** The by-hand door for the two nodes: a read shows every column, and an open goes to the address. A press is the library's own. */
function byHand(target: LibraryTarget, opened: string[]): FakeLibraryFault {
  return ({ value }) => {
    if (value.node !== READ_SHELF && value.node !== OPEN_LOAN) return undefined;
    const parameters = (value.parameters ?? {}) as JsonObject;
    const replayed = value.replay === "step" ? { resultCode: "core.replay.replayed" } : {};
    const draft = { actionId: String(value.node), input: value, ranWith: { node: String(value.node), parameters, consequences: [] }, replay: { from: { location: "library://account" } }, proposes: true, effect: "observe" as const };
    if (value.node === READ_SHELF) {
      const rows = rowsOf(target);
      return { kind: "llm_evidence_tool_execution", evidence: { read: { extracted: rows }, page: { heading: "Your loans" } }, effectApplied: true, outputs: { records: rows }, draft, ...replayed } satisfies AutomationStudioLlmEvidenceToolExecutionResult;
    }
    opened.push(String(parameters.url));
    return { kind: "llm_evidence_tool_execution", evidence: { ok: true, pageChanged: true, page: { heading: String(parameters.url) } }, effectApplied: true, draft, ...replayed } satisfies AutomationStudioLlmEvidenceToolExecutionResult;
  };
}

/** The first attempt as the build writes it: read, open the first row by its address and renew it, make those two a repeat over the read bound to the row, run forward. */
const firstAttempt = () => ({
  instruction: TASK, ...PERMITTED,
  script: [
    runNode("read", READ_SHELF, { list: FIELDS }, [], { add: true }),
    runNode("open-first", OPEN_LOAN, { url: addressOf(TITLES[0]) }, [], { add: true }),
    runNode("renew-first", RENEW_LOAN, { title: TITLES[0] }, ["modify_existing"], { add: true }),
    { kind: "amend_draft", amendments: [
      { step: OPEN_STEP, change: "repeat", through: RENEW_STEP, over: READ_STEP },
      { step: OPEN_STEP, change: "bind", input: { url: { $row: "url" } } },
      { step: RENEW_STEP, change: "bind", input: { title: { $row: "title" } } }
    ] },
    toolCall("forward", "core.run_flow", { from: READ_STEP }),
    complete("Renewed every loan and listed them.")
  ]
});

async function stepLog(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-row-url-"));
  const before = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
  cleanups.push(async () => {
    if (before === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    else process.env.FLUXIQ_LLM_STEP_LOG_DIR = before;
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function notes(directory: string): Promise<string[]> {
  const folders = (await readdir(directory)).filter((name) => name.endsWith("-note"));
  return await Promise.all(folders.map(async (folder) => String((JSON.parse(await readFile(path.join(directory, folder, "meta.json"), "utf8")) as { line?: string }).line)));
}

async function lane() {
  const opened: string[] = [];
  const holder: { target?: LibraryTarget } = {};
  const made = await laterAttempts(cleanups, { titles: TITLES, fault: (call, library) => byHand(holder.target!, opened)(call, library) });
  holder.target = made.target;
  made.service.bindNativeNodeRuntime(engineOf(made.target, opened));
  return { ...made, opened };
}

describe("a saved repeat that opens each row by its address", () => {
  it("runs whole on the same words and on Run again: each row's page opens, nothing done is pressed again, and Run again presses each row once", async () => {
    const directory = await stepLog();
    const { attempt, target, opened, kept } = await lane();

    const first = await attempt(firstAttempt());
    expect(first.answer.attempt).toMatchObject({ status: "achieved", path: "explore", ordinal: 1 });
    expect(target.library.renewals).toEqual(Object.fromEntries(TITLES.map((title) => [title, 1])));
    // By hand and by the forward run, every row opened once.
    expect(opened).toEqual(TITLES.map(addressOf));
    const steps = (await kept(TASK))?.best?.steps ?? [];
    const open = steps.find((step) => step.actionId === OPEN_LOAN);
    expect(open?.input.parameters).toMatchObject({ url: { $state: { path: "item.url" } } });

    opened.length = 0;
    const second = await attempt({ instruction: TASK, ...PERMITTED });
    const written = await notes(directory);
    expect(written.join("\n")).not.toContain(UNRESOLVED);
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2 });
    expect(second.decisions).toEqual([]);
    // The saved Flow's own open step went to each row's own address, and no row was pressed again.
    expect(opened).toEqual(TITLES.map(addressOf));
    expect(target.presses).toEqual([]);
    expect(target.library.renewals).toEqual(Object.fromEntries(TITLES.map((title) => [title, 1])));
    // The answer is the table the person asked for: the address is stored for the repeat and not shown.
    expect(Object.keys(second.answer.result?.rows?.previewRows[0] ?? {}).sort()).toEqual(["due", "title"]);

    opened.length = 0;
    const third = await attempt({ instruction: TASK, ...PERMITTED, runAgain: true });
    expect((await notes(directory)).join("\n")).not.toContain(UNRESOLVED);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 3 });
    expect(opened).toEqual(TITLES.map(addressOf));
    expect(target.presses.map((press) => press.subject)).toEqual([...TITLES]);
    expect(target.library.renewals).toEqual(Object.fromEntries(TITLES.map((title) => [title, 2])));
  });
});

