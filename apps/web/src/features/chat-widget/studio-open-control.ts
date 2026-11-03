// The chat's "Open FluxIQ" control in this panel: a link to the Studio, for
// what the chat cannot answer itself (a permission ask that needs the PIN, a
// model key to add). The widget draws no PIN dialog; the Studio's conversation
// view does, so the link is the honest way to finish such a question.

import { createElement, type ChatOpenControl, type ChatOpenControlFactory } from "@fluxiq/ui-components";

/** Where the Studio opens on a project. The Studio page resolves the domain itself. */
function studioHref(projectId: string | undefined): string {
  return projectId ? `/programs/automation-studio?project=${encodeURIComponent(projectId)}` : "/programs/automation-studio";
}

export const studioOpenControl: ChatOpenControlFactory = (style): ChatOpenControl => {
  const element = createElement("a", {
    className: style.look === "small" ? "small-button open-fluxiq-link" : "link-button open-fluxiq-link",
    attrs: { href: studioHref(undefined), target: "_blank", rel: "noopener" }
  }, [style.label]);
  return {
    element,
    observe: (status) => element.setAttribute("href", studioHref(status.projectId))
  };
};
