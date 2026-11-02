import { expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import { IoRegistry } from "../../../../io/index.ts";
import { createAutomationGraphOptions, type AutomationNativeExecutionPort } from "../index.ts";
it("keeps ordered capabilities, only the bound authorized domain, and per-call native authorities", async () => {
  class Native implements AutomationNativeExecutionPort {
    #executions = 0;
    getRuntimeCapabilities() {
      return ["native", "io", "native"];
    }
    async execute() {
      this.#executions += 1;
      return { result: { outputs: { executions: this.#executions } }, logs: [] };
    }
    resolveActionEffect(_node: AutomationStudioFlowNode, values: Readonly<Record<string, unknown>> = {}) {
      return { effectClass: values.apply === false ? "state" as const : "commit" as const, permissionConsequences: [] };
    }
    resolveTargetRefresh() {
      return { kind: "absent" as const, reason: "no_refresh_declaration" as const };
    }
  }
  const native = new Native();
  const options = createAutomationGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: ["other", "device"], io: { io: new IoRegistry(), domainId: "device" }, nativeNodeRuntime: native });
  expect(options.runtimeCapabilities).toEqual(["policy-output", "io", "native"]);
  expect(options.authorizedDomainIds).toEqual(["device"]);
  const node = { id: "native", definitionId: "device.apply" };
  expect(options.resolveActionEffect?.(node, { apply: false })).toEqual({ effectClass: "state", permissionConsequences: [] });
  expect(options.resolveActionEffect?.(node, { apply: true })).toEqual({ effectClass: "commit", permissionConsequences: [] });
  expect(options.resolveTargetRefresh?.(node, {})).toEqual({ kind: "absent", reason: "no_refresh_declaration" });
  expect(await options.nativeNodeExecutor?.({ node, inputs: {} })).toMatchObject({ result: { outputs: { executions: 1 } } });
  const unbound = createAutomationGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: ["device"], io: { io: new IoRegistry(), domainId: null } });
  expect(unbound).not.toHaveProperty("authorizedDomainIds");
});
it("preserves the original host receiver and never reads or installs a classifier while composing options", () => {
  let reads = 0;
  class Host {
    capabilities: string[] = [];
    #observations = 0;
    observeRouteState() {
      this.#observations += 1;
      return { observations: this.#observations };
    }
  }
  const host = new Host();
  Object.defineProperty(host, "classifyLegacyStepAct", {
    enumerable: true, get: () => {
      reads += 1;
      throw new Error("classifier read during composition");
    }
  });
  const options = createAutomationGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: [], hostRuntime: host });
  expect(options.hostRuntime).toBe(host);
  expect(reads).toBe(0);
  expect(options).not.toHaveProperty("classifyLegacyStepAct");
  expect(options.hostRuntime?.observeRouteState?.({ projectId: "project", flowId: "flow" })).toEqual({ observations: 1 });
});
