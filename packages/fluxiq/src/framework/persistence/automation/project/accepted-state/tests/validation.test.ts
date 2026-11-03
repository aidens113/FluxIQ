import { describe, expect, it } from "vitest";
import { AutomationStudioAcceptedStateValidation as Validation, automationStudioAcceptedStateDigest } from "../index.ts";
import { snapshot } from "./fixtures.ts";

describe("staged complete project validation", () => {
  it("preserves >100 complete source documents and every owner/reference in the derived vector", () => {
    const input = snapshot(105), copy = Validation.snapshot(input, "project.1");
    expect(copy).toEqual(input); expect(copy.instructions[104]!.artifact.body).toContain("Unicode Ω");
    const vector = Validation.vector(copy, "epoch.1", 1);
    expect(vector.filter(item => item.kind === "instruction")).toHaveLength(105);
    expect(vector.filter(item => item.kind === "subflow")).toHaveLength(105);
    expect(vector.filter(item => item.kind === "settings")).toHaveLength(106);
    input.instructions[104]!.artifact.body = "Changed after preparation";
    expect(copy.instructions[104]!.artifact.body).not.toBe(input.instructions[104]!.artifact.body);
  });
  it.each(["json", "code", "global", "cross_project", "publication", "same_project_publication", "malformed_publication"])("refuses unsupported %s", kind => {
    const input = snapshot();
    if (kind === "json") Reflect.set(input, "storageAuthority", "json");
    if (kind === "code") input.flows[0]!.artifact.source = { mode: "code", moduleId: "module.1" };
    if (kind === "global") input.instructions[0]!.artifact.scope = { kind: "global" };
    if (kind === "cross_project") input.instructions[0]!.resource.scopes[0]!.projectId = "project.other";
    if (kind === "publication") Reflect.set(input.dependencyScope, "publications", "external");
    if (kind === "same_project_publication") input.flows[0]!.artifact.nodes[0]!.definitionId = "composite.flow.graph.000@1.0.0";
    if (kind === "malformed_publication") input.flows[0]!.artifact.nodes[0]!.metadata = { "fluxiq.callFlow": {} };
    expect(() => Validation.snapshot(input, "project.1")).toThrow(/staged_authority/);
  });
  it.each(["duplicate", "missing_body", "missing_member", "route_disagreement", "settings_disagreement", "subflow_approval", "missing_settings"])("refuses incomplete or conflicting %s", kind => {
    const input = snapshot();
    if (kind === "duplicate") input.instructions.push(structuredClone(input.instructions[0]!));
    if (kind === "missing_body") Reflect.deleteProperty(input.instructions[0]!.artifact, "body");
    if (kind === "missing_member") input.subflows = [];
    if (kind === "route_disagreement") input.routers[0]!.resource.routes[0]!.priority = 10;
    if (kind === "settings_disagreement") input.flows[0]!.artifact.executionDefaults = { timeoutMs: 99 };
    if (kind === "subflow_approval") input.subflows[0]!.resource.approvalOverride = "adaptive";
    if (kind === "missing_settings") Reflect.deleteProperty(input.flows[0]!, "settings");
    expect(() => Validation.snapshot(input, "project.1")).toThrow();
  });
  it("retains resolved object-backed source and refuses an unresolved SQL projection", () => {
    const input = snapshot(); input.instructions[0]!.resource.inlineBody = null; input.instructions[0]!.resource.bodyObjectId = "object.1";
    expect(Validation.snapshot(input, "project.1").instructions[0]!.artifact.body).toBe(input.instructions[0]!.artifact.body);
    input.instructions[0]!.resource.bodyObjectId = null;
    expect(() => Validation.snapshot(input, "project.1")).toThrow("instruction_source_missing");
  });
  it("hashes all source/settings/membership without sorting meaningful route arrays", () => {
    const input = snapshot(2), before = automationStudioAcceptedStateDigest(input).digest;
    const reordered = structuredClone(input); reordered.routers[0]!.artifact.rules.reverse();
    expect(automationStudioAcceptedStateDigest(reordered).digest).not.toBe(before);
    const changed = structuredClone(input); changed.instructions[0]!.artifact.body += " delta"; changed.instructions[0]!.resource.inlineBody = changed.instructions[0]!.artifact.body;
    expect(automationStudioAcceptedStateDigest(changed).digest).not.toBe(before);
    const removed = snapshot(1); expect(automationStudioAcceptedStateDigest(removed).digest).not.toBe(before);
    expect(automationStudioAcceptedStateDigest({ b: 1, a: 2 }).digest).toBe(automationStudioAcceptedStateDigest({ a: 2, b: 1 }).digest);
  });
  it("rejects non-JSON values, cycles, sparse arrays, invalid IDs/generations and a UTF8 payload over32MiB", () => {
    for (const value of [NaN, Infinity, undefined, new Date(), { value: undefined }, Array(1)]) expect(() => automationStudioAcceptedStateDigest(value)).toThrow();
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic; expect(() => automationStudioAcceptedStateDigest(cyclic)).toThrow();
    expect(() => Validation.id("x".repeat(201))).toThrow();
    for (const generation of [0, 1.1, Number.MAX_SAFE_INTEGER + 1]) expect(() => Validation.binding({ projectId: "project.1", epoch: "epoch.1", generation, digest: `sha256:${"a".repeat(64)}`, state: "staged" }, "project.1")).toThrow();
    expect(() => Validation.binding(Object.assign({ projectId: "project.1", epoch: "epoch.1", generation: 1, digest: `sha256:${"a".repeat(64)}`, state: "staged" as const }, { borrowed: true }), "project.1")).toThrow("binding_invalid");
    // 3 UTF8 bytes each: 12MiB characters is36MiB, although UTF16 character count is below32MiB.
    expect(() => automationStudioAcceptedStateDigest("€".repeat(12 * 1024 * 1024))).toThrow("payload_too_large");
  });
});
