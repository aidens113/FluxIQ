// What the save path checks against the result (lane t905, lead additions A and C): the saved Flow reads the output
// step as its answer was read (`../output-saved.ts`), and a hand-made read a paging loop already makes, with the press
// that moved the list on for it, is no step of the Flow (`../loop-copies.ts`). A cinema's seat list read in pages.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstResultLoopCopies, automationStudioAnswerFirstResultOutputSaved, automationStudioAnswerFirstResultOutputStep, automationStudioAnswerFirstResultPort, type AutomationStudioAnswerFirstResultVersion } from "../index.ts";
import { AISLE, FREE, page, SEAT_FIELDS, SEAT_REQUEST, seats, seatVersion, step } from "./support.ts";

/** A port whose step 1 read page=1 under `conditions`, and whose step 4 is the same list read the same way (folded, D2). */
function ledgerOfLoop(conditions = [FREE]) {
  const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
  port.record([page(step(1), "seats.1", seats("A", 6), { place: "page=1", version: seatVersion(conditions) })]);
  port.record([page(step(4), "seats.again", seats("B", 4), { place: "page=2", version: seatVersion(conditions) })]);
  return port;
}

describe("the saved Flow holds the output step as it reads (A)", () => {
  const saved = (version: AutomationStudioAnswerFirstResultVersion, written = version, recorded = written) => new Map([["s1", { written, recorded, saved: version }]]);

  it("a Flow whose read dropped the output step's conditions is refused", () => {
    const output = automationStudioAnswerFirstResultOutputStep(ledgerOfLoop([FREE, AISLE]).ledger());
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved({ conditions: [FREE], fields: SEAT_FIELDS }, seatVersion([FREE, AISLE])))).toMatchObject({ ok: false, code: "answer_first.output_step_version_not_saved" });
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved({ conditions: [AISLE, FREE], fields: SEAT_FIELDS }))).toEqual({ ok: true });
  });

  it("a Flow that lost a column, or holds no read of the output step, is refused; a field read in the domain's resolved form is the same column", () => {
    const output = automationStudioAnswerFirstResultOutputStep(ledgerOfLoop().ledger());
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved({ conditions: [FREE], fields: { seat: "seat label" } }, seatVersion([FREE])))).toMatchObject({ ok: false, code: "answer_first.output_step_version_not_saved" });
    expect(automationStudioAnswerFirstResultOutputSaved(output, new Map())).toMatchObject({ ok: false, code: "answer_first.output_step_not_saved" });
    const resolved = { conditions: [FREE], fields: { seat: "#seats .label", price: "#seats .price", state: "#seats .state" } };
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved(resolved, seatVersion([FREE]), resolved))).toEqual({ ok: true });
    // The folded step (step 4) is the output step too.
    expect(automationStudioAnswerFirstResultOutputSaved(output, new Map([["s4", { written: seatVersion([FREE]), recorded: seatVersion([FREE]), saved: seatVersion([FREE]) }]]))).toEqual({ ok: true });
    expect(automationStudioAnswerFirstResultOutputSaved(undefined, new Map())).toEqual({ ok: true });
  });

  it("compares both sides of a recorded predicate resolution, rejecting stale authored versions and changed executable reads", () => {
    const output = automationStudioAnswerFirstResultOutputStep(ledgerOfLoop([FREE]).ledger());
    const written = seatVersion([FREE]);
    const condition = { read: { kind: "text", selector: ".availability", required: false }, equals: "free" };
    const resolved = { conditions: [condition], fields: { seat: ".label", price: ".price", state: ".state" } };
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved(resolved, written, resolved))).toEqual({ ok: true });
    const refused = { ok: false, code: "answer_first.output_step_version_not_saved" };
    // A saved executable match is not a proof that this is the version whose rows the ledger holds.
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved(resolved, seatVersion([AISLE]), resolved))).toMatchObject(refused);
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved(resolved, { ...written, fields: { ...written.fields, state: "other-state" } }, resolved))).toMatchObject(refused);
    // Identical column names do not permit a different predicate or another field's executable read.
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved({ ...resolved, conditions: [] }, written, resolved))).toMatchObject(refused);
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved({ ...resolved, conditions: [{ ...condition, equals: "booked" }] }, written, resolved))).toMatchObject(refused);
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved({ ...resolved, fields: { ...resolved.fields, state: ".other-state" } }, written, resolved))).toMatchObject(refused);
  });

  // run-mwop7kt3: a domain may record a read in the words it was written in and resolve it again at assembly (the web
  // domain does so for every list read). The plan is then the domain's resolution of exactly the answer's read, in words
  // Core does not read: it is held when it keeps every column and condition, and the recorded read must be the answer's.
  it("holds a read recorded as written whose resolution keeps every column and condition, and no other", () => {
    const output = automationStudioAnswerFirstResultOutputStep(ledgerOfLoop([FREE]).ledger());
    const written = seatVersion([FREE]);
    const resolved = { conditions: [{ read: { kind: "text", selector: ".availability", required: false }, equals: "free" }], fields: { seat: ".label", price: ".price", state: ".state" } };
    const refused = { ok: false, code: "answer_first.output_step_version_not_saved" };
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved(resolved, written))).toEqual({ ok: true });
    // The resolution lost the condition, or a column, of the read it was made from.
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved({ ...resolved, conditions: [] }, written))).toMatchObject(refused);
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved({ ...resolved, fields: { seat: ".label", price: ".price" } }, written))).toMatchObject(refused);
    // The assembly was handed another version than the answer's: whatever it resolved to, it is another read.
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved(resolved, written, seatVersion([AISLE])))).toMatchObject(refused);
    expect(automationStudioAnswerFirstResultOutputSaved(output, saved(resolved, written, seatVersion([])))).toMatchObject(refused);
  });
});

