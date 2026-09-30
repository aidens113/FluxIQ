// The registry holds together: one declaration, a handler on every capability,
// and an answer to "what can you do?" that nobody typed out by hand.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PANEL_CAPABILITIES,
  PANEL_CAPABILITY_ASKING_CONSEQUENCES,
  describePanelCapabilities,
  isPanelCapabilityQuestion,
  panelCapabilities,
  panelCapabilitiesByGroup,
  panelCapability,
  panelCapabilityAsksFirst,
  panelCapabilityIds,
  panelCapabilityVocabulary
} from "../index";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("every registered capability can be invoked from the conversation", () => {
  it("carries a handler, with no exceptions and no default", () => {
    // The type makes this a compile error, and this makes it an observed fact:
    // a capability whose `invoke` was lost to a bad merge would still type-check
    // against `PanelCapability` if the property were ever made optional.
    for (const capability of PANEL_CAPABILITIES) {
      expect(typeof capability.invoke, `${capability.id} has no handler.`).toBe("function");
      expect(capability.invoke.length, `${capability.id}'s handler must take the context and the arguments.`).toBe(2);
    }
  });

  it("answers to one id each", () => {
    expect(panelCapabilityIds()).toHaveLength(PANEL_CAPABILITIES.length);
    expect(new Set(panelCapabilityIds()).size).toBe(PANEL_CAPABILITIES.length);
  });

  it("says where the same thing is on screen", () => {
    for (const capability of PANEL_CAPABILITIES) {
      expect(capability.control.label.length, `${capability.id} does not say what its control is called.`).toBeGreaterThan(0);
      expect(capability.endpoints.length, `${capability.id} reaches no endpoint.`).toBeGreaterThan(0);
      expect(capability.phrases.length, `${capability.id} gives nothing for a person to say.`).toBeGreaterThan(1);
      expect(capability.summary.trim().endsWith("."), `${capability.id}'s summary should be a sentence.`).toBe(true);
    }
  });

  it("describes every argument it takes", () => {
    for (const capability of PANEL_CAPABILITIES) {
      for (const argument of capability.arguments) {
        expect(argument.describe.length, `${capability.id}.${argument.name} is undescribed.`).toBeGreaterThan(5);
      }
      const names = capability.arguments.map((argument) => argument.name);
      expect(new Set(names).size, `${capability.id} declares an argument twice.`).toBe(names.length);
    }
  });

  it("looks up by id, and answers null rather than guessing", () => {
    expect(panelCapability("run.execute")?.title).toBe("Run a Flow");
    expect(panelCapability("run.executee")).toBeNull();
  });
});

describe("only deleting and moving money stop for the person", () => {
  it("pins the classes that re-authorize to Core's own two", () => {
    // Widening this re-gates ordinary panel work, which is exactly what the
    // product owner ruled out: the person asking for the automation is the
    // grant. Core decides this in runtime/action-permissions/destructive.ts;
    // this is the browser's copy of that decision and must not drift from it.
    expect([...PANEL_CAPABILITY_ASKING_CONSEQUENCES]).toEqual(["move_money", "delete"]);
  });

  it("asks only where something is deleted", () => {
    // `permission.revokeClient` and `route.delete` asked until 2026-09-28. Core
    // classes both endpoints as authoring and never reads a PIN for them, and
    // `core-contract.test.ts` holds the catalog to Core's classification.
    const asking = PANEL_CAPABILITIES.filter(panelCapabilityAsksFirst).map((capability) => capability.id).sort();
    expect(asking).toEqual([
      "data.delete",
      "flow.delete",
      "project.delete",
      "recording.delete",
      "subflow.delete"
    ]);
  });

  it("never stops for editing, building, running or rolling back", () => {
    for (const id of ["flow.settings", "flow.build", "run.execute", "version.rollBack", "subflow.turnOn"]) {
      const capability = panelCapability(id);
      expect(capability, `${id} should exist.`).not.toBeNull();
      expect(panelCapabilityAsksFirst(capability!), `${id} must not ask a person for permission to do ordinary work.`).toBe(false);
    }
  });
});

describe("the model says what it can do from the registry", () => {
  it("offers exactly the registered capabilities and nothing beside them", () => {
    const vocabulary = panelCapabilityVocabulary();
    expect(vocabulary.map((entry) => entry.id)).toEqual(panelCapabilities().map((capability) => capability.id));
    expect(vocabulary.every((entry) => entry.summary.length > 0)).toBe(true);
  });

  it("builds the prose answer out of the catalog rather than a written list", () => {
    const prose = describePanelCapabilities();
    for (const capability of PANEL_CAPABILITIES) {
      expect(prose, `"what can you do?" left out ${capability.id}.`).toContain(capability.title);
    }
    for (const group of panelCapabilitiesByGroup().keys()) expect(prose).toContain(`**${group}**`);
    expect(prose).toContain(`I can do ${PANEL_CAPABILITIES.length} things`);

    // The count and the titles are read off the registry at call time. A
    // hardcoded answer is the failure this whole file exists to prevent, so the
    // module is held to having no capability names of its own in it.
    const answer = source("../answer.ts");
    for (const capability of PANEL_CAPABILITIES) expect(answer).not.toContain(capability.title);
  });

  it("knows the difference between being asked what it can do and being told to do it", () => {
    for (const asking of ["what can you do?", "help", "what else?", "which things can you do", "what are you able to do"]) {
      expect(isPanelCapabilityQuestion(asking), `"${asking}" is a question about the panel.`).toBe(true);
    }
    for (const telling of ["run the flow", "delete the recording", "change the retries to 5", "roll it back"]) {
      expect(isPanelCapabilityQuestion(telling), `"${telling}" is an instruction, not a question.`).toBe(false);
    }
  });
});
