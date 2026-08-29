"use client";

import type { ReactNode } from "react";
import {
  automationStudioViewDefinitionsList,
  type AutomationStudioViewDefinition
} from "./canonical-view-definitions";
import { automationStudioViewDefinition } from "./view-registry";
import type {
  AutomationViewHostActivity,
  AutomationViewHostBindingMap,
  AutomationViewHostKind,
  AutomationViewHostRequest
} from "./view-host-types";

export type AutomationViewHostRegistration<Kind extends AutomationViewHostKind> = {
  kind: Kind;
  createDataSelector(): (request: AutomationViewHostRequest<Kind>) => AutomationViewHostBindingMap[Kind]["model"];
  loadComponent(): (
    request: AutomationViewHostRequest<Kind>,
    activity: AutomationViewHostActivity,
    model: AutomationViewHostBindingMap[Kind]["model"]
  ) => ReactNode;
};

type ErasedViewHostRegistration = {
  kind: AutomationViewHostKind;
  createDataSelector(): (request: AutomationViewHostRequest) => unknown;
  loadComponent(): (request: AutomationViewHostRequest, activity: AutomationViewHostActivity, model: unknown) => ReactNode;
};

function registrationFromDefinition(definition: AutomationStudioViewDefinition): ErasedViewHostRegistration {
  const adapter = definition.host;
  return {
    kind: definition.kind,
    createDataSelector: () => (request) => adapter.select(request.binding as never),
    loadComponent: () => (request, activity, model) => adapter.render({
      model,
      commands: request.binding.commands,
      activity
    } as never)
  };
}

let canonicalRegistrationCache: ReadonlyMap<AutomationViewHostKind, ErasedViewHostRegistration> | null = null;

function canonicalRegistrations(): ReadonlyMap<AutomationViewHostKind, ErasedViewHostRegistration> {
  canonicalRegistrationCache ??= new Map(
    automationStudioViewDefinitionsList.map((definition) => [definition.kind, registrationFromDefinition(definition)])
  );
  return canonicalRegistrationCache;
}

const routineCompatibilityRegistration: ErasedViewHostRegistration = {
  kind: "routine",
  createDataSelector: () => () => ({}),
  loadComponent: () => () => (
    <section className="automation-project-empty">
      <strong>Legacy Routine is read-only</strong>
      <span>Migrate this project to canonical Flows. Routine orchestration is represented by ordinary Flow nodes and published composites.</span>
    </section>
  )
};

export function automationViewHostRegistration<Kind extends AutomationViewHostKind>(
  kind: Kind
): AutomationViewHostRegistration<Kind> | null {
  const registration = kind === "routine"
    ? routineCompatibilityRegistration
    : canonicalRegistrations().get(kind);
  return (registration as AutomationViewHostRegistration<Kind> | undefined) ?? null;
}

export function renderAutomationViewHostRequest(
  request: AutomationViewHostRequest,
  activity: AutomationViewHostActivity,
  model: unknown
): ReactNode {
  const registration = automationViewHostRegistration(request.kind);
  if (!registration) return null;
  return registration.loadComponent()(request as never, activity, model as never);
}

export type AutomationRegisteredViewHost = {
  definition: AutomationStudioViewDefinition;
  createDataSelector: ErasedViewHostRegistration["createDataSelector"];
  loadComponent: ErasedViewHostRegistration["loadComponent"];
};

export function automationRegisteredViewHost(value: string): AutomationRegisteredViewHost | null {
  const definition = automationStudioViewDefinition(value);
  if (!definition) return null;
  const registration = canonicalRegistrations().get(definition.kind);
  if (!registration) return null;
  return {
    definition,
    createDataSelector: registration.createDataSelector,
    loadComponent: registration.loadComponent
  };
}