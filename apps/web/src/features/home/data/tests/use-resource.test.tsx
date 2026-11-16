import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import type { Resource } from "../resource";
import { useResource } from "../use-resource";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(load: () => Promise<number>, options?: { enabled?: boolean }) {
  const seen: Array<Resource<number>> = [];
  function Probe() {
    seen.push(useResource(load, options));
    return null;
  }
  return { seen, render: () => act(async () => { create(<Probe />); }) };
}

describe("useResource", () => {
  it("loads once on mount, with no timer behind it", async () => {
    let loads = 0;
    const { seen, render } = mount(async () => ++loads);
    await render();
    expect(loads).toBe(1);
    expect(seen.at(-1)).toMatchObject({ state: "ready", data: 1 });
  });
  it("keeps the previous data, marked stale, when a retry fails", async () => {
    let fail = false;
    const { seen, render } = mount(async () => {
      if (fail) throw new Error("down");
      return 7;
    });
    await render();
    const ready = seen.at(-1) as Extract<Resource<number>, { state: "ready" }>;
    fail = true;
    await act(async () => ready.retry?.());
    expect(seen.at(-1)).toMatchObject({ state: "ready", data: 7, stale: true });
  });
  it("shows an error with a retry when the first read fails", async () => {
    const { seen, render } = mount(async () => { throw new Error("down"); });
    await render();
    expect(seen.at(-1)).toMatchObject({ state: "error" });
    expect((seen.at(-1) as { retry?: unknown }).retry).toBeTypeOf("function");
  });
  it("does not read while disabled", async () => {
    let loads = 0;
    const { seen, render } = mount(async () => ++loads, { enabled: false });
    await render();
    expect(loads).toBe(0);
    expect(seen.at(-1)).toEqual({ state: "loading" });
  });
});
