import { describe, expect, it } from "vitest";
import { clientGatewayOutboxKeep, clientGatewayOutboxLossMerge } from "../index.ts";
import { binding, stateUpdate } from "./messages.ts";

const own = binding("lineage.1", "project.1");
const entries = (sizes: number[]) => sizes.map((bytes) => ({ binding: own, message: stateUpdate(), bytes }));

describe("clientGatewayOutboxKeep", () => {
  it("keeps everything, with no loss, within both limits", () => {
    const all = entries([10, 20]);
    expect(clientGatewayOutboxKeep(all, { limit: 5, byteBudget: 30 })).toEqual({ kept: all, loss: undefined });
  });

  it("drops an entry alone over the budget wherever it sits, then the oldest past each limit", () => {
    const all = entries([5, 50, 10, 10, 20]);
    const { kept, loss } = clientGatewayOutboxKeep(all, { limit: 3, byteBudget: 35 });
    expect(kept).toEqual(all.slice(3));
    expect(loss).toEqual({ count: 3, byReason: { byte_budget: 2, count_limit: 1 } });
  });
});

describe("clientGatewayOutboxLossMerge", () => {
  it("adds reason by reason and answers undefined for no loss", () => {
    expect(clientGatewayOutboxLossMerge()).toBeUndefined();
    expect(clientGatewayOutboxLossMerge(undefined, { count: 0, byReason: {} })).toBeUndefined();
    expect(clientGatewayOutboxLossMerge(
      { count: 2, byReason: { count_limit: 2 } },
      undefined,
      { count: 3, byReason: { count_limit: 1, write_failed: 2 } }
    )).toEqual({ count: 5, byReason: { count_limit: 3, write_failed: 2 } });
  });
});
