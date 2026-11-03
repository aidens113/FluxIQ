// A callable subflow's script read against its scope (`../callable-target.ts`): an unread input another subflow hands on
// is noted, never refused; an unread input the person gives the Flow is refused, told to read it (t672).
import { describe, expect, it } from "vitest";
import { automationStudioSubflowCallableProbe } from "../index.ts";

const port = (id: string) => ({ id, name: id, valueType: { kind: "unknown" as const } });
const contract = { inputs: [port("shelf"), port("reader")], outputs: [] };
const flow = [
  "flow: Open the book",
  "part open_book: open the book",
  "  input: shelf",
  "  input: reader",
  "  step: open the book",
  "    node: web.browser.navigate",
  "    url: https://library.test/book",
  "  step: sign the card",
  "    node: web.dom.type",
  "    selector: .card",
  "    text: $input.reader",
  "end"
].join("\n");

describe("a callable subflow's unread inputs", () => {
  it("notes a handed-on input no line reads and builds the probe", () => {
    const read = automationStudioSubflowCallableProbe({ flow, subflowKey: "open_book", contract, handedOn: ["shelf"] });
    expect(read.issues).toEqual([]);
    expect(read.unneeded).toEqual(["shelf"]);
    expect(read.probe).toContain("call: open_book");
  });

  it("refuses an unread input no other subflow hands on, naming it, with the person's value said and no ending offered", () => {
    const read = automationStudioSubflowCallableProbe({ flow, subflowKey: "open_book", contract, handedOn: ["reader"] });
    expect(read.probe).toBeUndefined();
    expect(read.unneeded).toBeUndefined();
    expect(read.issues).toEqual([{ code: "subflow.input_unread", path: "flow.line.3", message: expect.stringContaining("The input \"shelf\" at line 3 is declared, and no line of this part reads it.") }]);
    expect(read.issues[0]!.message).toContain("it is one the person gives the Flow, and this subflow is where the plan uses it. Read it where this subflow uses it.");
    expect(read.issues[0]!.message).not.toContain("blocked");
    // With no `handedOn`, every input is the person's.
    expect(automationStudioSubflowCallableProbe({ flow, subflowKey: "open_book", contract }).issues.map((issue) => issue.code)).toEqual(["subflow.input_unread"]);
  });
});
