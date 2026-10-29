import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createGlobalProgramRuntime } from "../../../../programs/_shared/runtime.ts";
import {
  generateIamActionCatalog,
  iamActionsWithPermission,
  iamDestructiveActions,
  renderDestructiveActionsModule,
  renderIamActionCatalogModule,
  renderReadOnlyActionsModule
} from "../index.ts";

const REGENERATE = "set FLUXIQ_REGENERATE_IAM_CATALOG=1 and run `pnpm exec vitest run src/platform/iam/catalog` in packages/fluxiq to regenerate";
const readOnlyPath = new URL("../generated/read-only-actions.generated.ts", import.meta.url);
const catalogPath = new URL("../../../../../../contracts/src/iam/actions.generated.ts", import.meta.url);
const destructivePath = new URL("../generated/destructive-actions.generated.ts", import.meta.url);

describe("live program registry", () => {
  const endpoints = createGlobalProgramRuntime().api.endpoints();
  const generation = generateIamActionCatalog(endpoints);
  const readOnlyActions = iamActionsWithPermission(endpoints, "programs.read");
  const destructiveActions = iamDestructiveActions(endpoints);
  const catalogModule = renderIamActionCatalogModule(generation.catalog);
  const readOnly = renderReadOnlyActionsModule(readOnlyActions);
  const destructive = renderDestructiveActionsModule(destructiveActions);

  it("generates a valid catalog covering every registration", () => {
    const counts: Record<string, number> = {};
    for (const entry of generation.catalog) {
      const key = `${entry.action.split(":")[0]}/${entry.accessLevel}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    const report = { registrations: endpoints.length, actions: generation.catalog.length, shared: generation.sharedActions, undeclared: generation.undeclaredResources.length, readOnly: readOnlyActions.length, destructive: destructiveActions.length, counts };
    console.info(JSON.stringify(report));
    const merged = generation.sharedActions.reduce((sum, item) => sum + item.sources.length - 1, 0);
    expect(generation.catalog.length + merged).toBe(endpoints.length);
  });

  it("keeps the generated action lists current", () => {
    if (process.env.FLUXIQ_REGENERATE_IAM_CATALOG === "1") {
      writeFileSync(readOnlyPath, readOnly);
      writeFileSync(destructivePath, destructive);
      writeFileSync(catalogPath, catalogModule);
    }
    expect(readFileSync(readOnlyPath, "utf8"), `read-only-actions.generated.ts drifted: ${REGENERATE}`).toBe(readOnly);
    expect(readFileSync(destructivePath, "utf8"), `destructive-actions.generated.ts drifted: ${REGENERATE}`).toBe(destructive);
  });

  it("keeps the generated action catalog in the contracts package current", () => {
    expect(readFileSync(catalogPath, "utf8"), `actions.generated.ts drifted: ${REGENERATE}`).toBe(catalogModule);
  });
});
