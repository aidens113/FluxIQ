import { describe, expect, it } from "vitest";
import { ClientGatewayCommandContext as Context } from "../index.ts";

const owner = { projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId: "invocation.1", attemptId: "node.attempt.1", effectOrdinal: 0 };
describe("opaque local server command context", () => {
  it("refuses JSON copies, prototypes, wrong fields and model-like metadata", () => {
    const context = Context.issue(owner);
    expect(Context.owner(context)).toEqual(owner); expect(Object.isFrozen(Context.owner(context))).toBe(true);
    for (const fake of [JSON.parse(JSON.stringify(context)), owner, { context: owner }, Object.create(Context.prototype), null, undefined]) expect(() => Context.owner(fake)).toThrow("not_issued");
    expect(() => Context.issue({ ...owner, metadata: owner } as never)).toThrow();
  });
});