describe("a paging loop's own work done again by hand is no step of the saved Flow (C, run-mwcncux8)", () => {
  const draftStep = (position: number, over: Partial<AutomationStudioFlowDraftStep>): AutomationStudioFlowDraftStep => ({ position, id: `d${position}`, callId: `s${position}`, iteration: position, actionId: "seats.read", input: {}, effect: "observe", proposes: true, disposition: "kept", ...over });
  const NEXT = { actionId: "seats.press", input: { target: { handle: "t7" } }, effect: "mutate" as const, control: "Next page" };
  /** Read the seats, press Next page, repeat while Next page answers; then Next page and the same read again by hand. */
  const draft = (handPress: Partial<AutomationStudioFlowDraftStep> = NEXT) => [
    draftStep(1, { routing: { kind: "repeat", through: "d2", while: "d2" } }),
    draftStep(2, NEXT),
    draftStep(3, { ...handPress, input: { target: { handle: "t31" } } }),
    draftStep(4, {}),
  ];
  const idOf = (each: AutomationStudioFlowDraftStep) => each.callId ?? each.id!;

  it("the hand-made read folded into the loop's read, and the Next page before it, are left out; the loop stays", () => {
    const steps = draft();
    const copies = automationStudioAnswerFirstResultLoopCopies(steps, ledgerOfLoop().ledger(), idOf);
    expect([...copies].map((each) => each.position).sort()).toEqual([3, 4]);
  });

  it("a press that does something else before the copy stays, and a read of another list or another way is no copy", () => {
    expect([...automationStudioAnswerFirstResultLoopCopies(draft({ ...NEXT, control: "Book seat", actionId: "seats.book" }), ledgerOfLoop().ledger(), idOf)].map((each) => each.position)).toEqual([4]);
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(1), "seats.1", seats("A", 6), { place: "page=1", version: seatVersion([FREE]) })]);
    port.record([page(step(4), "seats.again", seats("B", 4), { place: "page=2", version: seatVersion([FREE, AISLE]) })]);
    expect(automationStudioAnswerFirstResultLoopCopies(draft(), port.ledger(), idOf).size).toBe(0);
  });

  it("without a loop on the read, a folded read is not this case and stays", () => {
    const steps = draft().map((each) => {
      if (each.position !== 1) return each;
      const { routing: _routing, ...withoutLoop } = each;
      return withoutLoop;
    });
    expect(automationStudioAnswerFirstResultLoopCopies(steps, ledgerOfLoop().ledger(), idOf).size).toBe(0);
  });
});
