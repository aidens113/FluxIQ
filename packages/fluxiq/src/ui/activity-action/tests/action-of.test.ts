import { describe, expect, it } from "vitest";
import { activityActionOf, type ActivityAction, type ActivityActionEvent, type ActivityActionKind } from "../index.ts";

const RUN_NODE = "core.run_node";
const DOTTED = /[A-Za-z_][\w-]*\.[A-Za-z_][\w-]*/u;

function tool(title: string, text?: string, status: "started" | "succeeded" | "failed" = "succeeded", ref = RUN_NODE, phase = "exploring"): ActivityActionEvent {
  return { phase, detail: { kind: "tool", title, status, ref, ...(text === undefined ? {} : { text }) } };
}

function outputsOf(action: ActivityAction | null): string[] {
  return action ? [action.kind, action.target ?? "", action.outcome, action.why ?? ""] : [];
}

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
    ["test", tool("Clicking “Next”", "Result: core.replay.replayed · Node: web.output.dom-click", "succeeded", RUN_NODE, "verifying")],
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
    ["a replay that changed", tool("Clicking “Next”", "Result: core.replay.changed", "succeeded", RUN_NODE, "verifying"), "failed", "it didn't work the same way again"],
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
