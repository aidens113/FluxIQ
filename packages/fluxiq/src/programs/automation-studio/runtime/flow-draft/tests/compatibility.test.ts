import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as canonical from "../../../../../runtime/flow-authoring/draft/index.ts";
import * as permissions from "../../../../../runtime/action-permissions/index.ts";
import * as legacyPermissions from "../../action-permissions/index.ts";
import * as legacy from "../index.ts";

const step = (over: Partial<canonical.AutomationStudioFlowDraftStep> = {}): canonical.AutomationStudioFlowDraftStep => ({
  position: 1, id: "d1", iteration: 1, callId: "call.1", actionId: "fixture.act",
  input: { node: "fixture.act", parameters: { text: "shown" } },
  effect: "mutate", effectApplied: true, disposition: "kept", ...over
});
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("legacy draft compatibility", () => {
  it("preserves every pure public implementation identity", () => {
    const presented = new Set(["automationStudioFlowDraftEntry", "automationStudioFlowDraftDryRunFeedback", "automationStudioFlowDraftFullRunRequiredFeedback", "automationStudioFlowDraftExcusedWords", "AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA"]);
    const neutral: Readonly<Record<string, unknown>> = canonical;
    for (const [name, value] of Object.entries(legacy)) {
      if (!presented.has(name)) expect(value, name).toBe(neutral[name]);
    }
    expect(legacyPermissions.AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES).toBe(permissions.AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES);
    expect(legacyPermissions.automationStudioDestructiveConsequences).toBe(permissions.automationStudioDestructiveConsequences);
    expect(legacyPermissions.isAutomationStudioDestructiveActionConsequence).toBe(permissions.isAutomationStudioDestructiveActionConsequence);
  });

  it("keeps complete entry projections and instruction bytes from before the move", () => {
    const cases: Parameters<typeof legacy.automationStudioFlowDraftEntry>[0][] = [];
    const routes: Array<canonical.AutomationStudioFlowDraftRoute | undefined> = [undefined, { state: "open" }, { state: "named", quote: "first then second", places: ["first", "second"] }];
    for (const authored of [false, true]) {
      for (const route of routes) {
        for (const feature of ["plain", "bindable", "replaced", "checked"]) {
          const base = step(feature === "bindable"
            ? { ranWith: { node: "fixture.act", parameters: { text: "shown", private: "unpublished" } } }
            : feature === "checked"
              ? { effectApplied: false, checkedCandidate: { callId: "check", code: "core.replay.present" }, priorExecution: { ...step(), lasting: true } }
              : {});
          const steps = feature === "replaced" ? [base, step({ position: 2, id: "old", replacedBy: "d1", disposition: "dropped" })] : [base];
          cases.push({ steps, authored, acts: [{ id: "a1", text: "requested act" }], ...(route ? { route } : {}) });
        }
      }
    }
    cases.push({ steps: [], acts: [] }, { steps: [] });
    expect(hash(cases.map((input) => legacy.automationStudioFlowDraftEntry(input)))).toBe("1e990e61c50473a42c84b23406a779af2c0d957124728e7526096fe1b1704512");
  });

  it("keeps all full-run refusal projection and instruction bytes", () => {
    const words: canonical.AutomationStudioFlowDraftUnrunnableWord[] = ["not_run_in_this_build", "cannot_run_again", "not_a_library_step", "not_reached"];
    const steps = words.map((word, index) => ({ position: index + 1, actionId: "fixture.act", word }));
    const outputs = [[], steps].map((input) => legacy.automationStudioFlowDraftFullRunRequiredFeedback(input));
    expect(hash(outputs)).toBe("e07c0660cff76d3ac23b675cbc8f0cd3a117aa2b212c2766c9f70c47692a43a5");
  });

  it("keeps complete amendment schema and description bytes from before the move", () => {
    expect(hash(legacy.AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA)).toBe("d29b78d4151bf3881dd4a7c33c5ae4c5c1b6f6c9e7f6e52b13d953a2bd19aa47");
    expect(JSON.stringify(canonical.AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA)).not.toContain("description");
  });

  it("keeps each withdrawal explanation's complete projection and wording bytes", () => {
    const cases = [
      [step({ disposition: "dropped", cancels: "missing" })],
      [step({ disposition: "dropped", cancels: "d2" }), step({ position: 2, id: "d2", disposition: "dropped", toggle: { key: "control", to: "off" } })],
      [step({ disposition: "dropped", cancels: "d2" }), step({ position: 2, id: "d2", disposition: "dropped", cancels: "d1", toggle: { key: "control", to: "off" } })]
    ];
    expect(hash(cases.map((steps) => legacy.automationStudioFlowDraftEntry({ steps })))).toBe("2b345050bdc723f9847214f3095148527f02d5e34067812493d9adbe5be54eb4");
  });

  it("keeps replay feedback metadata and exact guidance bytes", () => {
    const statuses: canonical.AutomationStudioFlowDraftReplayStatus[] = ["failed", "changed", "unreproducible"];
    const outcomes: canonical.AutomationStudioFlowDraftReplayOutcome[] = statuses.map((status, index) => ({ step: index + 1, actionId: "fixture.act", status, resultCode: "fixture." + status, ...(index === 0 ? { excused: "optional" as const } : {}), ...(index === 1 ? { reanchored: true, withheldBy: 1 } : {}) }));
    const verdict = legacy.automationStudioFlowDraftDryRunVerdict({ attempt: 2, reset: "ok", outcomes });
    const output = legacy.automationStudioFlowDraftDryRunFeedback(verdict, new Set([legacy.automationStudioFlowDraftReplayOutcomeKey(outcomes[2]!)]), [step({ stateBefore: "before", stateAfter: "between", disposition: "taken" }), step({ position: 3, stateBefore: "between" })]);
    expect(hash(output)).toBe("ac8bfb2a7831f2e34bf925e6ef7608099095f3d566658afabc6634e46c2c803b");
  });

  it("keeps the exact words of every excused reason and outcome", () => {
    const reasons: canonical.AutomationStudioFlowDraftExcusedReason[] = ["interruption", "optional", "only_if", "check", "fallback", "repeat", "withheld"];
    const statuses: canonical.AutomationStudioFlowDraftReplayStatus[] = ["failed", "changed", "unreproducible", "replayed"];
    const outputs = reasons.flatMap((excused) => statuses.map((status) => legacy.automationStudioFlowDraftExcusedWords({ step: 1, actionId: "fixture.act", status, excused, withheldBy: 7 })));
    expect(hash(outputs)).toBe("873e1c6c5c1fda64a435819bd50705f3f6134b3ec9f3e5c73cbc20cb42426cd1");
  });
});
