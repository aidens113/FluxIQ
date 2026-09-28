import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_PIN_GATED_CONSEQUENCES,
  automationStudioActionRequiresPin
} from "../authorization-policy";

const featureRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Every file in Automation Studio that is still allowed to put an authorization
 * prompt in front of the person, and the number of prompts it may hold.
 *
 * This is a ratchet, not a list of approvals. A file not named here may hold
 * none. A file named here may hold fewer than its budget at any time, and
 * lowering a number is always welcome; raising one, or adding a file, fails the
 * build. That is the whole point: this rule has been restated and re-broken
 * repeatedly, and written guidance did not hold it.
 *
 * The line is the product owner's: only a genuinely irreversible real-world
 * consequence may ask - deleting something, or money moving. FluxIQ Core draws
 * the same line server side, where `GlobalProgramApiRegistry` PIN-checks only
 * endpoints registered `classification: "destructive"`. A prompt in front of an
 * `authoring` endpoint is asking for a credential the server never reads.
 */
const AUTHORIZATION_PROMPT_BUDGET: Readonly<Record<string, number>> = {
  // Deleting a project or a category. Core: `delete-project`,
  // `delete-project-category`, both `destructive`.
  "hierarchy/ProjectModal.tsx": 1,
  // Deleting a Flow, Subflow or folder. Core: `delete-flow`,
  // `delete-flow-subflow`, both `destructive`.
  "hierarchy/AutomationHierarchyDialog.tsx": 1,
  // Deleting a recording. Core: `delete-recording`, `destructive`.
  "recordings/RecordingActionDialog.tsx": 1,
  // Deleting a reusable part. Core: `delete-flow-subflow`, `destructive`. The
  // same view's rename, duplicate, enable, disable and archive reach
  // `authoring` endpoints and no longer ask.
  "subflows/SubflowsView.tsx": 1,
  // Deleting a route group. Core: `delete-flow-map-route-group`,
  // `destructive`. Saving a route, a group or a fallback, deleting a route and
  // mutating one are all `authoring` and no longer ask.
  "router/RouterContentView.tsx": 1
};

/**
 * Files that held a prompt while the three concurrent UX workstreams were in
 * flight and hold none now. Naming them keeps the win from being quietly undone
 * by a file re-entering the budget: `AUTHORIZATION_PROMPT_BUDGET` alone would
 * accept that, since a new entry only has to be written down.
 */
const CONVERTED_AWAY_FROM_PROMPTS = ["adaptations/AdaptationsView.tsx"];

/**
 * What an authorization prompt looks like in this codebase: a labelled PIN
 * field. Matching the label rather than the wire field is deliberate - passing
 * `authorizationPin: ""` to a command is harmless plumbing, while putting a PIN
 * box in front of a person is the defect.
 */
const PROMPT_PATTERN = /label=(?:"(?:Security )?PIN"|\{`?(?:Security )?PIN)/g;

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      found.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.test\.tsx?$/.test(entry.name)) continue;
    found.push(full);
  }
  return found;
}

function promptCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of sourceFiles(featureRoot)) {
    const matches = readFileSync(file, "utf8").match(PROMPT_PATTERN);
    if (!matches?.length) continue;
    counts.set(relative(featureRoot, file).split(sep).join("/"), matches.length);
  }
  return counts;
}

describe("Automation Studio authorization policy", () => {
  it("gates only irreversible consequences", () => {
    expect([...AUTOMATION_STUDIO_PIN_GATED_CONSEQUENCES]).toEqual(["delete", "checkout", "payment"]);
    expect(automationStudioActionRequiresPin("delete")).toBe(true);
    expect(automationStudioActionRequiresPin("checkout")).toBe(true);
    expect(automationStudioActionRequiresPin("payment")).toBe(true);
    expect(automationStudioActionRequiresPin("routine")).toBe(false);
  });

  it("never asks a person to authorize routine work", () => {
    const counts = promptCounts();
    const unbudgeted = [...counts.keys()].filter((file) => !(file in AUTHORIZATION_PROMPT_BUDGET)).sort();

    expect(
      unbudgeted,
      "These files ask for a security PIN and are not allowed to. Saving, renaming, editing, "
      + "re-running and every other ordinary operation is the automation doing the job it was asked "
      + "for; only deleting, checking out and paying may ask. Remove the prompt rather than adding "
      + "the file to AUTHORIZATION_PROMPT_BUDGET."
    ).toEqual([]);
  });

  it("never lets a budgeted file grow another prompt", () => {
    const counts = promptCounts();
    for (const [file, budget] of Object.entries(AUTHORIZATION_PROMPT_BUDGET)) {
      expect(counts.get(file) ?? 0, `${file} may hold at most ${budget} authorization prompt(s)`).toBeLessThanOrEqual(budget);
    }
  });

  it("keeps the saves, creates and renames this repair removed free of prompts", () => {
    const counts = promptCounts();
    const mustStayFree = [
      "workspace/shell/WorkspaceHeader.tsx",
      "workspace/DirtyViewGuard.tsx",
      "settings/FlowSettingsView.tsx",
      "settings/SubflowSettingsView.tsx",
      "instructions/InstructionsView.tsx",
      "recordings/RecordingTimelineView.tsx",
      ...CONVERTED_AWAY_FROM_PROMPTS
    ];
    for (const file of mustStayFree) {
      expect(counts.get(file) ?? 0, `${file} must not ask for a PIN to save`).toBe(0);
    }
    for (const file of CONVERTED_AWAY_FROM_PROMPTS) {
      expect(
        file in AUTHORIZATION_PROMPT_BUDGET,
        `${file} reached zero prompts; it must not be given a budget again`
      ).toBe(false);
    }
  });

  it("budgets a prompt only where Core registers the endpoint destructive", () => {
    // The panel's line has to be Core's line, or the prompt is asking for a
    // credential the server never reads. Each budgeted file guards exactly one
    // delete, and `_shared/api.ts` PIN-checks exactly `classification:
    // "destructive"`.
    expect(Object.keys(AUTHORIZATION_PROMPT_BUDGET).sort()).toEqual([
      "hierarchy/AutomationHierarchyDialog.tsx",
      "hierarchy/ProjectModal.tsx",
      "recordings/RecordingActionDialog.tsx",
      "router/RouterContentView.tsx",
      "subflows/SubflowsView.tsx"
    ]);
    for (const budget of Object.values(AUTHORIZATION_PROMPT_BUDGET)) expect(budget).toBe(1);
  });
});
