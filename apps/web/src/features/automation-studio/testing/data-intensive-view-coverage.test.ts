import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { automationViewContracts } from "../views/view-contracts";
import type { AutomationStudioViewId } from "../views/view-registry";

type CoverageEvidence = { test: string; behavior: string };
type DocumentedException = { nonCollectionReason: string; test: string };
type RequiredCase = CoverageEvidence | DocumentedException;
const featureRoot = fileURLToPath(new URL("../", import.meta.url));

type ViewCoverage = {
  empty: RequiredCase;
  large: RequiredCase;
  loading?: RequiredCase;
  error?: RequiredCase;
  permission?: RequiredCase;
};

const coverage = {
  "client-gateway": {
    empty: { test: "clients/large-project-behavior.test.ts", behavior: "empty gateway snapshot" },
    large: { test: "clients/large-project-behavior.test.ts", behavior: "stable selection and bounded unique capability projection over 2,048 sessions" },
    loading: { test: "clients/active-poller.test.ts", behavior: "active-only poll lifecycle" },
    error: { nonCollectionReason: "Gateway errors are controller-owned and require a mounted client-effect harness.", test: "clients/active-poller.test.ts" },
    permission: { test: "clients/large-project-behavior.test.ts", behavior: "authorization failure propagation" }
  },
  "timeline-recording": {
    empty: { test: "recordings/large-project-behavior.test.tsx", behavior: "empty recording history" },
    large: { test: "recordings/large-project-behavior.test.tsx", behavior: "25-row list page and 200-event timeline window" },
    loading: { test: "recordings/large-project-behavior.test.tsx", behavior: "loading list state" },
    error: { test: "recordings/large-project-behavior.test.tsx", behavior: "retryable list error" },
    permission: { nonCollectionReason: "Recording viewing is read-only; protected repair/delete commands are separate mutation surfaces.", test: "recordings/large-project-behavior.test.tsx" }
  },
  "flow-nodes": {
    empty: { test: "flow-editor/large-project-behavior.test.ts", behavior: "empty graph editor state" },
    large: {
      test: "flow-editor/large-project-behavior.test.ts",
      behavior: "deterministic graph conversion over 2,048 spatial nodes"
    }
  },
  "flow-router": {
    empty: { test: "router/router-view.test.tsx", behavior: "empty Router guidance" },
    large: { test: "router/router-view.test.tsx", behavior: "100 mounted route rows" },
    loading: { test: "router/router-view.test.tsx", behavior: "initial loading state" },
    error: { test: "router/router-view.test.tsx", behavior: "retryable query failure" },
    permission: { test: "router/router-view.test.tsx", behavior: "authorized mutation modal" }
  },
  "flow-subflows": {
    empty: { test: "subflows/subflows-view.test.tsx", behavior: "empty directory guidance" },
    large: { test: "subflows/large-project-behavior.test.ts", behavior: "50-row SQL request cap over 2,048 Subflows" },
    loading: { nonCollectionReason: "Loading is effect-owned; the public model exposes URL/request state rather than injected loading state.", test: "subflows/subflows-view.test.tsx" },
    error: { test: "subflows/large-project-behavior.test.ts", behavior: "command failure propagation" },
    permission: { test: "subflows/large-project-behavior.test.ts", behavior: "delete permission failure propagation" }
  },
  "flow-instructions": {
    empty: { test: "instructions/instructions-view.test.tsx", behavior: "no-guidance readiness state" },
    large: { test: "instructions/large-project-behavior.test.ts", behavior: "50-row SQL page over 2,048 Instructions" },
    loading: { nonCollectionReason: "Loading is query-controller state and has no injectable public SSR prop.", test: "instructions/instructions-view.test.tsx" },
    error: { test: "instructions/large-project-behavior.test.ts", behavior: "mutation error propagation" },
    permission: { test: "instructions/large-project-behavior.test.ts", behavior: "manage permission failure propagation" }
  },
  adaptations: {
    empty: { test: "adaptations/large-project-behavior.test.tsx", behavior: "empty Flow scope" },
    large: { test: "adaptations/large-project-behavior.test.tsx", behavior: "50-field comparison cap over 2,048 Adaptations" },
    loading: { nonCollectionReason: "Loading is query-controller state and has no injectable public SSR prop.", test: "adaptations/adaptations-view.test.tsx" },
    error: { test: "adaptations/large-project-behavior.test.tsx", behavior: "review failure propagation" },
    permission: { test: "adaptations/large-project-behavior.test.tsx", behavior: "review permission failure propagation" }
  },
  "state-explorer": {
    empty: { test: "state/model/state-comparison.test.ts", behavior: "no state facts model" },
    large: { test: "state/state-isolation-contract.test.tsx", behavior: "100-row page over 10,000 facts" }
  },
  "runtime-debug": {
    empty: { test: "runtime/large-project-behavior.test.tsx", behavior: "empty run history" },
    large: { test: "runtime/large-project-behavior.test.tsx", behavior: "25-row SQL page over 2,048 Runs" },
    loading: { test: "runtime/large-project-behavior.test.tsx", behavior: "loading run history" },
    error: { test: "runtime/large-project-behavior.test.tsx", behavior: "retryable run-history error" },
    permission: { nonCollectionReason: "Run history is read-only; launch authorization belongs to the Run command surface.", test: "runtime/runtime.test.tsx" }
  },
  "problems-view": {
    empty: { test: "problems/problems-view.test.tsx", behavior: "no Problems state" },
    large: { test: "problems/problems-view.test.tsx", behavior: "100 mounted Problems rows" }
  }
} satisfies Partial<Record<AutomationStudioViewId, ViewCoverage>>;

