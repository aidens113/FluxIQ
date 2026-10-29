// A step that does one of the person's requested acts is never optional on the
// candidate path (r4b F4). A generic lending-library site: the instruction asks
// to claim the welcome voucher and reserve a book. The element words stand in
// for the identity the domain resolves a handle to.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, parseAutomationStudioFlowScript } from "../../authoring/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE, automationStudioInstructedActOptionalScriptIssues } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry(canonicalBuiltinAutomationNodeDefinitions);
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);

const INSTRUCTION = "Claim the welcome voucher on the library site, then reserve the first book in the list.";

function issues(lines: string[], instructionText: string | undefined = INSTRUCTION, askedConsequences?: string[]) {
  const flow = lines.join("\n");
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow }, registry, resolution });
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
  return automationStudioInstructedActOptionalScriptIssues({ instructionText, script: parseAutomationStudioFlowScript(flow).script, plan: accepted.plan, locator: accepted.locator, ...(askedConsequences ? { askedConsequences } : {}) });
}

/** Lines 1-4: open the page. */
const OPEN = ["flow: Do it", "step: open the page", "  node: web.browser.navigate", "  url: https://library.test/"];
/** Lines 5-9 after OPEN: a press with these words and description, with any extra lines (the optional line is 10). */
const press = (description: string, words: string | undefined, extra: string[] = []) => [
  `step press: ${description}`, "  node: web.dom.click", "  selector: .panel button", ...(words === undefined ? [] : [`  element.visibleText: ${words}`]), "  consequences: none", ...extra
];

describe("an optional candidate step that does a requested act", () => {
  it("is refused at its optional line under the draft path's code, with the draft path's sentence", () => {
    const found = issues([...OPEN, ...press("take the voucher", "Claim voucher", ["  optional: yes"])]);
    expect(found.map(({ code, path }) => ({ code, path }))).toEqual([{ code: AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE, path: "flow.line.10" }]);
    expect(found[0]!.message).toContain("a1 is done by the step at line 5, which is marked optional: the Flow carries on when it fails, so a1 may never be done");
    expect(found[0]!.message).toContain("Take the `optional:` line off");
  });

  it("reads a control already showing the act done as the act", () => {
    expect(issues([...OPEN, ...press("take the voucher", "Claimed", ["  optional: yes"])]).length).toBe(1);
  });

  it("reads the step's own words when its control was saved with none", () => {
    expect(issues([...OPEN, ...press("claim the welcome voucher", undefined, ["  optional: yes"])]).length).toBe(1);
  });

  it("keeps a dismissal optional, even one naming the act's object", () => {
    for (const words of ["Close the voucher offer", "No thanks", "Not now", "×", "Save cookie preferences"]) {
      expect(issues([...OPEN, ...press("close the voucher popup if it shows", words, ["  optional: yes"])]), words).toEqual([]);
    }
  });

  it("does not judge a step that is not optional, an instruction with no lasting act, or a control unrelated to the acts", () => {
    expect(issues([...OPEN, ...press("take the voucher", "Claim voucher")])).toEqual([]);
    expect(issues([...OPEN, ...press("take the voucher", "Claim voucher", ["  optional: yes"])], "List the books on the library site.")).toEqual([]);
    expect(issues([...OPEN, ...press("open the help panel", "Help", ["  optional: yes"])])).toEqual([]);
  });
});

/** Lines 5-10 after OPEN: an optional dismissal labelled `dismiss`; the next step starts at line 11. */
const DISMISS = ["step dismiss: close the notice banner", "  node: web.dom.click", "  selector: .banner button", "  element.visibleText: Close", "  consequences: none", "  optional: yes"];

describe("a candidate step behind `only after:` an optional step", () => {
  it("is refused at its `only after:` line when it does a requested act, in Core's own sentence", () => {
    const found = issues([...OPEN, ...DISMISS, "step take: take the voucher", "  node: web.dom.click", "  selector: .panel button", "  element.visibleText: Claim voucher", "  consequences: none", "  only after: dismiss"]);
    expect(found.map(({ code, path }) => ({ code, path }))).toEqual([{ code: AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE, path: "flow.line.16" }]);
    expect(found[0]!.message).toContain("`only after: dismiss` makes it run only on passes where dismiss was done");
    expect(found[0]!.message).toContain("Take `only after:` out so it runs on every pass.");
  });

  it("is refused when its declared lasting consequence is the class a requested act asks for, whatever its words", () => {
    const found = issues([...OPEN, ...DISMISS, "step go: continue", "  node: web.dom.click", "  selector: .panel button", "  element.visibleText: Go", "  consequences: send_or_publish", "  only after: dismiss"], "Submit the hold request on the library site.");
    expect(found.map(({ path }) => path)).toEqual(["flow.line.16"]);
  });

  // t796: the part's own lasting act, by class, where the instruction's verb is none Core's words read as an act.
  it("is refused when it declares the lasting act the part asks for, though no word of the instruction reads as an act", () => {
    const star = [...OPEN, ...DISMISS, "step mark: mark the book", "  node: web.dom.click", "  selector: .panel button", "  element.visibleText: Star", "  consequences: modify_existing", "  only after: dismiss"];
    const instruction = "Star the three newest books in the catalogue.";
    expect(issues(star, instruction)).toEqual([]);
    const found = issues(star, instruction, ["modify_existing"]);
    expect(found.map(({ code, path }) => ({ code, path }))).toEqual([{ code: AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE, path: "flow.line.16" }]);
    expect(found[0]!.message).toContain("declares `consequences: modify_existing`, the lasting act this part asks for");
    expect(found[0]!.message).toContain("Take `only after:` out so it runs on every pass.");
    expect(issues([...OPEN, ...DISMISS, "step cooldown: wait a little", "  node: builtin.timing.wait", "  duration: 2", "  unit: seconds", "  only after: dismiss"], instruction, ["modify_existing"])).toEqual([]);
  });

  it("accepts a plain wait behind `only after:`", () => {
    expect(issues([...OPEN, ...DISMISS, "step cooldown: wait a little", "  node: builtin.timing.wait", "  duration: 2", "  unit: seconds", "  only after: dismiss"])).toEqual([]);
  });
});
