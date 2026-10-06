import { describe, expect, it } from "vitest";
import { ACTIVITY_RESULT_CHECK_LABELS, activityActionOf, type ActivityAction, type ActivityActionEvent, type ActivityActionKind } from "../index.ts";

const RUN_NODE = "core.run_node";
const DOTTED = /[A-Za-z_][\w-]*\.[A-Za-z_][\w-]*/u;

function tool(title: string, text?: string, status: "started" | "succeeded" | "failed" = "succeeded", ref = RUN_NODE, phase = "exploring"): ActivityActionEvent {
  return { phase, detail: { kind: "tool", title, status, ref, ...(text === undefined ? {} : { text }) } };
}

function outputsOf(action: ActivityAction | null): string[] {
  return action ? [action.kind, action.target ?? "", action.outcome, action.why ?? ""] : [];
}

describe("activityActionOf: the Flow's own control steps (U-A2)", () => {
  const step = (definition: string | undefined, label?: string): ActivityActionEvent => ({
    phase: "running",
    step: { nodeId: "n3", ...(label === undefined ? {} : { label }) },
    detail: { kind: "step", title: label ?? "Step 3 of 9", status: "started", ref: "n3", ...(definition === undefined ? {} : { text: `Node: ${definition}` }) }
  });
  it.each<[string, ActivityActionKind]>([
    ["builtin.control.merge", "join"],
    ["builtin.control.branch", "branch"],
    ["builtin.control.switch", "branch"],
    ["builtin.control.parallel", "branch"],
    ["builtin.control.for-each", "repeat"],
    ["builtin.control.loop", "repeat"]
  ])("reads %s as a %s step, acting on no control", (definition, kind) => {
    expect(outputsOf(activityActionOf(step(definition)))).toEqual([kind, "", "working", ""]);
  });

  it("never takes a step's own words for a control step", () => {
    expect(activityActionOf(step(undefined, "Switch my pickup store"))?.kind).not.toBe("branch");
    expect(activityActionOf(step(undefined, "Read each price"))?.kind).toBe("read");
    expect(activityActionOf(step("web.output.dom-click"))?.kind).toBe("click");
  });
});

describe("activityActionOf: what is not an action", () => {
  it.each<[string, ActivityActionEvent]>([
    ["a pure status change", { phase: "running" }],
    ["the decide-start row", { phase: "thinking", detail: { kind: "thought", title: "Deciding the next step", status: "started" } }],
    ["a decision's thought", { phase: "exploring", detail: { kind: "thought", title: "Look at the page", text: "The list is below the fold.", status: "succeeded" } }],
    ["Run started", { phase: "running", detail: { kind: "note", title: "Run started", status: "started", ref: "8f2c1d9a-run" } }],
    ["Build started", { phase: "building", detail: { kind: "step", title: "Build started", status: "started" } }],
    ["Build finished", { phase: "done", detail: { kind: "step", title: "Build finished", status: "succeeded" } }],
    ["Run failed", { phase: "failed", detail: { kind: "step", title: "Run failed", status: "failed" } }]
  ])("returns null for %s", (_name, event) => {
    expect(activityActionOf(event)).toBeNull();
  });
});

