import { describe, expect, it } from "vitest";
import { automationCompositeCallMetadata } from "./GraphEditorViews";

describe("Automation Studio composite palette nodes", () => {
  it("creates an exact pinned Call Flow configuration with explicit bindings", () => {
    expect(automationCompositeCallMetadata({ id: "composite", version: "1.2.0", label: "Child", description: "Child", family: "public-flows", scope: "both", nodeType: "custom", source: { kind: "composite", flowId: "flow.child", version: "1.2.0" }, availability: { kind: "domain", domainId: "orders" }, inputs: [{ id: "request", label: "Request", valueType: "object" }], outputs: [{ id: "result", label: "Result", valueType: "object" }, { id: "error.failed", label: "Failed", valueType: "object", role: "error" }], parameters: [] })).toMatchObject({ "fluxiq.callFlow": { target: { flowId: "flow.child", version: "1.2.0", scope: { kind: "domain", domainId: "orders" } }, inputBindings: [{ targetPortId: "request", valueKey: "request" }], outputBindings: [{ targetPortId: "result", valueKey: "result" }], errorBindings: [{ targetPortId: "failed", valueKey: "error.failed" }] } });
  });
});
