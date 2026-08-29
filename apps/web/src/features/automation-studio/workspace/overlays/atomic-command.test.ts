import { describe, expect, it, vi } from "vitest";
import { createAtomicOverlayCommandGate } from "./atomic-command";

describe("atomic overlay command gate", () => {
  it("dispatches one frozen snapshot and suppresses duplicate confirmation", async () => {
    let resolveCommand!: () => void;
    const dispatch = vi.fn((command: Readonly<{ type: string; name: string }>) => {
      expect(Object.isFrozen(command)).toBe(true);
      return new Promise<void>((resolve) => { resolveCommand = resolve; });
    });
    const statuses: Array<{ pending: boolean; error: string | null }> = [];
    const gate = createAtomicOverlayCommandGate(dispatch, (status) => statuses.push(status));
    const command = { type: "project.create", name: "Checkout" };

    const first = gate.execute(command);
    const duplicate = await gate.execute({ ...command });
    command.name = "Changed after confirmation";
    resolveCommand();

    expect(await first).toBe(true);
    expect(duplicate).toBe(false);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0]).toEqual({ type: "project.create", name: "Checkout" });
    expect(statuses).toEqual([
      { pending: true, error: null },
      { pending: false, error: null }
    ]);
  });

  it("keeps command-specific failure local and permits retry", async () => {
    const dispatch = vi.fn()
      .mockRejectedValueOnce(new Error("PIN rejected"))
      .mockResolvedValueOnce(undefined);
    const statuses: Array<{ pending: boolean; error: string | null }> = [];
    const gate = createAtomicOverlayCommandGate(dispatch, (status) => statuses.push(status));

    expect(await gate.execute({ type: "hierarchy.delete" })).toBe(false);
    expect(statuses.at(-1)).toEqual({ pending: false, error: "PIN rejected" });
    expect(await gate.execute({ type: "hierarchy.delete" })).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});