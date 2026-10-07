// What the activity stream says of a do-while loop's passes and its end
// (read-list S3). The executor's own run of a paging loop is
// `../../../executor/tests/step-count-activity.test.ts`; this covers the
// words for loops that read no list, a list of one page, and what is no member.
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { automationStudioActivityLoops, automationStudioActivityLoopWords, automationStudioActivityPassWords } from "../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const edge = (source: string, port: string, target: string) => ({ sourceNodeId: source, sourcePortId: port, targetNodeId: target });
/** before -> loop -> repeat.body -> act -> last; last.success -> loop; last.ended and repeat.done -> after. */
function flow(act: string) {
  return {
    nodes: [
      { id: "before", definitionId: "web.output.dom-type" }, { id: "loop", definitionId: "builtin.control.merge" },
      { id: "repeat", definitionId: "builtin.control.repeat" }, { id: "act", definitionId: act },
      { id: "last", definitionId: "web.output.dom-click" }, { id: "after", definitionId: "web.output.dom-click" }
    ],
    edges: [
      edge("before", "success", "loop"), edge("loop", "success", "repeat"), edge("repeat", "body", "act"), edge("act", "success", "last"),
      edge("last", "success", "loop"), edge("last", "ended", "after"), edge("repeat", "done", "after")
    ]
  };
}
const began = (pass: number) => ({ nodeId: "repeat", status: "succeeded", route: "body", outputs: { pass } });
const inRun = (fn: () => void) => runWithAutomationStudioActivity({ kind: "run", id: "r1", projectId: "p1" }, async () => fn());

describe("a Flow's do-while loops", () => {
  it("hold the steps a pass runs, never the steps before or after the loop", () => {
    const [loop] = automationStudioActivityLoops(flow("web.output.dom-extract_list"));
    expect([...loop!.members].sort()).toEqual(["act", "last", "loop"]);
    expect(loop!.unit).toBe("page");
    expect(automationStudioActivityLoops(flow("web.output.dom-click"))[0]!.unit).toBe("pass");
  });
});

describe("the words for a pass", () => {
  const page = (pass: number) => ({ repeatId: "repeat", pass, unit: "page" as const });
  it("says a read's page, and the page any other step of the pass is on", () => {
    expect(automationStudioActivityPassWords({ action: "Reading the list", definitionId: "web.output.dom-extract_list", pass: page(3) })).toEqual({ action: "Reading page 3", after: "" });
    expect(automationStudioActivityPassWords({ action: "Clicking “Next”", definitionId: "web.output.dom-click", pass: page(3) })).toEqual({ action: "Clicking “Next” on page 3", after: "" });
    expect(automationStudioActivityPassWords({ action: undefined, definitionId: "domain.page.next", pass: page(3) })).toEqual({ after: " on page 3" });
  });

  it("calls a pass of a loop that reads no list a pass, not a page", () => {
    expect(automationStudioActivityPassWords({ action: "Clicking “Confirm”", definitionId: "web.output.dom-click", pass: { repeatId: "repeat", pass: 2, unit: "pass" } })).toEqual({ action: "Clicking “Confirm” (pass 2)", after: "" });
  });
});

describe("the loop's end", () => {
  const ended = { nodeId: "last", status: "succeeded", route: "ended", outputs: {} };
  it("says a list of one page ended after 1 page, once, and nothing for a pass that goes round", async () => {
    const words = automationStudioActivityLoopWords(flow("web.output.dom-extract_list"));
    await inRun(() => {
      words.settled({ nodeId: "last", status: "succeeded", route: "success", outputs: {} }, [began(1)]);
      words.settled(ended, [began(1), ended]);
    });
    expect(seen.map((event) => event.label)).toEqual(["The list ended after 1 page"]);
  });

  it("says a loop that reads no list ended after its passes, and its bound in passes", async () => {
    const words = automationStudioActivityLoopWords(flow("web.output.dom-click"));
    await inRun(() => {
      words.settled(ended, [began(1), began(2), ended]);
      words.settled({ nodeId: "repeat", status: "succeeded", route: "done", outputs: { pass: 4 } }, []);
    });
    expect(seen.map((event) => event.label)).toEqual(["The loop ended after 2 passes", "The loop stopped at its most passes (4 passes)"]);
  });

  it("says nothing for a failed step, a step outside the loop, or a Flow with no loop", async () => {
    const words = automationStudioActivityLoopWords(flow("web.output.dom-extract_list"));
    await inRun(() => {
      words.settled({ ...ended, status: "failed" }, [began(1)]);
      words.settled({ nodeId: "before", status: "succeeded", route: "success", outputs: {} }, [began(1)]);
      automationStudioActivityLoopWords({ nodes: [{ id: "a", definitionId: "web.output.dom-click" }], edges: [] }).settled({ nodeId: "a", status: "succeeded", route: "success", outputs: {} }, []);
    });
    expect(seen).toEqual([]);
  });
});
