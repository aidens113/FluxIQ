// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowCandidate } from "../../../../../runtime/flow-authoring/bootstrap/candidate/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../../../persistence/automation/index.ts";
import { AutomationStudioProjectParts, type AutomationStudioProjectPartsPorts } from "../index.ts";

// A saved answer-first draft's parts go to the library at once, unproven and read-only here, and never
// change the attempt's outcome: a library that cannot be written is told by the error's name.
const PROJECT = "project.draft";

function draftPlan(consequences: string[] = []): AutomationStudioFlowCandidate["buildPlan"] {
  const lookup = {
    key: "lookup",
    name: "Look an item up",
    role: "utility" as const,
    nodes: [
      { key: "s1", definitionId: "domain.demo.open", definitionVersion: "1.0.0", parameters: { url: "https://shop.example/catalogue" }, consequences: [] },
      { key: "s2", definitionId: "domain.demo.click", definitionVersion: "1.0.0", parameters: { target: { kind: "element", fingerprint: { id: "go" } } }, consequences }
    ],
    edges: [{ key: "e1", source: { nodeKey: "s1", portId: "success" }, target: { nodeKey: "s2", portId: "in" } }]
  };
  const main = { key: "main", name: "Main", role: "primary" as const, nodes: [{ key: "m1", definitionId: "domain.demo.open", definitionVersion: "1.0.0", parameters: { url: "https://shop.example/" }, consequences: [] }], edges: [] };
  const withPositions = (entry: typeof lookup | typeof main) => ({ ...entry, nodes: entry.nodes.map((node, index) => ({ ...node, position: { x: index * 240, y: 0 } })) });
  return {
    plan: { schemaVersion: "0.1", router: { name: "route", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } }, subflows: [main, lookup] },
    risk: "low",
    subflows: [withPositions(main), withPositions(lookup)]
  } as unknown as AutomationStudioFlowCandidate["buildPlan"];
}

describe("the parts of a saved draft", () => {
  let rootDir = "";
  let pool: AutomationStudioProjectDatabasePool;
  let parts: AutomationStudioProjectParts;
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-draft-parts-test-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
    parts = new AutomationStudioProjectParts({ pool, ports: {} as unknown as AutomationStudioProjectPartsPorts });
  });
  afterEach(async () => {
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true });
  });

  const input = (more: Partial<Parameters<AutomationStudioProjectParts["saveDraft"]>[0]> = {}) => ({
    projectId: PROJECT, flowId: "flow.main", candidateId: "candidate.one", buildPlan: draftPlan(), instructionIds: ["instruction.one"], instructionText: "look the item up", ...more
  });

  it("keeps a draft's non-primary part, unproven, and finds it for the next attempt", async () => {
    const saved = await parts.saveDraft(input());
    expect(saved?.saved).toHaveLength(1);
    expect(saved?.skipped.map((skip) => skip.reason)).toEqual(["part.primary_not_explicit"]);
    expect(saved?.failed).toBeUndefined();
    const listed = await parts.list({ projectId: PROJECT });
    expect("parts" in listed && listed.parts.map((card) => [card.name, card.sites, card.lastingClasses, card.trust.tier])).toEqual([["Look an item up", ["https://shop.example"], [], "unproven"]]);
    expect((await parts.shortlist({ projectId: PROJECT, requestWords: "look an item up", askedClasses: [] }))?.parts.map((part) => part.name)).toEqual(["Look an item up"]);
    // The same draft again is the same part, once.
    expect((await parts.saveDraft(input({ candidateId: "candidate.two" })))?.saved[0]).toMatchObject({ status: "existing" });
  });

  it("holds a lasting part to what was asked, as any save does", async () => {
    expect((await parts.saveDraft(input({ buildPlan: draftPlan(["create_new"]), instructionText: "look it up" })))?.saved).toHaveLength(1);
    const offered = await parts.shortlist({ projectId: PROJECT, requestWords: "look an item up", askedClasses: ["create_new"] });
    expect(offered).toBeUndefined();
  });

  it("reports a library that cannot be written by the error's name, and a project with no library as nothing", async () => {
    const broken = new AutomationStudioProjectParts({ pool: { acquire: async () => { throw new TypeError("disk gone"); } } as unknown as AutomationStudioProjectDatabasePool, ports: {} as unknown as AutomationStudioProjectPartsPorts });
    expect(await broken.saveDraft(input())).toEqual({ saved: [], skipped: [], failed: "TypeError" });
    expect(await new AutomationStudioProjectParts({ pool: undefined, ports: {} as unknown as AutomationStudioProjectPartsPorts }).saveDraft(input())).toBeUndefined();
    expect(await broken.shortlist({ projectId: PROJECT, requestWords: "anything", askedClasses: [] })).toBeUndefined();
  });
});
