import { readFileSync } from "node:fs";
import { GitBranch } from "lucide-react";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  AdaptationsViewHostCommands,
  AdaptationsViewHostModel
} from "../adaptations/adaptation-host";
import type {
  InstructionsViewHostCommands,
  InstructionsViewHostModel
} from "../instructions/instruction-host";
import type {
  RouterViewHostCommands,
  RouterViewHostModel
} from "../router/router-host";
import type { RuntimeViewHostCommands, RuntimeViewHostModel } from "../runtime/runtime-host";
import type {
  SettingsViewHostCommands,
  SettingsViewHostModel
} from "../settings/settings-host";
import type {
  SubflowsViewHostCommands,
  SubflowsViewHostModel
} from "../subflows/subflow-host";
import { automationViewHostRegistration } from "./view-host-registry";
import {
  createAutomationViewHostRequest,
  type AutomationViewBinding,
  type AutomationViewHostBindingMap
} from "./view-host-types";

describe("Automation Studio direct domain host bindings", () => {
  it("maps each extracted domain to its own explicit model and command contract", () => {
    expectTypeOf<AutomationViewHostBindingMap["router"]>()
      .toEqualTypeOf<AutomationViewBinding<RouterViewHostModel, RouterViewHostCommands>>();
    expectTypeOf<AutomationViewHostBindingMap["subflows"]>()
      .toEqualTypeOf<AutomationViewBinding<SubflowsViewHostModel, SubflowsViewHostCommands>>();
    expectTypeOf<AutomationViewHostBindingMap["instructions"]>()
      .toEqualTypeOf<AutomationViewBinding<InstructionsViewHostModel, InstructionsViewHostCommands>>();
    expectTypeOf<AutomationViewHostBindingMap["settings"]>()
      .toEqualTypeOf<AutomationViewBinding<SettingsViewHostModel, SettingsViewHostCommands>>();
    expectTypeOf<AutomationViewHostBindingMap["adaptations"]>()
      .toEqualTypeOf<AutomationViewBinding<AdaptationsViewHostModel, AdaptationsViewHostCommands>>();
    expectTypeOf<AutomationViewHostBindingMap["runtime"]>()
      .toEqualTypeOf<AutomationViewBinding<RuntimeViewHostModel, RuntimeViewHostCommands>>();
  });

  it("selects only the registered domain model and keeps commands out of selector data", () => {
    const model: RouterViewHostModel = {
      projectId: "project-1",
      flow: { flowId: "flow-1" },
      initialRouter: { rules: [] },
      initialSubflows: []
    };
    const commands: RouterViewHostCommands = {
      onCreateSubflow: () => undefined
    };
    const request = createAutomationViewHostRequest(
      { id: "router", label: "Router", type: "router", icon: GitBranch },
      { model, commands }
    );
    const registration = automationViewHostRegistration("router");

    expect(registration?.selectData(request)).toBe(model);
    expect(registration?.selectData(request)).not.toBe(commands);
  });

  it("does not create data selectors in the React host render path", () => {
    const hostSource = readFileSync(new URL("./ViewHost.tsx", import.meta.url), "utf8");
    const registrySource = readFileSync(new URL("./view-host-registry.tsx", import.meta.url), "utf8");

    expect(hostSource).not.toContain("createDataSelector");
    expect(hostSource).toContain("registration.selectData(readyRequest)");
    expect(hostSource.indexOf("registration.selectData(readyRequest)"))
      .toBeGreaterThan(hostSource.indexOf("render={(readyModel)"));
    expect(registrySource).not.toContain("createDataSelector");
  });

  it("keeps transport and compatibility component prop inference outside the registry contract", () => {
    const typesSource = readFileSync(new URL("./view-host-types.ts", import.meta.url), "utf8");
    const registrySource = readFileSync(new URL("./view-host-registry.tsx", import.meta.url), "utf8");
    const hostSource = readFileSync(new URL("./ViewHost.tsx", import.meta.url), "utf8");
    const directHostSources = [typesSource, registrySource, hostSource].join("\n");

    expect(directHostSources).not.toMatch(/useProgramApi|useProgramTransport|program-api/);
    expect(typesSource).not.toMatch(
      /ComponentProps<typeof Automation(?:Adaptations|Instructions|FlowMap|FlowSettings|Runs|Runtime|Subflows)Workspace>/
    );
    expect(registrySource).not.toMatch(
      /registerView\("(?:adaptations|instructions|router|runs|runtime|settings|subflows)", \(request/
    );
  });
});