describe("activityActionOf: every kind", () => {
  it.each<[ActivityActionKind, ActivityActionEvent]>([
    ["click", tool("Clicking “Get a free quote”", "Result: web.action.succeeded · Node: web.output.dom-click")],
    ["type", tool("Typing into “Search”", "Node: web.output.fill-field")],
    ["type", tool("Typing into the page", "Node: web.output.search-box")],
    ["navigate", tool("Opening a page", "Node: web.output.navigate")],
    ["navigate", tool("Opening a page", "Node: web.nav")],
    ["read", tool("Reading the list", "Node: web.output.extract-list")],
    ["read", tool("Working on the page", "Node: web.list")],
    ["look", tool("Looking at the page", undefined, "succeeded", "web.capture_snapshot")],
    ["look", tool("Looking for the list of items", undefined, "succeeded", "web.detect_repeating_structure")],
    ["look", tool("Looking at the page", undefined, "succeeded", "core.observe")],
    ["wait", tool("Waiting for the page", "Node: web.output.wait")],
    ["other", tool("Scrolling the page", "Node: web.output.scroll")],
    ["person_check", tool("Looking at the page", "Result: example.user_intervention_required")],
    ["person_check", { phase: "waiting_permission", detail: { kind: "ask", title: "Asked the person to complete a check", status: "started" } }],
    ["person_check", tool("Clicking on the page", "Result: web.action.check_required · Node: web.output.dom-click")],
    ["permission", { phase: "waiting_permission", detail: { kind: "ask", title: "Asked a question (confirm)", status: "started" } }],
    ["permission", { phase: "waiting_permission", detail: { kind: "ask", title: "Run is waiting for an answer", status: "started" } }],
    ["permission", tool("Opening a page", "Result: example.permission_required")],
    ["draft", { phase: "building", detail: { kind: "tool", title: "Updating the draft Flow", status: "started", ref: "core.flow_draft" } }],
    ["test", { phase: "verifying", detail: { kind: "check", title: "Completion check", status: "started" } }],
    ["click", tool("Clicking “Next”", "Result: core.replay.replayed · Node: web.output.dom-click", "succeeded", RUN_NODE, "verifying")],
    ["test", { phase: "verifying", detail: { kind: "note", title: "Putting the page back to where the Flow starts", status: "started", ref: RUN_NODE } }],
    ["test", tool("Working on the page", undefined, "succeeded", "core.dry_run")],
    ["repair", { phase: "repairing", detail: { kind: "step", title: "Trying another way to reach the list", status: "started" } }],
    ["other", tool("Trying a step on the page")],
    ["other", tool("Working on the page", undefined, "succeeded", "core.evidence_history")],
    ["other", { phase: "running", step: { nodeId: "n4" }, detail: { kind: "step", title: "Step 4 of 6", status: "started", ref: "n4" } }]
  ])("reads %s", (kind, event) => {
    expect(activityActionOf(event)?.kind).toBe(kind);
  });

  it("reads a step's verb from its label, then from the title the wording already said", () => {
    const labelled: ActivityActionEvent = { phase: "running", step: { nodeId: "n1", label: "Search for laptops" }, detail: { kind: "step", title: "Search for laptops", status: "started", ref: "n1" } };
    expect(activityActionOf(labelled)?.kind).toBe("type");
    const worded: ActivityActionEvent = { phase: "running", step: { nodeId: "n2" }, detail: { kind: "step", title: "Checking the page", status: "started", ref: "n2" } };
    expect(activityActionOf(worded)?.kind).toBe("look");
    const clicked: ActivityActionEvent = { phase: "running", step: { nodeId: "n3" }, detail: { kind: "step", title: "Clicking “Add to cart”", status: "started", ref: "n3" } };
    expect(activityActionOf(clicked)?.kind).toBe("click");
  });

  it("reads the result code's action word when nothing else names the verb", () => {
    expect(activityActionOf(tool("Working on the page", "Result: example.opened", "succeeded", "example.go"))?.kind).toBe("navigate");
    expect(activityActionOf(tool("Working on the page", "Result: example.looked", "succeeded", "example.go"))?.kind).toBe("look");
  });

  it("prefers the node id over the title", () => {
    expect(activityActionOf(tool("Working on the page", "Node: web.output.dom-click"))?.kind).toBe("click");
  });
});

describe("activityActionOf: target", () => {
  it("is the name Core quoted in the title", () => {
    expect(activityActionOf(tool("Clicking “Get a free quote”", "Node: web.output.dom-click"))?.target).toBe("Get a free quote");
  });

  it("is the step's label when the title quotes nothing", () => {
    const event: ActivityActionEvent = { phase: "running", step: { nodeId: "n1", label: "Open search" }, detail: { kind: "step", title: "Open search", status: "started", ref: "n1" } };
    expect(activityActionOf(event)?.target).toBe("Open search");
  });

  it("is null when neither names anything, never the page in the client's words", () => {
    expect(activityActionOf(tool("Opening a page", "Node: web.output.navigate"))?.target).toBeNull();
  });

  it("is never an id", () => {
    const event: ActivityActionEvent = { phase: "running", step: { nodeId: "n1", label: "web.output.dom-click" }, detail: { kind: "step", title: "Clicking “web.output.dom-click”", status: "started", ref: "n1" } };
    expect(activityActionOf(event)?.target).toBeNull();
  });
});

describe("activityActionOf: outcome and why", () => {
  it.each<[string, ActivityActionEvent, ActivityAction["outcome"], string | null]>([
    ["started", tool("Clicking on the page", undefined, "started"), "working", null],
    ["succeeded", tool("Clicking on the page", "Result: web.action.succeeded"), "done", null],
    ["failed with no code", tool("Clicking on the page", undefined, "failed"), "failed", null],
    ["a not_found code", tool("Clicking “Buy”", "Result: web.target.not_found · Node: web.output.dom-click"), "failed", "it wasn't on the page"],
    ["a timeout code", tool("Waiting for the page", "Result: web.wait.timeout · Node: web.output.wait"), "failed", "the page took too long"],
    ["a replay that changed", tool("Clicking “Next”", "Result: core.replay.changed", "succeeded", RUN_NODE, "verifying"), "failed", "it did nothing this time, where it did something before"],
    ["a replay the site remembered (t193)", tool("Clicking “Set as my store”", "Result: core.replay.remembered · Node: web.output.dom-click", "succeeded", RUN_NODE, "verifying"), "done", null],
    ["a replay already in place", tool("Clicking “12 Double Rolls”", "Result: core.replay.present", "succeeded", RUN_NODE, "verifying"), "done", null],
    ["an unknown failing code", tool("Clicking on the page", "Result: web.action.failed"), "failed", null],
    ["a person needed", tool("Looking at the page", "Result: example.user_intervention_required"), "waiting", null],
    ["a waiting phase", { phase: "waiting_permission", detail: { kind: "ask", title: "Asked a question (confirm)", status: "started" } }, "waiting", null],
    ["a refused completion", { phase: "verifying", detail: { kind: "check", title: "Completion check", status: "failed", text: "The Flow never reads the list." } }, "failed", null]
  ])("%s", (_name, event, outcome, why) => {
    const action = activityActionOf(event);
    expect(action?.outcome).toBe(outcome);
    expect(action?.why).toBe(why);
  });
});

