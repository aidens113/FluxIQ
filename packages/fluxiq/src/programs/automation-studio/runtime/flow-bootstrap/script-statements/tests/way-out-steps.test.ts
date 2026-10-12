// An interruption is dismissed through its way out (t423): which optional and
// handler steps are refused for pressing the offer instead, and at which line.
// The element words stand in for the identity the domain resolves a handle to;
// the refusal as the model sees it, through the real controller, is the
// corpus's (`../../candidate/tests/refusal-locator-corpus.test.ts`).
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, parseAutomationStudioFlowScript } from "../../authoring/index.ts";
import { automationStudioFlowScriptWayOutIssues } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry(canonicalBuiltinAutomationNodeDefinitions);
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);

/** The way-out refusals of a script, as code and path. */
function refusals(lines: string[]) {
  const flow = lines.join("\n");
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow }, registry, resolution });
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
  return automationStudioFlowScriptWayOutIssues({ script: parseAutomationStudioFlowScript(flow).script, plan: accepted.plan, locator: accepted.locator })
    .map((issue) => ({ code: issue.code, path: issue.path, message: issue.message }));
}

/** Lines 1-4: open the page. */
const OPEN = ["flow: Do it", "step: open the page", "  node: web.browser.navigate", "  url: https://shop.test/"];
/** Lines 5-10 after OPEN: a press on a control with these words, declaring `consequences`, with any extra lines. */
const press = (words: string, extra: string[] = [], consequences = "none") => ["step notice: close the notice if it shows", "  node: web.dom.click", "  selector: .notice", `  element.visibleText: ${words}`, `  consequences: ${consequences}`, ...extra];

describe("an optional step that answers an interruption", () => {
  it("is refused at its consequences line when it presses the offer as if it did nothing, naming the way out", () => {
    const found = refusals([...OPEN, ...press("Claim the offer", ["  optional: yes"])]);
    expect(found.map(({ code, path }) => ({ code, path }))).toEqual([{ code: "flow_script.way_out_accepts", path: "flow.line.9" }]);
    expect(found[0]!.message).toContain("The step at line 5 is optional");
    expect(found[0]!.message).toContain("\"Claim the offer\"");
    expect(found[0]!.message).toContain("close, no thanks, not now, the X");
    expect(found[0]!.message).toContain("make it a step of its own, not optional");
  });

  it("refuses each accepting control: join, subscribe, sign up, buy, confirm, continue, and a label that begins by taking the offer", () => {
    for (const words of ["Grab the offer", "Join now", "Subscribe", "Sign up for updates", "Buy now", "Confirm", "Continue", "Continue to checkout", "Get the app", "Grab it", "Yes, I want it", "Add to bag", "Accept the offer", "Accept and subscribe"]) {
      expect(refusals([...OPEN, ...press(words, ["  optional: yes"])]).map((issue) => issue.code), words).toEqual(["flow_script.way_out_accepts"]);
    }
  });

  it("passes every way out, a way out whose tail mentions paying, and a control that continues", () => {
    for (const words of ["Close", "×", "X", "No thanks, I would rather pay full price", "Not now", "Maybe later", "Dismiss", "Reject non-essential", "Continue without accepting", "Skip", "Continue shopping"]) {
      expect(refusals([...OPEN, ...press(words, ["  optional: yes"])]), words).toEqual([]);
    }
  });

  // Coordinator, 2026-10-10: accepting cookies is not a risky act, and some banners have no reject.
  it("passes a cookie banner's accept, said alone or naming cookies, which is not an offer", () => {
    for (const words of ["Accept all", "Accept cookies", "Accept all cookies", "Allow all", "Agree", "I agree", "Accept", "Allow cookies and continue"]) {
      expect(refusals([...OPEN, ...press(words, ["  optional: yes"])]), words).toEqual([]);
    }
  });

  it("passes an accepting press that says what it lastingly does: the permission gate asks about that one", () => {
    expect(refusals([...OPEN, ...press("Join now", ["  optional: yes"], "create_new")])).toEqual([]);
  });

  it("does not judge a step that is not optional, one whose optional line says no, or words that are a container's prose", () => {
    expect(refusals([...OPEN, ...press("Join now")])).toEqual([]);
    expect(refusals([...OPEN, ...press("Join now", ["  optional: no"])])).toEqual([]);
    expect(refusals([...OPEN, ...press(`Join now ${"and see what members say about the club ".repeat(3)}`, ["  optional: yes"])])).toEqual([]);
  });
});

describe("a handler's step that answers an interruption", () => {
  const handled = (words: string, when = "exists t1") => [
    ...OPEN,
    "step rows: read the rows", "  node: web.dom.extract_list", "  extractList: {\"item\": \".row\", \"fields\": {\"name\": \".name\"}}",
    "on before for rows: an offer covers the list",
    `  when: ${when}`,
    "  step: close the offer",
    "    node: web.dom.click",
    "    selector: .offer",
    `    element.accessibleName: ${words}`,
    "    consequences: none",
    "  then: carry on",
    "end"
  ];

  it("is refused at its consequences line when it presses the offer, naming the handler", () => {
    const found = refusals(handled("Join now"));
    expect(found.map(({ code, path }) => ({ code, path }))).toEqual([{ code: "flow_script.way_out_accepts", path: "flow.line.14" }]);
    expect(found[0]!.message).toContain("The step at line 10 is in the handler at line 8");
  });

  it("passes the offer's way out", () => {
    expect(refusals(handled("Close"))).toEqual([]);
  });

  it("reads the dialog's kind where the handler names it: any consent answer passes on a consent dialog, and an offer on it is still refused", () => {
    const consent = 'dialog consent "Your privacy choices"';
    // "Yes, I'm happy" accepts by its words alone; the consent kind is what says it answers a cookie banner.
    expect(refusals(handled("Yes, I'm happy"))).toHaveLength(1);
    expect(refusals(handled("Yes, I'm happy", consent))).toEqual([]);
    expect(refusals(handled("Subscribe to our newsletter", consent)).map((issue) => issue.code)).toEqual(["flow_script.way_out_accepts"]);
  });
});