const prioritizedLightViews = {
  "flow-settings": {
    empty: "settings/large-project-behavior.test.tsx",
    large: "settings/large-project-behavior.test.tsx",
    permission: "settings/large-project-behavior.test.tsx"
  },
  "global-inspector": {
    empty: "inspector/large-project-behavior.test.tsx",
    large: "inspector/large-project-behavior.test.tsx",
    permission: "Selection inspection is read-only and has no privileged command."
  }
} as const;

describe("Automation Studio data-intensive behavior coverage", () => {
  it("inventories every data-intensive canonical view", () => {
    const expected = Object.values(automationViewContracts)
      .filter((contract) => contract.dataIntensity !== "light")
      .map((contract) => contract.id)
      .sort();
    expect(Object.keys(coverage).sort()).toEqual(expected);
  });

  it("requires executable empty coverage and large coverage or a documented non-collection reason", () => {
    for (const [id, entry] of Object.entries(coverage) as [string, ViewCoverage][]) {
      expect(entry.empty.test, `${id} empty test`).toMatch(/\.test\.tsx?$/);
      expect(entry.large.test, `${id} large test`).toMatch(/\.test\.tsx?$/);
      if ("nonCollectionReason" in entry.large) {
        expect(entry.large.nonCollectionReason.length, `${id} large exception`).toBeGreaterThan(30);
      } else {
        expect(entry.large.behavior.length, `${id} large behavior`).toBeGreaterThan(15);
      }
    }
  });

  it("requires every recorded evidence path to resolve to an executable test", () => {
    const evidencePaths = new Set<string>();
    for (const entry of Object.values(coverage)) {
      for (const requirement of Object.values(entry as Record<string, RequiredCase | undefined>)) {
        if (requirement?.test) evidencePaths.add(requirement.test);
      }
    }
    for (const evidence of Object.values(prioritizedLightViews)) {
      for (const path of Object.values(evidence)) {
        if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) evidencePaths.add(path);
      }
    }

    for (const path of evidencePaths) {
      const absolutePath = resolve(featureRoot, path);
      expect(existsSync(absolutePath), path).toBe(true);
      expect(readFileSync(absolutePath, "utf8"), path).toMatch(/\b(?:it|test)\s*\(/u);
    }
  });
  it("records state/error/permission coverage for the prioritized operational views", () => {
    for (const id of ["client-gateway", "timeline-recording", "flow-router", "flow-subflows", "flow-instructions", "adaptations", "runtime-debug"] as const) {
      const entry = coverage[id];
      expect(entry.loading, `${id} loading`).toBeDefined();
      expect(entry.error, `${id} error`).toBeDefined();
      expect(entry.permission, `${id} permission`).toBeDefined();
    }
    expect(Object.keys(prioritizedLightViews).sort()).toEqual(["flow-settings", "global-inspector"]);
  });
});
