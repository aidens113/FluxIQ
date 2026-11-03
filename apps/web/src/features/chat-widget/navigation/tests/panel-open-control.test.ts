// The chat's Open FluxIQ control in this panel goes to the screen where a
// question can be finished, through the router, in this window.

import { fake, withFakeDocument } from "@fluxiq/ui-components/testing";
import { describe, expect, it, vi } from "vitest";
import { createPanelOpenControl } from "../panel-open-control";

const status = (projectId?: string) => ({ connected: true, ownerKey: "k", recording: false, ...(projectId ? { projectId } : {}) });

describe("the panel's Open FluxIQ control", () => {
  it("takes a model key to the Secret Keys program, in place", async () => {
    await withFakeDocument(() => {
      const navigate = vi.fn();
      const control = createPanelOpenControl(navigate)({ label: "Open FluxIQ", look: "small", purpose: "model-key" });
      const button = fake(control.element);
      expect(button.textContent).toBe("Add a model key");
      expect(button.getAttribute("type")).toBe("button");
      expect(button.getAttribute("target")).toBeNull();
      button.dispatch("click");
      expect(navigate).toHaveBeenCalledWith("/programs/secret-keys");
    });
  });

  it("takes a question only the Studio can show to the Studio's project, never a new tab", async () => {
    await withFakeDocument(() => {
      const navigate = vi.fn();
      const control = createPanelOpenControl(navigate)({ label: "Open FluxIQ", look: "link", purpose: "ask" });
      control.observe(status("project one"));
      fake(control.element).dispatch("click");
      expect(fake(control.element).textContent).toBe("Open the Studio");
      expect(navigate).toHaveBeenCalledWith("/programs/automation-studio?project=project%20one");
      expect(fake(control.element).getAttribute("rel")).toBeNull();
      expect(fake(control.element).getAttribute("href")).toBeNull();
    });
  });

  it("goes to the Studio itself when no project is known, and does nothing when the chat says it may not", async () => {
    await withFakeDocument(() => {
      const navigate = vi.fn();
      let allowed = false;
      const control = createPanelOpenControl(navigate)({ label: "Open FluxIQ", look: "link", canOpen: () => allowed });
      fake(control.element).dispatch("click");
      expect(navigate).not.toHaveBeenCalled();
      allowed = true;
      fake(control.element).dispatch("click");
      expect(navigate).toHaveBeenCalledWith("/programs/automation-studio");
    });
  });
});
