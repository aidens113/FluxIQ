// A control's kind is not its words (live check r3, `run-mwaszqeh-cc316c6d`, steps 0012 to 0016).
//
// A by-hand press of "Accept" on a list's first row landed. A chat popup then opened over the list, and the next
// press, its "Close your conversation" button, was refused three times as "already done: Accept", which ended the
// attempt. Both controls' fingerprints hold `implicitRole: "button"`, and a control's words were read from every
// top-level string of its fingerprint but a structural field's, a list that named `role` and not `implicitRole`. So
// the two shared the word "button", and the page's row (the one the Accept named) plus one shared word was read as
// the same act on that row's page. The calls and answers below keep the web domain's keys as the run had them; only
// the site's words are a stand-in's.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActControlName, automationStudioAttemptActGate, type AutomationStudioAttemptActForeseen } from "../index.ts";

type Call = { callId: string; toolId: string; value: JsonObject };
type Answer = AutomationStudioLlmEvidenceToolExecutionResult;

const CLICK = "web.output.dom-click";
const LIST = "web.output.dom-extract_list";
const LIST_ADDRESS = "http://127.0.0.1:57830/scenarios/club/members/requests/";
const ROWS: JsonObject[] = [
  { name: "Ines Varga", message: "Hello Sam, we both grow tomatoes on the east side. Happy to trade seedlings this spring." },
  { name: "Tomas Berg", message: "Enjoyed your talk on compost!" },
  { name: "Ada Quinn", message: "Hello Sam, Dana Pike suggested I write about the shared shed." }
];
const CARD = (row: JsonObject, initials: string) => `${initials} ${String(row.name)}View ${String(row.name)}’s profileHead Gardener at East Plots${String(row.message)}`;
const ROW_SELECTOR = (index: number, button: number) => `body > div:nth-of-type(1) > div:nth-of-type(2) > section > ul > li:nth-of-type(${index}) > div:nth-of-type(3) > button:nth-of-type(${button})`;
/** A row's control as the domain's identity writes it: the run's `forward.8` pass holds the same keys. */
const rowControl = (index: number, name: string, row: JsonObject, initials: string): JsonObject => ({
  selector: ROW_SELECTOR(index, name === "Approve" ? 2 : 1),
  element: { tagName: "button", implicitRole: "button", accessibleName: name, selector: ROW_SELECTOR(index, name === "Approve" ? 2 : 1), classNames: ["css-13zlm0s"], attributes: { type: "button" }, context: { listPosition: { index, total: 8 }, record: { text: CARD(row, initials) } } }
});
/** The popup's close, as the run's `forward.7` pass holds it. */
const CLOSE: JsonObject = {
  selector: "body > section > header > button:nth-of-type(3)",
  element: { tagName: "button", implicitRole: "button", accessibleName: "Close your chat with Dana Pike", selector: "body > section > header > button:nth-of-type(3)", id: "ember512", classNames: ["css-0452fr3"], attributes: { type: "button" }, context: { landmark: "banner" } }
};

const envelope = { schemaVersion: "web-llm-page.v3", trust: "untrusted-page-evidence", location: LIST_ADDRESS, truncated: false, page: "PAGE \"Requests | Club\"" };
const readAnswer = (): Answer => ({
  kind: "llm_evidence_tool_execution", effectApplied: false, resultCode: "web.inspect.succeeded",
  evidence: { ...envelope, ok: true, node: LIST, status: "succeeded", pageChanged: true, read: { actionType: "web.dom.extract_list", status: "succeeded", message: "List extracted.", url: LIST_ADDRESS, extracted: ROWS }, addable: true },
  draft: { actionId: LIST, effect: "observe", proposes: false }
});
const pressAnswer = (parameters: JsonObject, control: string, handle: string, item?: { row: JsonObject; initials: string; place: string }): Answer => ({
  kind: "llm_evidence_tool_execution", effectApplied: true, resultCode: "web.action.succeeded",
  evidence: {
    ...envelope, ok: true, node: CLICK, status: "succeeded", pageChanged: true,
    ...(item ? { actedOn: `This acted on item ${item.place} (${CARD(item.row, item.initials).slice(0, 80)}...) only, through its "${control}"; no other item was acted on.`, actedOnItem: `item ${item.place} (${CARD(item.row, item.initials)})` } : {}),
    control, controlHandle: handle,
    read: { actionType: "web.dom.click", status: "succeeded", message: "Element clicked.", url: LIST_ADDRESS, title: "Requests | Club" }, addable: true
  },
  draft: { actionId: CLICK, effect: "mutate", proposes: false, control, ranWith: { node: CLICK, parameters } }
});
const press = (callId: string, handle: string, consequences: string[] = ["modify_existing"]): Call => ({ callId, toolId: "core.run_node", value: { node: CLICK, parameters: { target: { handle } }, consequences } });

