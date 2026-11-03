import { expect, it } from "vitest";
import * as canonical from "../../../../../../runtime/flow-authoring/execution/tools/index.ts";
import * as legacy0 from "../../bind-tools.ts";
import * as legacy1 from "../../forwarding/index.ts";
import * as legacy2 from "../auxiliary-calls.ts";
import * as legacy3 from "../auxiliary.ts";
import * as legacy4 from "../bind.ts";
import * as legacy5 from "../callback-context.ts";
import * as legacy6 from "../callback-scope.ts";
import * as legacy7 from "../create.ts";
import * as legacy8 from "../delegate.ts";
import * as legacy9 from "../descendant.ts";
import * as legacy10 from "../factory.ts";
import * as legacy11 from "../index.ts";
import * as legacy12 from "../inherit.ts";
import * as legacy13 from "../invoke.ts";
import * as legacy14 from "../observer.ts";
import * as legacy15 from "../options.ts";
import * as legacy16 from "../parking-port.ts";
import * as legacy17 from "../permission.ts";
import * as legacy18 from "../project.ts";
import * as legacy19 from "../request.ts";
import * as legacy20 from "../state.ts";
import * as legacy21 from "../with-callback-scope.ts";

const modules = [
  { path: "bind-tools.ts", legacy: legacy0, names: ["bindAutomationStudioObservedBuildTools"] },
  { path: "forwarding/index.ts", legacy: legacy1, names: ["AutomationStudioBuildToolAuxiliaryCalls","AutomationStudioBuildToolFactories","AutomationStudioBuildToolPermissions","inheritAutomationStudioBuildToolDescendant","inheritAutomationStudioBuildToolRequest","invokeAutomationStudioBuildToolAuxiliary","invokeAutomationStudioBuildToolCallback","invokeAutomationStudioBuildToolDelegate","observeAutomationStudioBuildToolParkingPort","withAutomationStudioBuildToolCallbackScope"] },
  { path: "tools/auxiliary-calls.ts", legacy: legacy2, names: ["AutomationStudioBuildToolAuxiliaryCalls"] },
  { path: "tools/auxiliary.ts", legacy: legacy3, names: ["invokeAutomationStudioBuildToolAuxiliary"] },
  { path: "tools/bind.ts", legacy: legacy4, names: ["bindAutomationStudioObservedBuildTools"] },
  { path: "tools/callback-context.ts", legacy: legacy5, names: ["AutomationStudioBuildToolCallbackContexts"] },
  { path: "tools/callback-scope.ts", legacy: legacy6, names: ["AutomationStudioBuildToolCallbackScope"] },
  { path: "tools/create.ts", legacy: legacy7, names: ["createAutomationStudioBuildToolObserver"] },
  { path: "tools/delegate.ts", legacy: legacy8, names: ["invokeAutomationStudioBuildToolDelegate"] },
  { path: "tools/descendant.ts", legacy: legacy9, names: ["inheritAutomationStudioBuildToolDescendant"] },
  { path: "tools/factory.ts", legacy: legacy10, names: ["AutomationStudioBuildToolFactories"] },
  { path: "tools/index.ts", legacy: legacy11, names: ["AutomationStudioBuildToolAuxiliaryCalls","AutomationStudioBuildToolCallbackScope","AutomationStudioBuildToolFactories","AutomationStudioBuildToolObserver","AutomationStudioBuildToolPermissions","AutomationStudioProjectBuildToolObservers","bindAutomationStudioObservedBuildTools","createAutomationStudioBuildToolObserver","inheritAutomationStudioBuildToolDescendant","inheritAutomationStudioBuildToolRequest","invokeAutomationStudioBuildToolAuxiliary","invokeAutomationStudioBuildToolCallback","invokeAutomationStudioBuildToolDelegate","observeAutomationStudioBuildToolParkingPort","withAutomationStudioBuildToolCallbackScope"] },
  { path: "tools/inherit.ts", legacy: legacy12, names: ["inheritAutomationStudioBuildToolRequest"] },
  { path: "tools/invoke.ts", legacy: legacy13, names: ["invokeAutomationStudioBuildToolCallback"] },
  { path: "tools/observer.ts", legacy: legacy14, names: ["AutomationStudioBuildToolObserver"] },
  { path: "tools/options.ts", legacy: legacy15, names: [] },
  { path: "tools/parking-port.ts", legacy: legacy16, names: ["observeAutomationStudioBuildToolParkingPort"] },
  { path: "tools/permission.ts", legacy: legacy17, names: ["AutomationStudioBuildToolPermissions"] },
  { path: "tools/project.ts", legacy: legacy18, names: ["AutomationStudioProjectBuildToolObservers"] },
  { path: "tools/request.ts", legacy: legacy19, names: ["AutomationStudioBuildToolRequests"] },
  { path: "tools/state.ts", legacy: legacy20, names: [] },
  { path: "tools/with-callback-scope.ts", legacy: legacy21, names: ["withAutomationStudioBuildToolCallbackScope"] }
];

it("retains every original tool and browser-forwarding export binding", () => {
  for (const { path, legacy, names } of modules) {
    expect(Object.keys(legacy).sort(), path).toEqual(names);
    for (const [name, binding] of Object.entries(legacy)) {
      expect(binding, path + ":" + name).toBe(Reflect.get(canonical, name));
    }
  }
});

it("retains the original observer constructor and private companion owner", () => {
  const original: typeof canonical.AutomationStudioBuildToolObserver = legacy14.AutomationStudioBuildToolObserver;
  expect(original).toBe(canonical.AutomationStudioBuildToolObserver);
  expect(original.prototype).toBe(canonical.AutomationStudioBuildToolObserver.prototype);
  expect(legacy19.AutomationStudioBuildToolRequests).toBe(canonical.AutomationStudioBuildToolRequests);
});