const CHECK_TITLE = "Asked the person to complete a check";
const PERMISSION_TITLE = "Asked a question (permission)";

function settled(title: string, phase: string, status: string | undefined, resolution?: string): ActivityActionEvent {
  return { phase, detail: { kind: "ask", title, ref: "ask.1", ...(status === undefined ? {} : { status }), ...(resolution === undefined ? {} : { resolution }) } };
}

describe("activityActionOf: a wait on the person, settled", () => {
  it.each<[string, ActivityActionEvent, ActivityActionKind, ActivityAction["outcome"], string | null]>([
    ["a robot check answered", settled(CHECK_TITLE, "building", "succeeded", "answered"), "person_check", "done", null],
    ["a robot check waited out", settled(CHECK_TITLE, "running", "succeeded", "waited_out"), "person_check", "done", null],
    ["a robot check stopped", settled(CHECK_TITLE, "building", "failed", "declined"), "person_check", "failed", "you pressed Stop"],
    ["a robot check nobody answered", settled(CHECK_TITLE, "repairing", "failed", "timed_out"), "person_check", "failed", "nobody answered in time"],
    ["a permission allowed", settled(PERMISSION_TITLE, "building", "succeeded", "allowed"), "permission", "done", null],
    ["a permission declined in a repair", settled(PERMISSION_TITLE, "repairing", "failed", "declined"), "permission", "failed", "you said no"],
    ["a permission nobody answered", settled(PERMISSION_TITLE, "running", "failed", "timed_out"), "permission", "failed", "nobody answered in time"],
    ["a robot check whose work stopped first", settled(CHECK_TITLE, "building", "failed", "cancelled"), "person_check", "failed", "the work stopped first"],
    ["a permission whose work stopped first", settled(PERMISSION_TITLE, "repairing", "failed", "cancelled"), "permission", "failed", "the work stopped first"]
  ])("%s", (_name, event, kind, outcome, why) => {
    expect(activityActionOf(event)).toEqual({ kind, target: null, outcome, why });
  });

  it("goes by the resolution, not by the status beside it", () => {
    expect(activityActionOf(settled(CHECK_TITLE, "building", "started", "answered"))?.outcome).toBe("done");
    expect(activityActionOf(settled(CHECK_TITLE, "building", "succeeded", "timed_out"))?.outcome).toBe("failed");
  });

  it("never infers that a wait is over: an ask with no resolution is still waiting, whatever phase it is read in", () => {
    for (const phase of ["waiting_permission", "building", "running", "repairing", "done"]) {
      expect(activityActionOf(settled(CHECK_TITLE, phase, "started"))?.outcome).toBe("waiting");
      expect(activityActionOf(settled(PERMISSION_TITLE, phase, undefined))?.outcome).toBe("waiting");
      expect(activityActionOf(settled(CHECK_TITLE, phase, "succeeded"))?.outcome).toBe("waiting");
      expect(activityActionOf(settled(CHECK_TITLE, phase, "succeeded", "guessed"))?.outcome).toBe("waiting");
    }
  });

  it("reads an ask Core failed without a resolution as failed, with no reason it did not give", () => {
    expect(activityActionOf(settled(PERMISSION_TITLE, "running", "failed"))).toEqual({ kind: "permission", target: null, outcome: "failed", why: null });
  });
});

describe("activityActionOf: no output carries an id or a result code", () => {
  it("holds across every kind of row", () => {
    const events: ActivityActionEvent[] = [
      tool("Clicking “Get a free quote”", "Result: web.target.not_found · Node: web.output.dom-click"),
      tool("Working on the page", "Result: llm_evidence_loop.rejected.repeat_without_progress", "succeeded", "core.evidence_history"),
      tool("Typing into the page", "Result: web.field.disabled · Node: web.output.fill"),
      tool("Clicking “web.output.dom-click”", "Result: core.replay.unreproducible", "succeeded", RUN_NODE, "verifying"),
      { phase: "running", step: { nodeId: "flow.node.3", label: "flow.node.3" }, detail: { kind: "step", title: "Step 3 of 5", status: "failed", ref: "flow.node.3" } },
      { phase: "waiting_permission", detail: { kind: "ask", title: "Asked a question (confirm)", status: "started", ref: "ask.17" } }
    ];
    for (const event of events) {
      const outputs = outputsOf(activityActionOf(event));
      expect(outputs.length).toBeGreaterThan(0);
      for (const output of outputs) expect(output).not.toMatch(DOTTED);
    }
  });
});

