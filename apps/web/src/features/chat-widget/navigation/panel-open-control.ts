// The chat's "Open FluxIQ" control in this panel: a button that goes to the
// screen where the question can be finished, in this window and never a new
// tab, named for where it goes: this panel is FluxIQ, so "Open FluxIQ" would say
// nothing. A model key to add goes to the Secret Keys program; a question only
// the Studio can show goes to the Studio's project.

import { createElement, type ChatOpenControl, type ChatOpenControlFactory } from "@fluxiq/ui-components";

const SECRET_KEYS_HREF = "/programs/secret-keys";

/** Where the Studio opens on a project. The Studio page resolves the domain itself. */
function studioHref(projectId: string | undefined): string {
  return projectId ? `/programs/automation-studio?project=${encodeURIComponent(projectId)}` : "/programs/automation-studio";
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
