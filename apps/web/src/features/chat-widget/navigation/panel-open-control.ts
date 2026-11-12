// The chat's "Open FluxIQ" control in this panel: a button that goes to the
// screen where the question can be finished, in this window and never a new
// tab, named for where it goes: this panel is FluxIQ, so "Open FluxIQ" would say
// nothing. A model key to add goes to the Keys page under Security; a question only
// the Studio can show goes to the project's Flows.

import { createElement, type ChatOpenControl, type ChatOpenControlFactory } from "@fluxiq/ui-components";

const SECRET_KEYS_HREF = "/security/keys";

/** Where a project's Flows open: the Flows screen, which reads `?project=`. */
function studioHref(projectId: string | undefined): string {
  return projectId ? `/flows?project=${encodeURIComponent(projectId)}` : "/flows";
}

/** `navigate` is the router's push, so the person stays in the panel. */
export function createPanelOpenControl(navigate: (href: string) => void): ChatOpenControlFactory {
  return (style): ChatOpenControl => {
    let projectId: string | undefined;
    const element = createElement("button", {
      className: style.look === "small" ? "small-button open-fluxiq-link" : "link-button open-fluxiq-link",
      attrs: { type: "button" }
    }, [style.purpose === "model-key" ? "Add a model key" : "Open the Studio"]);
    element.addEventListener("click", () => {
      if (style.canOpen && !style.canOpen()) return;
      navigate(style.purpose === "model-key" ? SECRET_KEYS_HREF : studioHref(projectId));
    });
    return { element, observe: (status) => void (projectId = status.projectId) };
  };
}
