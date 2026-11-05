// The known limit of `thin-press.test.ts` ("pressed again"), measured: each act no read could tie to a row is
// counted once and noted in the step log in plain words, and a press whose row is known is never counted.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, type AutomationStudioAttemptActCall } from "../index.ts";

const person = (name: string, action = "Accept"): JsonObject => ({ name, action });
const LIST = [person("Ada Lind"), person("Ben Okoro"), person("Cyd Marsh")];
const ACCEPT = { selector: "#list > div:nth-of-type(1) > button", element: { tag: "button", accessibleName: "Accept" } };
const press = (over: Partial<AutomationStudioAttemptActCall> = {}): AutomationStudioAttemptActCall => ({ actionId: "web.click", parameters: ACCEPT, consequences: ["modify_existing"], stage: "exploration", ...over });
const WORDS = { what: "Accepted", where: "On a list" };

let directory: string;
let before: string | undefined;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-no-row-"));
  before = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
});

afterEach(() => {
  if (before === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  else process.env.FLUXIQ_LLM_STEP_LOG_DIR = before;
  rmSync(directory, { recursive: true, force: true });
});

const lines = () => readdirSync(directory).filter((name) => name.endsWith("-note")).map((name) => (JSON.parse(readFileSync(path.join(directory, name, "meta.json"), "utf8")) as { line: string }).line);

describe("an act no read could tie to a row", () => {
  it("is counted once and noted in plain words, whatever reads follow", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([...LIST]);
    record.settled(press({ row: { action: "Accept" } }), { effectApplied: true, words: WORDS });
    expect(record.actsWithNoRow()).toBe(0);
    record.noteReadRows([...LIST]);
    record.noteReadRows([...LIST]);
    expect(record.actsWithNoRow()).toBe(1);
    expect(lines()).toEqual(["A lasting act could not be tied to a row: web.click"]);
    expect(readFileSync(path.join(directory, "index.md"), "utf8")).toContain("A lasting act could not be tied to a row: web.click");
  });

  it("is still counted by a record carried on from the one persisted, and not noted again", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([...LIST]);
    record.settled(press({ row: { action: "Accept" } }), { effectApplied: true, words: WORDS });
    record.noteReadRows([...LIST]);
    const again = new AutomationStudioAttemptActRecord({ seed: record.data() });
    again.noteReadRows([...LIST]);
    expect(again.actsWithNoRow()).toBe(1);
    expect(lines()).toHaveLength(1);
  });

  it("is no longer counted once a later read shows which row it was", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([...LIST]);
    record.settled(press({ row: { action: "Accept" } }), { effectApplied: true, words: WORDS });
    record.noteReadRows([...LIST]);
    record.noteReadRows([person("Ada Lind", "Accepted"), person("Ben Okoro"), person("Cyd Marsh")]);
    expect(record.actsWithNoRow()).toBe(0);
  });
});

describe("a press that is tied to its row", () => {
  it("by hand, as the page answers it: counted zero, nothing noted", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([...LIST]);
    record.settled(press(), { effectApplied: true, words: WORDS, actedOn: `This acted on item 1/3 (Ada Lind) only, through its "Accept"; no other item was acted on.` });
    record.noteReadRows([...LIST]);
    expect(record.actsWithNoRow()).toBe(0);
    expect(lines()).toEqual([]);
  });

  it("carried whole on its pass: counted zero", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([...LIST]);
    record.settled(press({ row: person("Ada Lind"), stage: "forward" }), { effectApplied: true, words: WORDS });
    record.noteReadRows([...LIST]);
    expect(record.actsWithNoRow()).toBe(0);
  });
});
