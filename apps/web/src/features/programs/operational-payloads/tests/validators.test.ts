import { expect, it } from "vitest";
import { validateBackgroundRun, validateBackgroundRunPage, validateBackgroundSnapshot, validateComputeSnapshot, validateProductionSnapshot } from "../index";
const node = { id: "n", label: "", status: "future-status", domainIds: [], capabilities: [], lastHeartbeatMs: 0, metadata: { zero: 0, disabled: false } };
const command = { id: "c", targetComputeId: "n", kind: "future-kind", createdAtMs: 0 };
const lease = { id: "l", computeId: "n", holder: "", purpose: "", expiresAtMs: 0 };
const compute = { nodes: [node], commands: [command], leases: [lease] };
const task = { id: "t", name: "", queue: "", enabled: false, nextRunAtMs: null, intervalMs: 0, lastRunAtMs: 0, schedule: "" };
const background = { tasks: [task], scheduler: { running: false } };
const run = { id: "r", taskId: "t", status: "future-status", queuedAtMs: 0, startedAtMs: 0, finishedAtMs: 0, error: "", payload: false };
const page = { runs: [run], total: 1, limit: 50, offset: 0 };
const target = { id: "t", name: "", type: "future-type", domainId: null, metadata: { parameterSchema: null } };
const execution = { loop: 0, atMs: 0, ok: false, result: "external completion" };
const productionRun = { id: "r", name: "", status: "future-status", targetType: "future-type", loopsTotal: 0, loopsCompleted: 0, nextRunAtMs: null, executions: [execution], metadata: { message: false } };
const production = { targets: [target], runs: [productionRun] };

it.each([
 ["Compute", validateComputeSnapshot, compute], ["Background", validateBackgroundSnapshot, background], ["Background run", validateBackgroundRun, run], ["Background page", validateBackgroundRunPage, page], ["Production", validateProductionSnapshot, production]
] as const)("%s accepts optional/zero/false/custom string compatibility", (_name, validate, value) => expect(validate(value)).toBe(true));
it.each([undefined, null, [], true, "invalid"])("all snapshot guards reject non-record input: %j", value => { expect(validateComputeSnapshot(value)).toBe(false); expect(validateBackgroundSnapshot(value)).toBe(false); expect(validateProductionSnapshot(value)).toBe(false); });
it.each([
 { ...compute, nodes: [null] }, { ...compute, nodes: [{ ...node, domainIds: {} }] }, { ...compute, nodes: [{ ...node, capabilities: [null] }] },
 { ...compute, nodes: [{ ...node, label: {} }] }, { ...compute, nodes: [{ ...node, lastHeartbeatMs: Infinity }] }, { ...compute, nodes: [{ ...node, metadata: [] }] },
 { ...compute, commands: [null] }, { ...compute, commands: [{ ...command, kind: 7 }] }, { ...compute, commands: [{ ...command, error: {} }] },
 { ...compute, leases: [null] }, { ...compute, leases: [{ ...lease, purpose: {} }] }, { ...compute, leases: [{ ...lease, expiresAtMs: NaN }] }
])("Compute rejects an unsafe rendered member: %j", value => expect(validateComputeSnapshot(value)).toBe(false));
it.each([
 { ...background, tasks: [null] }, { ...background, tasks: [{ ...task, enabled: "false" }] }, { ...background, tasks: [{ ...task, name: {} }] },
 { ...background, tasks: [{ ...task, schedule: {} }] }, { ...background, tasks: [{ ...task, nextRunAtMs: NaN }] },
 { ...background, scheduler: {} }, { ...background, scheduler: "running" }, { ...background, scheduler: { running: 1 } }
])("Background rejects unsafe task/scheduler: %j", value => expect(validateBackgroundSnapshot(value)).toBe(false));
it.each([{ ...run, id: 17 }, { ...run, queuedAtMs: NaN }, { ...run, error: {} }, null, []])("Background run rejects unsafe detail: %j", value => expect(validateBackgroundRun(value)).toBe(false));
it.each([{ ...page, runs: [null] }, { ...page, runs: [{ ...run, id: 17 }] }, { ...page, total: -1 }, { ...page, limit: 49 }, { ...page, offset: 1.5 }])("Background page preserves bounded valid scalar policy: %j", value => expect(validateBackgroundRunPage(value)).toBe(false));
it.each([
 { ...production, targets: [null] }, { ...production, targets: [{ ...target, name: {} }] }, { ...production, targets: [{ ...target, domainId: 0 }] },
 { ...production, runs: [null] }, { ...production, runs: [{ ...productionRun, loopsCompleted: Infinity }] }, { ...production, runs: [{ ...productionRun, executions: {} }] },
 { ...production, runs: [{ ...productionRun, executions: [null] }] }, { ...production, runs: [{ ...productionRun, executions: [{ ...execution, ok: 0 }] }] },
 { ...production, runs: [{ ...productionRun, executions: [{ ...execution, error: {} }] }] }
])("Production rejects unsafe rendered target/run/execution: %j", value => expect(validateProductionSnapshot(value)).toBe(false));
it("empty collections and minimal unrendered omissions remain valid", () => {
 expect(validateComputeSnapshot({ nodes: [], commands: [], leases: [] })).toBe(true);
 expect(validateBackgroundSnapshot({ tasks: [], scheduler: { running: true } })).toBe(true);
 expect(validateBackgroundRunPage({ runs: [], total: 0, limit: 50, offset: 0 })).toBe(true);
 expect(validateProductionSnapshot({ targets: [], runs: [] })).toBe(true);
 expect(validateProductionSnapshot({ targets: [{ id: "t", name: "T", type: "task" }], runs: [{ id: "r", name: "R", status: "created" }] })).toBe(true);
});
it("does not inspect arbitrary metadata/results or replace parameter policy", () => {
 const privateData = Object.defineProperty({}, "privateValue", { enumerable: true, get() { throw new Error("must not inspect"); } });
 expect(validateComputeSnapshot({ ...compute, nodes: [{ ...node, metadata: privateData }] })).toBe(true);
 expect(validateBackgroundRun({ ...run, payload: privateData })).toBe(true);
 expect(validateProductionSnapshot({ targets: [{ ...target, metadata: { parameterSchema: { unsupported: true } } }], runs: [{ ...productionRun, executions: [{ ...execution, result: privateData }] }] })).toBe(true);
});