describe("activityActionOf: looks name what they look at (t193)", () => {
  it("reads Core's look-ups as looks, named by what they look up", () => {
    expect(outputsOf(activityActionOf(tool("Looking up how to use “Type”", undefined, "started", "core.describe_nodes")))).toEqual(["look", "Type", "working", ""]);
    // R2-U-4 (`run-muwansvz-a2b4a987`, moment 04): "Look · Extract list" named a node; the look-up says what it looks up.
    expect(outputsOf(activityActionOf(tool("Looking up how to read a list", undefined, "started", "core.describe_nodes")))).toEqual(["look", "how to read a list", "working", ""]);
    expect(outputsOf(activityActionOf(tool("Looking again at what “open store picker 1” found", "Result: core.recall.restored", "succeeded", "core.recall_result")))).toEqual(["recall", "open store picker 1", "done", ""]);
  });

  // t194 (`run-murwcmx2-a1c6edf7`, 00012): a recall that found nothing read
  // "Look · Didn't work: it wasn't on the page". It looks at no page; it reads
  // back an earlier result, and says that nothing went by the name it gave.
  it("reads a recall as a recall, and one that found nothing as no page miss", () => {
    expect(outputsOf(activityActionOf(tool("Looking again at what an earlier step found", "Result: core.recall.not_found", "succeeded", "core.recall_result")))).toEqual(["recall", "", "failed", "no earlier result goes by that name"]);
  });

  // t194 (`run-murwcmx2-a1c6edf7`, 00016): the test's list read was a bare "Test run".
  // A test run's step reads by its action, marked as part of a test (D4, below).
  it("names a test run's list read by what it reads", () => {
    const read = activityActionOf(tool("Reading the list of “name, price and rating”", "Result: core.replay.replayed · Node: web.output.dom-extract_list", "succeeded", RUN_NODE, "verifying"));
    expect(outputsOf(read)).toEqual(["read", "name, price and rating", "done", ""]);
    expect(read?.testing).toBe(true);
  });

  it("names a look by the words it looks for, in their quotes, when it names no control", () => {
    expect(outputsOf(activityActionOf(tool('Looking for "Colour" on the page', undefined, "started", "web.find_on_page")))).toEqual(["look", '"Colour"', "working", ""]);
    expect(activityActionOf(tool('Typing "towels"', undefined, "started", RUN_NODE))?.target).toBeNull();
    expect(activityActionOf(tool('Looking for "web.output.x" on the page', undefined, "started", "web.find_on_page"))?.target).toBeNull();
  });

  it("reads an element's details as a look at that element's label", () => {
    expect(outputsOf(activityActionOf(tool("Reading the details of “Add to cart”", undefined, "started", "web.describe_element")))).toEqual(["look", 'the "Add to cart" label', "working", ""]);
  });
});

