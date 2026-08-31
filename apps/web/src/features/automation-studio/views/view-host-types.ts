import type {
  AutomationCanonicalViewHostKind,
  AutomationViewHostBindingMap as CanonicalViewHostBindingMap
} from "./canonical-view-definitions";
import type { ReactNode } from "react";
import type { AutomationViewBinding, AutomationViewHostActivity } from "./view-definition-types";
import type { AutomationViewInstance } from "./view-types";
import { readyAutomationView, type AutomationViewReadiness } from "./view-readiness";

export type { AutomationViewBinding, AutomationViewHostActivity };
export type AutomationViewHostBindingMap = CanonicalViewHostBindingMap & {
  routine: AutomationViewBinding<Record<string, never>, Record<string, never>>;
};
export type AutomationViewHostKind = AutomationCanonicalViewHostKind | "routine";

export type AutomationBoundViewHostRequest<Kind extends AutomationViewHostKind = AutomationViewHostKind> = {
  [Candidate in Kind]: {
    kind: Candidate;
    view: AutomationViewInstance & { type: Candidate };
    binding: AutomationViewHostBindingMap[Candidate];
    readiness: AutomationViewReadiness<AutomationViewHostBindingMap[Candidate]["model"]>;
  };
}[Kind];

export type AutomationConnectedViewHostRequest<Kind extends AutomationViewHostKind = AutomationViewHostKind> = {
  [Candidate in Kind]: {
    kind: Candidate;
    view: AutomationViewInstance & { type: Candidate };
    connect(activity: AutomationViewHostActivity): ReactNode;
  };
}[Kind];

export type AutomationViewHostRequest<Kind extends AutomationViewHostKind = AutomationViewHostKind> =
  | AutomationBoundViewHostRequest<Kind>
  | AutomationConnectedViewHostRequest<Kind>;

export function createAutomationViewHostRequest<Kind extends AutomationViewHostKind>(
  view: AutomationViewInstance & { type: Kind },
  binding: AutomationViewHostBindingMap[Kind],
  readiness: AutomationViewReadiness<AutomationViewHostBindingMap[Kind]["model"]> = readyAutomationView(binding.model)
): AutomationBoundViewHostRequest<Kind> {
  return { kind: view.type, view, binding, readiness } as AutomationBoundViewHostRequest<Kind>;
}

export function createAutomationConnectedViewHostRequest<Kind extends AutomationViewHostKind>(
  view: AutomationViewInstance & { type: Kind },
  connect: AutomationConnectedViewHostRequest<Kind>["connect"]
): AutomationConnectedViewHostRequest<Kind> {
  return { kind: view.type, view, connect } as AutomationConnectedViewHostRequest<Kind>;
}
