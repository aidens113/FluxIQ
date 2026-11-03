import { expect, it } from "vitest";
import * as canonical from "../../../../../../framework/persistence/project/execution-admission/index.ts";
import * as legacy0 from "../admission.ts";
import * as legacy1 from "../codec.ts";
import * as legacy2 from "../command-inventory.ts";
import * as legacy3 from "../command-link.ts";
import * as legacy4 from "../command-proof.ts";
import * as legacy5 from "../commands.ts";
import * as legacy6 from "../context.ts";
import * as legacy7 from "../event.ts";
import * as legacy8 from "../evidence.ts";
import * as legacy9 from "../finish.ts";
import * as legacy10 from "../index.ts";
import * as legacy11 from "../inventory.ts";
import * as legacy12 from "../migration.ts";
import * as legacy13 from "../mutation.ts";
import * as legacy14 from "../proof.ts";
import * as legacy15 from "../release.ts";
import * as legacy16 from "../rows.ts";
import * as legacy17 from "../scope.ts";
import * as legacy18 from "../snapshot.ts";
import * as legacy19 from "../state.ts";
import * as legacy20 from "../store.ts";
import * as legacy21 from "../write.ts";

const modules = [
  { path: "admission.ts", legacy: legacy0, names: ["enterExecutionAdmission","reserveExecutionAdmission"] },
  { path: "codec.ts", legacy: legacy1, names: ["executionAdmissionDecode","executionAdmissionEntry","executionAdmissionEventValue","executionAdmissionKey","executionAdmissionRow"] },
  { path: "command-inventory.ts", legacy: legacy2, names: [] },
  { path: "command-link.ts", legacy: legacy3, names: [] },
  { path: "command-proof.ts", legacy: legacy4, names: ["readExecutionCommandLinkProof"] },
  { path: "commands.ts", legacy: legacy5, names: ["createExecutionAdmissionCommandLink"] },
  { path: "context.ts", legacy: legacy6, names: [] },
  { path: "event.ts", legacy: legacy7, names: [] },
  { path: "evidence.ts", legacy: legacy8, names: ["appendExecutionAdmissionEvidence"] },
  { path: "finish.ts", legacy: legacy9, names: ["finishExecutionAdmission"] },
  { path: "index.ts", legacy: legacy10, names: ["AutomationStudioProjectExecutionAdmissionStore"] },
  { path: "inventory.ts", legacy: legacy11, names: ["readExecutionAdmissionInventory"] },
  { path: "migration.ts", legacy: legacy12, names: ["AUTOMATION_STUDIO_EXECUTION_ADMISSION_MIGRATION"] },
  { path: "mutation.ts", legacy: legacy13, names: ["mutateExecutionAdmission"] },
  { path: "proof.ts", legacy: legacy14, names: ["executionAdmissionEventDigest","verifyExecutionAdmissionEvent"] },
  { path: "release.ts", legacy: legacy15, names: ["releaseExecutionAdmission"] },
  { path: "rows.ts", legacy: legacy16, names: [] },
  { path: "scope.ts", legacy: legacy17, names: ["openExecutionAdmissionScope"] },
  { path: "snapshot.ts", legacy: legacy18, names: [] },
  { path: "state.ts", legacy: legacy19, names: ["executionAdmissionAncestors","executionAdmissionFrontier","executionAdmissionTouches","inspectExecutionAdmission","requireActiveExecutionEntry"] },
  { path: "store.ts", legacy: legacy20, names: ["AutomationStudioProjectExecutionAdmissionStore"] },
  { path: "write.ts", legacy: legacy21, names: ["writeExecutionAdmissionEvent"] }
];

it("retains every original execution-admission runtime export and exact binding", () => {
  for (const { path, legacy, names } of modules) {
    expect(Object.keys(legacy).sort(), path).toEqual(names);
    for (const [name, binding] of Object.entries(legacy)) {
      expect(binding, path + ":" + name).toBe(Reflect.get(canonical, name));
    }
  }
});

it("retains the original execution-admission nominal constructor and prototype", () => {
  const original: typeof canonical.AutomationStudioProjectExecutionAdmissionStore = legacy20.AutomationStudioProjectExecutionAdmissionStore;
  expect(original).toBe(canonical.AutomationStudioProjectExecutionAdmissionStore);
  expect(original.prototype).toBe(canonical.AutomationStudioProjectExecutionAdmissionStore.prototype);
});
