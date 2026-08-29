import type {
  AutomationCanonicalViewHostKind,
  AutomationViewHostBindingMap as CanonicalViewHostBindingMap
} from "./canonical-view-definitions";
import type { AutomationViewBinding, AutomationViewHostActivity } from "./view-definition-types";
import type { AutomationViewInstance } from "./view-types";

export type { AutomationViewBinding, AutomationViewHostActivity };
export type AutomationViewHostBindingMap = CanonicalViewHostBindingMap & {
  routine: AutomationViewBinding<Record<string, never>, Record<string, never>>;
};
export type AutomationViewHostKind = AutomationCanonicalViewHostKind | "routine";

export type AutomationViewHostRequest<Kind extends AutomationViewHostKind = AutomationViewHostKind> = {
  [Candidate in Kind]: {
    kind: Candidate;
    view: AutomationViewInstance & { type: Candidate };
    binding: AutomationViewHostBindingMap[Candidate];
  };
}[Kind];

export function createAutomationViewHostRequest<Kind extends AutomationViewHostKind>(
  view: AutomationViewInstance & { type: Kind },
  binding: AutomationViewHostBindingMap[Kind]
): AutomationViewHostRequest<Kind> {
  return { kind: view.type, view, binding } as AutomationViewHostRequest<Kind>;
}