/** The run up to the refused press: a read of three rows, then Approve on the first by hand, the way the gate saw them. */
async function afterFirstApprove(shown: Record<string, { words: string; parameters: JsonObject; answer: Answer }>) {
  const record = new AutomationStudioAttemptActRecord();
  const dispatched: string[] = [];
  const execute = automationStudioAttemptActGate({
    record,
    executeTool: async (call: Call) => {
      dispatched.push(call.callId);
      if (call.value.node === LIST) return readAnswer();
      const handle = String(((call.value.parameters as JsonObject).target as JsonObject).handle);
      return shown[handle]!.answer;
    },
    foresee: (call: Call): AutomationStudioAttemptActForeseen | undefined => {
      const handle = ((call.value.parameters as JsonObject | undefined)?.target as JsonObject | undefined)?.handle;
      const known = typeof handle === "string" ? shown[handle] : undefined;
      return known ? { words: known.words, parameters: known.parameters } : undefined;
    }
  });
  await execute({ callId: "read-requests", toolId: "core.run_node", value: { node: LIST, parameters: { extractList: { fields: { name: "a", message: "b" } } }, consequences: [] } });
  const first = await execute(press("approve-first", "t490")) as Answer;
  expect(first.resultCode).toBe("web.action.succeeded");
  return { record, dispatched, execute };
}

const approveFirst = rowControl(1, "Approve", ROWS[0]!, "IV");
const SHOWN = {
  t490: { words: "Approve", parameters: approveFirst, answer: pressAnswer(approveFirst, "Approve", "t490", { row: ROWS[0]!, initials: "IV", place: "1/8" }) },
  t617: { words: "Close your chat with Dana Pike", parameters: CLOSE, answer: pressAnswer(CLOSE, "Close your chat with Dana Pike", "t617") }
};

describe("a different control after a lasting act, on the page that act left", () => {
  it("sends the popup's close, which shares only its kind with the act done (the run's refused press)", async () => {
    const { dispatched, execute, record } = await afterFirstApprove(SHOWN);
    const close = await execute(press("close-7", "t617", [])) as Answer;
    expect(close.resultCode).toBe("web.action.succeeded");
    expect(dispatched).toEqual(["read-requests", "approve-first", "close-7"]);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed" })]);
  });

  it("sends the same row's other control, whose words differ", async () => {
    const decline = rowControl(1, "Decline", ROWS[0]!, "IV");
    const { execute } = await afterFirstApprove({ ...SHOWN, t489: { words: "Decline", parameters: decline, answer: pressAnswer(decline, "Decline", "t489", { row: ROWS[0]!, initials: "IV", place: "1/8" }) } });
    expect((await execute(press("decline-first", "t489")) as Answer).resultCode).toBe("web.action.succeeded");
  });

  it("sends the same control on another row", async () => {
    const approveThird = rowControl(3, "Approve", ROWS[2]!, "AQ");
    const { execute } = await afterFirstApprove({ ...SHOWN, t520: { words: "Approve", parameters: approveThird, answer: pressAnswer(approveThird, "Approve", "t520", { row: ROWS[2]!, initials: "AQ", place: "3/8" }) } });
    expect((await execute(press("approve-third", "t520")) as Answer).resultCode).toBe("web.action.succeeded");
  });
});

describe("the same act on the same item", () => {
  it("is still refused, by a new handle the page minted after the popup", async () => {
    const { dispatched, execute } = await afterFirstApprove({ ...SHOWN, t700: { ...SHOWN.t490 } });
    const again = await execute(press("approve-again", "t700")) as Answer;
    expect(again.resultCode).toBe("attempt.act_already_done");
    expect(dispatched).toEqual(["read-requests", "approve-first"]);
  });

  it("is still refused by a thinner form of that control that names no words of its own", async () => {
    const { element, ...rest } = approveFirst as { element: JsonObject };
    const { accessibleName: _name, ...thin } = element;
    const { execute } = await afterFirstApprove({ ...SHOWN, t701: { words: "Approve", parameters: { ...rest, element: thin }, answer: SHOWN.t490.answer } });
    expect((await execute(press("approve-thin", "t701")) as Answer).resultCode).toBe("attempt.act_already_done");
  });

  it("is still refused when a Flow's pass carries the row and a thinner form of the control", async () => {
    const { element, ...rest } = approveFirst as { element: JsonObject };
    const { accessibleName: _name, ...thin } = element;
    const { execute } = await afterFirstApprove(SHOWN);
    const pass = await execute({ callId: "forward.8.pass.1", toolId: "core.run_node", value: { node: CLICK, parameters: { ...rest, element: thin }, consequences: ["modify_existing"], item: ROWS[0]!, replay: "step" } }) as Answer;
    expect(pass.resultCode).toBe("attempt.act_already_done");
  });
});

describe("a control's kind", () => {
  it("is never its name", () => {
    expect(automationStudioAttemptActControlName({ element: { tagName: "button", implicitRole: "button", accessibleName: "Approve", inputType: "submit" } })).toBe("Approve");
    expect(automationStudioAttemptActControlName({ element: { tagName: "input", implicitRole: "checkbox", inputType: "checkbox" } })).toBeUndefined();
  });
});
