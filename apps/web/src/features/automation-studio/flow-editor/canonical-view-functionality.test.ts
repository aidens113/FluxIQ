import { describe, expect, it } from "vitest";
import { adaptationsFunctionalityContract } from "../adaptations/functionality-contract";
import { clientsFunctionalityContract } from "../clients/functionality-contract";
import { inspectorFunctionalityContract } from "../inspector/functionality-contract";
import { instructionsFunctionalityContract } from "../instructions/functionality-contract";
import { problemsFunctionalityContract } from "../problems/functionality-contract";
import { recordingsFunctionalityContract } from "../recordings/functionality-contract";
import { routerFunctionalityContract } from "../router/functionality-contract";
import { runtimeFunctionalityContract } from "../runtime/functionality-contract";
import { settingsFunctionalityContract } from "../settings/functionality-contract";
import { stateFunctionalityContract } from "../state/functionality-contract";
import { subflowsFunctionalityContract } from "../subflows/functionality-contract";
import { flowEditorFunctionalityContract } from "./functionality-contract";

const contracts = [
  clientsFunctionalityContract,
  recordingsFunctionalityContract,
  flowEditorFunctionalityContract,
  routerFunctionalityContract,
  subflowsFunctionalityContract,
  instructionsFunctionalityContract,
  adaptationsFunctionalityContract,
  settingsFunctionalityContract,
  stateFunctionalityContract,
  runtimeFunctionalityContract,
  problemsFunctionalityContract,
  inspectorFunctionalityContract
] as const;

const requiredStates = ["loading", "empty", "error", "stale", "permission", "narrow", "warm"] as const;

describe("Phase 10G canonical view functionality contracts", () => {
  it("owns one complete behavior matrix for every canonical view", () => {
    expect(contracts.map((contract) => contract.canonicalViewId).sort()).toEqual([
      "adaptations",
      "client-gateway",
      "flow-instructions",
      "flow-nodes",
      "flow-router",
      "flow-settings",
      "flow-subflows",
      "global-inspector",
      "problems-view",
      "runtime-debug",
      "state-explorer",
      "timeline-recording"
    ]);

    for (const contract of contracts) {
      expect(contract.productPurpose.length).toBeGreaterThan(20);
      expect(contract.owningScope.length).toBeGreaterThan(0);
      expect(contract.data.requiredSummary.length).toBeGreaterThan(0);
      expect(contract.data.optionalDetail.length).toBeGreaterThan(0);
      expect(contract.data.cacheKeyParts.length).toBeGreaterThan(1);
      expect(contract.data.invalidationScopes.length).toBeGreaterThan(0);
      expect(contract.behaviorMatrix.map((row) => row.state)).toEqual(requiredStates);
      expect(contract.behaviorMatrix.every((row) => row.contract.length > 30)).toBe(true);
      expect(contract.selectionBehavior.length).toBeGreaterThan(30);
    }
  });

  it("requires bounded scale behavior and explicit warm, narrow, and raw-data policy", () => {
    for (const contract of contracts) {
      expect(contract.scale.strategy.length).toBeGreaterThan(5);
      expect(contract.scale.pageSize).toBeGreaterThan(0);
      expect(contract.scale.pageSize).toBeLessThanOrEqual(1_000);
      expect(contract.scale.mountedItemBudget).toBeGreaterThan(0);
      expect(contract.scale.mountedItemBudget).toBeLessThanOrEqual(1_000);
      expect(contract.scale.fixtureSize).toBeGreaterThanOrEqual(5_000);
      expect(contract.scale.modelBudgetMs).toBeGreaterThan(0);
      expect(contract.scale.modelBudgetMs).toBeLessThanOrEqual(50);
      expect(contract.narrowScreen.length).toBeGreaterThan(30);
      expect(contract.warmViewRestoration.length).toBeGreaterThan(30);
      expect(contract.rawDataAccess.defaultClosed).toBe(true);
      expect(contract.rawDataAccess.disclosure.length).toBeGreaterThan(30);
    }
  });

  it("requires pending behavior and confirmation for every destructive command", () => {
    for (const contract of contracts) {
      expect(contract.commands.length).toBeGreaterThan(0);
      for (const command of contract.commands) {
        expect(command.name.length).toBeGreaterThan(3);
        expect(command.pending.length).toBeGreaterThan(20);
        if (command.destructive) {
          expect("confirmation" in command ? command.confirmation.length : 0).toBeGreaterThan(20);
        }
      }
    }
  });

  it("separates automated evidence from exact browser-only certification", () => {
    for (const contract of contracts) {
      expect(contract.automatedEvidence.length).toBeGreaterThan(0);
      expect(new Set(contract.automatedEvidence).size).toBe(contract.automatedEvidence.length);
      expect(contract.browserOnlyCertification).toHaveLength(3);
      expect(contract.browserOnlyCertification.every((item) => item.length > 30)).toBe(true);
      expect(contract.accessibility.keyboard.length).toBeGreaterThan(30);
      expect(contract.accessibility.screenReader.length).toBeGreaterThan(30);
    }
  });
});
