import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../panel-shell", () => ({
  PROJECTS_CHANGED_EVENT: "fluxiq:projects-changed",
  notifyProjectsChanged: () => (globalThis as unknown as { window: EventTarget }).window.dispatchEvent(new Event("fluxiq:projects-changed"))
}));

import { useProjectsChangedSync } from "../use-projects-changed-sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const target = new EventTarget();
beforeEach(() => { vi.stubGlobal("window", Object.assign(target, {})); });
afterEach(() => { vi.unstubAllGlobals(); });

function mount(read: () => void) {
  let announce!: () => void;
  function Probe() {
    announce = useProjectsChangedSync(read);
    return null;
  }
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<Probe />); });
  return { announce: () => announce(), unmount: () => act(() => tree.unmount()) };
}

describe("the Projects list follows the shared projects signal", () => {
  it("reads again when a project is created elsewhere, with no reload", () => {
    const read = vi.fn();
    const view = mount(read);
    target.dispatchEvent(new Event("fluxiq:projects-changed"));
    expect(read).toHaveBeenCalledTimes(1);
    view.unmount();
  });
  it("does not read again for its own announcement, which would loop", () => {
    const read = vi.fn();
    const heard = vi.fn();
    target.addEventListener("fluxiq:projects-changed", heard);
    const view = mount(read);
    view.announce();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    target.removeEventListener("fluxiq:projects-changed", heard);
    view.unmount();
  });
  it("stops listening when the page closes", () => {
    const read = vi.fn();
    mount(read).unmount();
    target.dispatchEvent(new Event("fluxiq:projects-changed"));
    expect(read).not.toHaveBeenCalled();
  });
});