// U-2 (`run-muw60j7c-bb7c9a62`, moments 04, 10, 11): a look's card named the
// page's own label, cut mid-word -- "Look · Sponsored ⓘ ... Earbuds, Hybr...",
// "Look · Brightaisle Plus".
describe("activityActionOf: a look at one element names what it looked for (U-2)", () => {
  it("names a detect around a short label as the list around it, and around a long one as the list", () => {
    const around = (name: string) => activityActionOf(tool(`Looking for the repeating list around “${name}”`, "Result: web.inspect.succeeded", "succeeded", "web.detect_repeating_structure"));
    expect(around("Sponsored")?.target).toBe('the list around "Sponsored"');
    expect(around("Sponsored ⓘ Pulsebud Neo ANC Wireless Earbuds, Hybr…")?.target).toBe("the repeating list on the page");
  });

  it("names an element's details by its label, short, and never cut inside a word", () => {
    const details = (name: string) => activityActionOf(tool(`Reading the details of “${name}”`, "Result: web.inspect.succeeded", "succeeded", "web.describe_element"))?.target;
    expect(details("Brightaisle Plus")).toBe('the "Brightaisle Plus" label');
    expect(details("Sponsored ⓘ Pulsebud Neo ANC Wireless Earbuds, Hybr…")).toBe('the "Sponsored Pulsebud Neo ANC…" label');
    expect(details("Pulsebud Neo ANC Wireless Earbuds Hybrid Active Noise")).toBe('the "Pulsebud Neo ANC Wireless…" label');
    for (const name of ["Sponsored ⓘ Pulsebud Neo ANC Wireless Earbuds, Hybr…", "Pulsebud Neo ANC Wireless Earbuds Hybrid Active Noise"]) {
      expect(details(name)).not.toMatch(/Hybr…|Hybr"|ⓘ/u);
    }
  });
});

// t193 (`run-muqiojz4-04a7a8fc`): chat wording a person could not use.
describe("activityActionOf: what each card says (t193 chat wording)", () => {
  // 00019: a real run's result check read "Test run · Working on it". It checks
  // the run's result; it runs nothing.
  it("reads a result check as checking the result, never as a test run", () => {
    const started: ActivityActionEvent = { phase: "verifying", detail: { kind: "check", title: "Result check started", status: "started" } };
    const ended: ActivityActionEvent = { phase: "verifying", detail: { kind: "check", title: "Result check", status: "succeeded", text: "The result was judged to answer the request." } };
    expect(outputsOf(activityActionOf(started))).toEqual(["result_check", "", "working", ""]);
    expect(outputsOf(activityActionOf(ended))).toEqual(["result_check", "", "done", ""]);
  });

  it("keeps a build's dry run and its completion check as a test run", () => {
    expect(activityActionOf({ phase: "verifying", detail: { kind: "check", title: "Completion check", status: "started" } })?.kind).toBe("test");
    expect(activityActionOf(tool("Working on the page", undefined, "succeeded", "core.dry_run"))?.kind).toBe("test");
  });

  // 00020 (`S/0090`): a press refused because the call named no handle read
  // "Didn't work: it wasn't on the page". Nothing was looked up.
  it("lets a refusal's own reason say why it failed, before its code's words", () => {
    const refused = tool("Clicking “Add to cart”", "Result: web.action.rejected.target_unobserved · Reason: target_not_a_handle · Node: web.output.dom-click");
    expect(outputsOf(activityActionOf(refused))).toEqual(["click", "Add to cart", "failed", "FluxIQ didn't send it, as the step didn't say which control on the page to use"]);
    // A reason with no words of its own leaves the code to say it.
    const unknown = tool("Clicking “Add to cart”", "Result: web.target.not_found · Reason: vendor_specific_thing · Node: web.output.dom-click");
    expect(activityActionOf(unknown)?.why).toBe("it wasn't on the page");
  });

  // 00019, 00020: the navigate card read "Open page" with no page named.
  it("names the page a navigate opens, by its address path or as the home page", () => {
    expect(outputsOf(activityActionOf(tool("Opening “/ip/valueridge-napkins”", "Node: web.output.browser-navigate", "started")))).toEqual(["navigate", "/ip/valueridge-napkins", "working", ""]);
    expect(activityActionOf(tool("Opening “/help/index.html”", "Node: web.output.browser-navigate"))?.target).toBe("/help/index.html");
    expect(activityActionOf(tool("Opening “Home page”", "Node: web.output.browser-navigate"))?.target).toBe("Home page");
    // t174-w108/w116 D2: the navigate wording names a site ("Opening “amazon.com”") or the start page, unquoted.
    expect(activityActionOf(tool("Opening “amazon.com”", "Node: web.output.browser-navigate"))?.target).toBe("amazon.com");
    expect(activityActionOf(tool("Opening “shop.example.co.uk”", "Node: web.output.browser-navigate"))?.target).toBe("shop.example.co.uk");
    expect(activityActionOf(tool("Opening the start page", "Node: web.output.browser-navigate"))?.target).toBe("the start page");
    // A site name is a target only on a navigate, and a dotted id is still never one.
    expect(activityActionOf(tool("Clicking “amazon.com”", "Node: web.output.dom-click"))?.target).toBeNull();
    expect(activityActionOf(tool("Opening “web.output.browser-navigate”", "Node: web.output.browser-navigate"))?.target).toBeNull();
    // An address path is shown only on a navigate: a click's quoted id stays hidden.
    expect(activityActionOf(tool("Clicking “/web.output.dom-click”", "Node: web.output.dom-click"))?.target).toBeNull();
  });
});

// t174-w85 (run-murwd8le-79e735a8, UI review t174-w81): cards that said nothing
// a person could use, and a verdict that contradicted the page.
describe("activityActionOf: a test run's steps name their action (D4)", () => {
  // 00011, 00014: every step of the build's test read "Test run · ×" or "Test run ·
  // Autumn Mega Sale: up to 70…" (the search box's placeholder, not what was typed).
  it("reads a dry run's step by its verb and target, marked as part of a test", () => {
    const pressed = activityActionOf(tool("Clicking “×”", "Result: core.replay.replayed · Node: web.output.dom-click", "succeeded", RUN_NODE, "verifying"));
    expect(pressed).toEqual({ kind: "click", target: "×", outcome: "done", why: null, testing: true });
    const typed = activityActionOf(tool('Typing "Voltbay USB-C hub" into “Autumn Mega Sale: up to 70% off”', "Node: web.output.fill-field", "started", RUN_NODE, "verifying"));
    expect(typed).toEqual({ kind: "type", target: '"Voltbay USB-C hub" into Autumn Mega Sale: up to 70% off', outcome: "working", why: null, testing: true });
  });

  it("keeps a test step it cannot name, the reset and the completion check as a test run, and marks no other row", () => {
    expect(activityActionOf(tool("Working on the page", undefined, "succeeded", RUN_NODE, "verifying"))?.kind).toBe("test");
    expect(activityActionOf({ phase: "verifying", detail: { kind: "check", title: "Completion check", status: "started" } })).not.toHaveProperty("testing");
    expect(activityActionOf(tool("Clicking “×”", "Node: web.output.dom-click"))).not.toHaveProperty("testing");
  });

  it("names what a test typed, in its quotes, and leaves a build's typed words to the decision above its card", () => {
    expect(activityActionOf(tool('Typing "3"', "Node: web.output.fill-field", "succeeded", RUN_NODE, "verifying"))?.target).toBe('"3"');
    expect(activityActionOf(tool("Typing into “Quantity”", "Node: web.output.fill-field", "succeeded", RUN_NODE, "verifying"))?.target).toBe("Quantity");
    expect(activityActionOf(tool('Typing "3" into “Quantity”', "Node: web.output.fill-field"))?.target).toBe("Quantity");
  });
});

describe("activityActionOf: a look says what it looked at (D5)", () => {
  // 00010, 00011: "Look · Done" under "Looking over the whole page".
  it("names a look by what its title says it looked over, at or for", () => {
    expect(activityActionOf(tool("Looking over the whole page", undefined, "succeeded", "web.capture_snapshot"))?.target).toBe("the whole page");
    expect(activityActionOf(tool("Looking for the repeating list on the page", undefined, "succeeded", "web.detect_repeating_structure"))?.target).toBe("the repeating list on the page");
  });

  it("never names a look by the bare page, an id, or anything but a look", () => {
    expect(activityActionOf(tool("Looking at the page", undefined, "succeeded", "web.capture_snapshot"))?.target).toBeNull();
    expect(activityActionOf(tool("Looking at web.output.x", undefined, "succeeded", "web.capture_snapshot"))?.target).toBeNull();
    expect(activityActionOf(tool("Looking again at what an earlier step found", "Result: core.recall.succeeded", "succeeded", "core.recall_result"))?.target).toBeNull();
  });
});

describe("activityActionOf: a result check that could not confirm (D1)", () => {
  const ended = (label: string, status: "succeeded" | "failed"): ActivityActionEvent => ({ phase: "verifying", label, detail: { kind: "check", title: "Result check", status, text: "Two checks disagreed." } });

  // 00019, 00021: an unverified result read "Check result · Didn't pass" in red, on a run that met the task.
  it("reads a check that could not confirm the result, or could not run, as unconfirmed, never a plain failure", () => {
    expect(activityActionOf(ended(ACTIVITY_RESULT_CHECK_LABELS.unconfirmed, "failed"))).toEqual({ kind: "result_check", target: null, outcome: "failed", why: null, unconfirmed: true });
    expect(activityActionOf(ended(ACTIVITY_RESULT_CHECK_LABELS.unchecked, "failed"))).toMatchObject({ outcome: "failed", unconfirmed: true });
  });

  it("keeps a refuted result a failure and an answered one a pass", () => {
    expect(activityActionOf(ended(ACTIVITY_RESULT_CHECK_LABELS.refuted, "failed"))).toEqual({ kind: "result_check", target: null, outcome: "failed", why: null });
    expect(activityActionOf(ended(ACTIVITY_RESULT_CHECK_LABELS.answers, "succeeded"))).toEqual({ kind: "result_check", target: null, outcome: "done", why: null });
    expect(activityActionOf({ ...ended(ACTIVITY_RESULT_CHECK_LABELS.unconfirmed, "failed"), detail: { kind: "check", title: "Completion check", status: "failed" } })).not.toHaveProperty("unconfirmed");
  });
});

// t193 1002-M (`run-murzln6g-11debe1d`, C10): a test step the test only
// checked, one already done on the site, and one the Flow passes over all read
// "Done" or "Didn't work: it didn't work the same way again". Merged with
// t174-w85 D4 (2026-10-03): the step is named by its action and marked
// `testing`, and `tested` says what the test did with it. The completion check
// is a note with no card (t174-w88), so it has no kind or words of its own here.
describe("activityActionOf: what a test of the Flow did with each step (C10)", () => {
  const dry = (code: string, extra = "", title = "Clicking “Add to cart”", node = "web.output.dom-click") => tool(title, `Result: ${code}${extra} · Node: ${node}`, "succeeded", RUN_NODE, "verifying");

  it("says a step checked and not pressed, and one already done on the site, and nothing more for one done again", () => {
    expect(activityActionOf(dry("core.replay.verified"))).toMatchObject({ kind: "click", testing: true, outcome: "done", why: null, tested: "Checked, not pressed" });
    expect(activityActionOf(dry("core.replay.verified", "", "Typing “towels” into “Search”", "web.output.fill-field"))?.tested).toBe("Checked, not typed");
    expect(activityActionOf(dry("core.replay.present"))?.tested).toBe("Already done on the site");
    expect(activityActionOf(dry("core.replay.remembered"))?.tested).toBe("Already done on the site");
    expect(activityActionOf(dry("core.replay.replayed"))).not.toHaveProperty("tested");
  });

  it("says a step the Flow passes over as skipped, with why, never as a failure", () => {
    expect(activityActionOf(dry("core.replay.failed", " · Excused: interruption"))).toMatchObject({ kind: "click", testing: true, outcome: "done", why: null, tested: "Skipped: not there, optional" });
    expect(activityActionOf(dry("core.replay.failed", " · Excused: optional"))?.tested).toBe("Skipped: not there, optional");
    expect(activityActionOf(dry("core.replay.unreproducible", " · Excused: withheld"))?.tested).toBe("Skipped: it needed a step the test only checked");
    expect(activityActionOf(dry("core.replay.failed", " · Excused: repeat"))?.tested).toBe("Skipped: the test reached no rows for it to repeat over");
    // A conditional or fallback step still only runs sometimes (U11 of `run-muwao5n4-44977b2a`: a repeat is not one).
    expect(activityActionOf(dry("core.replay.failed", " · Excused: only_if"))?.tested).toBe("Skipped: it only runs sometimes");
    // Not excused, it is still a step that did not hold.
    expect(activityActionOf(dry("core.replay.failed"))).toMatchObject({ outcome: "failed", why: "it couldn't run when the test tried it again" });
    expect(activityActionOf(dry("core.replay.failed"))).not.toHaveProperty("tested");
  });

  it("gives a test step it cannot name its words by the verb of its title, and the completion check none", () => {
    expect(activityActionOf(tool("Typing “towels”", "Result: core.replay.verified", "succeeded", RUN_NODE, "verifying"))).toMatchObject({ outcome: "done", tested: "Checked, not typed" });
    expect(activityActionOf({ phase: "verifying", detail: { kind: "note", title: "Completion check", status: "succeeded" } })).not.toHaveProperty("tested");
  });
});

// U-1 (`run-muw60j7c-bb7c9a62`, moments 04-12): every read card said a bare
// "Done", and a run's "Records saved" line no count, while the overlay said
// "Saved 20 records". U2 (`run-muw60unq-591e23bd`): "Edit the Flow · Done".
describe("activityActionOf: what a finished action came to (result)", () => {
  it("says how many rows a list read kept, and from how many pages when its record says", () => {
    const read = (text: string, status: "started" | "succeeded" = "succeeded") => activityActionOf(tool("Reading the list of “name, price and rating”", text, status, RUN_NODE, "verifying"));
    expect(read("Result: core.replay.replayed · Rows: 13 · Pages: 5 · Node: web.output.dom-extract_list")?.result).toBe("13 rows from 5 pages");
    expect(read("Result: core.replay.replayed · Rows: 1 · Node: web.output.dom-extract_list")?.result).toBe("1 row");
    expect(read("Result: core.replay.replayed · Node: web.output.dom-extract_list")).not.toHaveProperty("result");
    expect(read("Rows: 13 · Node: web.output.dom-extract_list", "started")).not.toHaveProperty("result");
    // A count on a row that is no read is not its result.
    expect(activityActionOf(tool("Clicking “Confirm”", "Result: web.action.succeeded · Rows: 3 · Node: web.output.dom-click"))).not.toHaveProperty("result");
  });

  it("says how many records a run saved, from Core's status sentence", () => {
    const saved = activityActionOf({ phase: "extracting", label: "Saved 20 records", detail: { kind: "step", title: "Records saved", status: "succeeded", ref: "node-7" } });
    expect(saved?.result).toBe("20 records saved");
    expect(activityActionOf({ phase: "extracting", label: "Saved 1 record", detail: { kind: "step", title: "Records saved", status: "succeeded", ref: "node-7" } })?.result).toBe("1 record saved");
    expect(activityActionOf({ phase: "extracting", label: "Saved some", detail: { kind: "step", title: "Records saved", status: "succeeded", ref: "node-7" } })).not.toHaveProperty("result");
  });

  it("says what an edit changed, from its record's words, only when it changed something", () => {
    const edit = (text: string, status: "succeeded" | "failed" = "succeeded") => activityActionOf(tool("Editing the Flow", text, status, "core.flow_draft", "building"));
    expect(edit("Changed: removed step 9, Add to cart")).toMatchObject({ kind: "draft", outcome: "done", result: "removed step 9, Add to cart" });
    expect(edit("Result: llm_evidence_loop.draft_amendments_refused · Reason: already_out", "failed")).not.toHaveProperty("result");
  });
});

// Live run `run-muwansvz-a2b4a987` (UI review round 2): R2-U-1, the build
// test's check card read "Check result / Didn't pass" with no count and no
// reason while the read above it said "Done: 82 rows"; R2-U-6, a list read
// Core never sent read "Didn't work: it wasn't on the page".
describe("activityActionOf: a refuted check says how many rows and why (R2-U-1)", () => {
  const check = (text: string, label: string = ACTIVITY_RESULT_CHECK_LABELS.refuted): ActivityActionEvent => ({ phase: "verifying", label, detail: { kind: "check", title: "Result check", status: "failed", text } });
  const VERDICT = "The result was judged not to answer the request the Flow was built for, twice and with the same evidence.";

  it("says the rows that would be stored, but why they did not pass, in one plain clause", () => {
    const text = `82 rows would be stored. ${VERDICT} It looked for: Every pair rated 4 or more (e.g. the first ones). What it found: A step kept 82 rows from 5 pages with no filtering: it includes ads (e.g. Item One, Item Two), and repeats. Stored rows include accessories.`;
    expect(activityActionOf(check(text))?.why).toBe("82 rows would be stored, but a step kept 82 rows from 5 pages with no filtering");
    expect(activityActionOf(check(`13 rows came back. ${VERDICT} What it found: Only the first page was read.`))?.why).toBe("13 rows came back, but only the first page was read");
    expect(activityActionOf(check(`1 row would be stored. ${VERDICT}`))?.why).toBe("1 row would be stored, but the check found it doesn't answer what you asked");
  });

  it("never cuts the clause inside an aside, nor glues on the next sentence", () => {
    const cut = `82 rows would be stored. ${VERDICT} What it found: Stored rows include sponsored items (e.g. Item One, Item Two…`;
    const why = activityActionOf(check(cut))?.why;
    expect(why).toBe("82 rows would be stored, but stored rows include sponsored items");
    expect(why).not.toMatch(/\(|e\.g\./u);
  });

  it("leaves a check with no count and no finding to Core's own sentence, and an unconfirmed one alone", () => {
    expect(activityActionOf(check("Two checks disagreed."))?.why).toBeNull();
    expect(activityActionOf(check(`82 rows would be stored. ${VERDICT}`, ACTIVITY_RESULT_CHECK_LABELS.unconfirmed))).toMatchObject({ why: null, unconfirmed: true });
    expect(activityActionOf({ ...check(`82 rows would be stored. ${VERDICT}`, ACTIVITY_RESULT_CHECK_LABELS.answers), detail: { kind: "check", title: "Result check", status: "succeeded", text: "82 rows would be stored." } })?.why).toBeNull();
  });
});

describe("activityActionOf: a list read Core never sent (R2-U-6)", () => {
  const read = (reason: string) => activityActionOf(tool("Reading the list of “name, price and 4 more”", `Result: web.action.rejected.target_unobserved · Reason: ${reason} · Node: web.output.dom-extract_list`));

  it("says it was not read, and why, never that the list wasn't on the page", () => {
    expect(read("malformed_handle")).toMatchObject({ kind: "read", target: "name, price and 4 more", outcome: "failed", why: "FluxIQ didn't read it, as the step didn't say which list on the page to read" });
    expect(read("answered_the_same_again")?.why).toBe("FluxIQ didn't read it, for the same reason as the time before");
    expect(activityActionOf(tool("Reading the list", "Result: web.action.rejected.target_unobserved · Node: web.output.dom-extract_list"))?.why).not.toMatch(/wasn't on the page/u);
  });
});

// U1 (`run-muw6144a-e56f945d`): "Testing: Click · Confirm — Checked, not pressed" three times, identical.
describe("activityActionOf: a pass of a repeated test step names its row", () => {
  it("puts the row Core names after the step's own target", () => {
    const pass = activityActionOf(tool("Clicking “Confirm” for “Jonas Weber”", "Result: core.replay.verified · Node: web.output.dom-click", "succeeded", RUN_NODE, "verifying"));
    expect(pass).toMatchObject({ kind: "click", target: "Confirm · Jonas Weber", outcome: "done", tested: "Checked, not pressed", testing: true });
    const typed = activityActionOf(tool('Typing "hi" into “Message” for “Lin Zhao”', "Result: core.replay.replayed · Node: web.output.dom-type", "succeeded", RUN_NODE, "verifying"));
    expect(typed?.target).toBe('"hi" into Message · Lin Zhao');
    expect(activityActionOf(tool("Clicking on the page for “Lin Zhao”", "Node: web.output.dom-click", "started", RUN_NODE, "verifying"))?.target).toBe("Lin Zhao");
    // Only a test's step: a build's own title is read as it stands.
    expect(activityActionOf(tool("Clicking “Confirm” for “Jonas Weber”", "Node: web.output.dom-click"))?.target).toBe("Confirm");
  });
});
