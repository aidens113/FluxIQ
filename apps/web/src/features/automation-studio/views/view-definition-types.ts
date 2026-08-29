import { createElement, type ComponentType, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { AutomationViewType } from "./view-types";

export type AutomationStudioViewRegion = "main" | "right" | "bottom";
export type AutomationStudioViewGroup = "Flow" | "Evidence" | "Workspace";
export type AutomationStudioViewRequirement = "hasProject" | "hasFlow" | "hasRecording" | "hasSelection";
export type AutomationStudioViewAvailability = Record<AutomationStudioViewRequirement, boolean>;
export type AutomationViewDataIntensity = "light" | "paged" | "virtualized" | "graph";
export type AutomationViewScope = "project" | "flow" | "subflow" | "recording" | "selection";

export type AutomationViewFunctionalityContract<Id extends string = string> = {
  id: Id;
  purpose: string;
  scope: readonly AutomationViewScope[];
  summaryData: readonly string[];
  detailData: readonly string[];
  dataIntensity: AutomationViewDataIntensity;
  states: { loading: boolean; empty: boolean; error: boolean; stale: boolean; narrow: boolean };
};

export type AutomationViewHostActivity = {
  active: boolean;
  activeRef: { current: boolean };
  keepMounted: boolean;
};

export type AutomationViewBinding<Model extends object, Commands extends object> = {
  model: Model;
  commands: Commands;
};

export type AutomationViewHostAdapter<Model extends object, Commands extends object> = {
  select(binding: AutomationViewBinding<Model, Commands>): Model;
  render(input: AutomationViewBinding<Model, Commands> & { activity: AutomationViewHostActivity }): ReactNode;
};

type CommandKey<Props> = {
  [Key in keyof Props]: Key extends `on${string}` | "setSelection" ? Key : never;
}[keyof Props];

export type ComponentViewBinding<Props extends object, HostKey extends keyof Props = never> =
  AutomationViewBinding<Omit<Props, CommandKey<Props> | HostKey>, Pick<Props, CommandKey<Props>>>;

export function defineAutomationViewHost<Model extends object, Commands extends object>(
  render: (input: AutomationViewBinding<Model, Commands> & { activity: AutomationViewHostActivity }) => ReactNode
): AutomationViewHostAdapter<Model, Commands> {
  return { select: (binding) => binding.model, render };
}

export function defineComponentAutomationViewHost<Props extends object, HostKey extends keyof Props = never>(
  resolveComponent: () => ComponentType<Props>,
  activityProps?: (activity: AutomationViewHostActivity) => Pick<Props, HostKey>
): AutomationViewHostAdapter<
  ComponentViewBinding<Props, HostKey>["model"],
  ComponentViewBinding<Props, HostKey>["commands"]
> {
  return defineAutomationViewHost((input) => createElement(resolveComponent(), {
    ...input.model,
    ...input.commands,
    ...(activityProps ? activityProps(input.activity) : {})
  } as Props));
}

export type AutomationStudioViewDefinitionInput<
  Id extends string,
  Kind extends AutomationViewType,
  Model extends object,
  Commands extends object
> = {
  id: Id;
  aliases: readonly string[];
  kind: Kind;
  label: string;
  icon: LucideIcon;
  group: AutomationStudioViewGroup;
  region: AutomationStudioViewRegion;
  allowedRegions: readonly AutomationStudioViewRegion[];
  scope: string;
  requires?: AutomationStudioViewRequirement;
  isAvailable(context: AutomationStudioViewAvailability): boolean;
  addable: boolean;
  lifecycle: { sleepUntilActivated: boolean; keepMounted: "warm" };
  cache: {
    schemaVersion: number;
    migrateSavedState?: (state: Readonly<Record<string, unknown>>, fromVersion: number) => Record<string, unknown>;
  };
  functionality: AutomationViewFunctionalityContract<Id>;
  host: AutomationViewHostAdapter<Model, Commands>;
};

export function defineAutomationStudioViews<
  const Definitions extends Record<string, AutomationStudioViewDefinitionInput<string, AutomationViewType, object, object>>
>(definitions: Definitions): Definitions {
  return definitions;
}

export type HostBindingOf<Definition> = Definition extends { host: AutomationViewHostAdapter<infer Model, infer Commands> }
  ? AutomationViewBinding<Model, Commands>
  : never;