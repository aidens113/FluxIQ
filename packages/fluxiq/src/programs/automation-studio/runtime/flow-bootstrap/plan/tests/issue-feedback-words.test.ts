// Every script and subflow refusal a builder can meet reaches it with words
// (t608). Everything-store `run-mv8p0p7c` (0153) was refused
// `flow_script.part_interface_invalid` with a code, a path and a line and no
// sentence, because the issue feedback keeps a message only for the codes it
// lists and that one was not listed. The builder resent the same script three
// times and the repeat guard ended its brief.
//
// Enforced, not remembered: the source of `flow-bootstrap/` is read, every
// `flow_script.*` code it names and every `subflow.*` code it raises as an
// issue is collected, and each must keep Core's sentence through the feedback.
// A new code raised without being given its words fails here.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { acceptAutomationStudioFlowBootstrapResult } from "../../authoring/index.ts";
import { automationStudioFlowBootstrapIssueFeedback, type AutomationStudioFlowBootstrapIssue } from "../index.ts";
import { stateNodeRegistryFixture, webDomainNodeDefinitionsFixture } from "./index.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** The feedback itself lists the codes; reading it would only confirm the list against itself. */
const FEEDBACK_FILE = join("plan", "issue-feedback.ts");

const sources = readdirSync(ROOT, { recursive: true, encoding: "utf8" })
  .filter((name) => name.endsWith(".ts") && !name.split(/[\\/]/u).includes("tests") && join(name) !== FEEDBACK_FILE)
  .map((name) => readFileSync(join(ROOT, name), "utf8"));

/** Every script code the source names: each is raised by a statement or the assembly as a refusal or a warning. */
const scriptCodes = new Set(sources.flatMap((text) => [...text.matchAll(/"(flow_script\.[a-z_]+)"/gu)].map((match) => match[1]!)));
/** Every subflow code the source raises as an issue (`{ code: "subflow.…", …, message }`), as a builder's scoped submission does. */
const subflowCodes = new Set(sources.flatMap((text) => [...text.matchAll(/\bcode: "(subflow\.[a-z_]+)"/gu)].map((match) => match[1]!)));

const SENTENCE = "Core's sentence: what was wrong, and what to write instead.";

describe("the refusal codes a builder can meet", () => {
  it("are read from the source, so a code added there is held here too", () => {
    expect(scriptCodes).toContain("flow_script.part_interface_invalid");
    expect(scriptCodes).toContain("flow_script.way_out_accepts");
    expect(scriptCodes.size).toBeGreaterThan(40);
    expect(subflowCodes).toContain("subflow.input_unread");
    expect(subflowCodes).toContain("subflow.output_not_a_value");
    expect(subflowCodes.size).toBeGreaterThan(15);
  });

  it("each keep Core's sentence through the issue feedback", () => {
    const codes = [...scriptCodes, ...subflowCodes].sort();
    const issues: AutomationStudioFlowBootstrapIssue[] = codes.map((code) => ({ severity: "error", code, message: SENTENCE, path: "flow.line.3" }));
    const feedback = automationStudioFlowBootstrapIssueFeedback({ issues });
    const bare = codes.filter((code, index) => feedback[index]?.message !== SENTENCE);
    expect(bare, "codes a builder would be refused with and never told why: give each its words in `../issue-feedback.ts`").toEqual([]);
  });
});

describe("the refusal run-mv8p0p7c's builder met (0153)", () => {
  const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const registry = stateNodeRegistryFixture(webDomainNodeDefinitionsFixture());
  const open = ["flow: Renew a library loan", "step: open the account", "  node: web.browser.navigate", "  url: https://library.test/account"];
  const part = [
    "part renewal: renew one loan",
    "  input: card",
    "  output: loans = $row.title",
    "  step: type the card number",
    "    node: web.dom.type",
    "    selector: #t4",
    "    text: $input.card",
    "  step loans: read the loans",
    "    node: web.dom.extract_list",
    "    extractList: extraction.1",
    "    extractList.minItems: 0",
    "end"
  ];

  function told(lines: readonly string[]) {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: lines.join("\n") }, registry, resolution });
    if (accepted.ok) throw new Error("the script was accepted");
    const errors = accepted.issues.filter((issue) => issue.severity === "error");
    return automationStudioFlowBootstrapIssueFeedback({ issues: errors }).filter((entry) => entry.code === "flow_script.part_interface_invalid");
  }

  it("says an interface on a block no step calls is not a part's, and how a Flow's own input is written", () => {
    const [entry] = told([...open, "input: card"]);
    expect(entry?.message).toContain("declares an input or output of a block no step calls");
    expect(entry?.message).toContain("`$input.<name> = <value>`");
  });

  it("says an output no step of the part gives could not be read, and what a part hands back", () => {
    const entries = told([...open, "step: renew", "  call: renewal", "  card: 1", ...part]);
    expect(entries.map((entry) => entry.message)).toEqual([expect.stringContaining("A part hands back only what one of its own steps gave.")]);
  });
});
