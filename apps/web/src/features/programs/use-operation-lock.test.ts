import { describe, expect, it, vi } from "vitest";
import { OperationGate } from "./use-operation-lock";

describe("privileged operation gate", () => {
  it("rejects duplicate and competing submissions until the active operation settles", async () => {
    let finish!: () => void;
    const gate = new OperationGate();
    const task = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const changes: Array<string | null> = [];
    const first = gate.run("rotate-key", task, (value) => changes.push(value));
    await expect(gate.run("delete-key", task)).resolves.toBeUndefined();
    expect(task).toHaveBeenCalledTimes(1);
    expect(gate.activeOperation).toBe("rotate-key");
    finish();
    await first;
    expect(gate.activeOperation).toBeNull();
    expect(changes).toEqual(["rotate-key", null]);
  });
});
