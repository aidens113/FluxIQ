import { expect, it } from "vitest";
import * as canonical from "../../../../../../framework/persistence/project/command-ledger/index.ts";
import * as legacy0 from "../admission.ts";
import * as legacy1 from "../contracts.ts";
import * as legacy2 from "../index.ts";
import * as legacy3 from "../migration.ts";
import * as legacy4 from "../store.ts";

const modules = [
  { path: "admission.ts", legacy: legacy0, names: ["AutomationStudioCommandRunAdmission"] },
  { path: "contracts.ts", legacy: legacy1, names: ["AUTOMATION_STUDIO_COMMAND_SCAN_LIMIT","AUTOMATION_STUDIO_COMMAND_SCAN_PAGE"] },
  { path: "index.ts", legacy: legacy2, names: ["AUTOMATION_STUDIO_COMMAND_LEDGER_MIGRATION","AUTOMATION_STUDIO_COMMAND_SCAN_LIMIT","AUTOMATION_STUDIO_COMMAND_SCAN_PAGE","AutomationStudioCommandRunAdmission","AutomationStudioProjectCommandLedgerStore"] },
  { path: "migration.ts", legacy: legacy3, names: ["AUTOMATION_STUDIO_COMMAND_LEDGER_MIGRATION"] },
  { path: "store.ts", legacy: legacy4, names: ["AutomationStudioProjectCommandLedgerStore"] }
];

it("retains every original command-ledger runtime export and exact binding", () => {
  for (const { path, legacy, names } of modules) {
    expect(Object.keys(legacy).sort(), path).toEqual(names);
    for (const [name, binding] of Object.entries(legacy)) {
      expect(binding, path + ":" + name).toBe(Reflect.get(canonical, name));
    }
  }
});

it("retains the original command-ledger nominal constructor and prototype", () => {
  const original: typeof canonical.AutomationStudioProjectCommandLedgerStore = legacy4.AutomationStudioProjectCommandLedgerStore;
  expect(original).toBe(canonical.AutomationStudioProjectCommandLedgerStore);
  expect(original.prototype).toBe(canonical.AutomationStudioProjectCommandLedgerStore.prototype);
});
