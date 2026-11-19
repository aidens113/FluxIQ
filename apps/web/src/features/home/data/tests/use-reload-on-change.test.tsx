import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { Resource } from "../resource";
import { useReloadOnChange } from "../use-reload-on-change";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(initial: { resource: Resource<number>; revision: number }) {
  function Probe(props: { resource: Resource<number>; revision: number }) {
    useReloadOnChange(props.resource, props.revision);
    return null;
  }
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<Probe {...initial} />); });
  return { change: (next: { resource: Resource<number>; revision: number }) => act(() => tree.update(<Probe {...next} />)) };
}

describe("useReloadOnChange", () => {
  it("reads again each time the live source moves, and not for the revision the section loaded with", () => {
    const retry = vi.fn();
    const ready: Resource<number> = { state: "ready", data: 1, retry };
    const view = mount({ resource: ready, revision: 4 });
    expect(retry).not.toHaveBeenCalled();
    view.change({ resource: ready, revision: 4 });
    expect(retry).not.toHaveBeenCalled();
    view.change({ resource: ready, revision: 5 });
    expect(retry).toHaveBeenCalledTimes(1);
    view.change({ resource: ready, revision: 6 });
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it("does nothing while the section is still loading its first reading", () => {
    const view = mount({ resource: { state: "loading" }, revision: 1 });
    expect(() => view.change({ resource: { state: "loading" }, revision: 2 })).not.toThrow();
  });
});
