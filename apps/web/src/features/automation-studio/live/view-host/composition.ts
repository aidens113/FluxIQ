import type { AutomationViewInstance } from "../../views/view-types";
import {
  automationStudioViewDefinition,
  isRetiredAutomationStudioViewId,
  resolveAutomationStudioView,
  type AutomationStudioViewId
} from "../../views/view-registry";
import {
  createAutomationViewHostRequest,
  type AutomationViewHostBindingMap,
  type AutomationViewHostKind
} from "../../views/view-host-types";
import { createAutomationWorkspaceViewSource } from "../../workspace/shell/view-source";
import type { AutomationWorkspaceViewEntry } from "../../workspace/shell/contracts";
import {
  type AutomationCanonicalViewHostInput,
  type AutomationPublishedViewRecord,
  type AutomationViewHostComposition,
  type AutomationViewHostCompositionOptions,
  type AutomationViewHostCompositionSnapshot,
  type AutomationViewHostPublicationResult,
  type AutomationViewHostRecovery
} from "./contracts";

const DEFAULT_BATCH_SIZE = 4;
const MAX_BATCH_SIZE = 32;
const DEFAULT_MAX_REQUESTED_VIEWS = 64;
const MAX_REQUESTED_VIEWS = 256;

type PlannedPublication = {
  canonicalId: AutomationStudioViewId;
  requestedId: string;
  input: AutomationCanonicalViewHostInput<AutomationStudioViewId>;
};

export function createAutomationViewHostComposition(
  options: AutomationViewHostCompositionOptions = {}
): AutomationViewHostComposition {
  const source = options.source ?? createAutomationWorkspaceViewSource();
  const batchSize = boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
  const maxRequestedViews = boundedInteger(
    options.maxRequestedViews,
    DEFAULT_MAX_REQUESTED_VIEWS,
    MAX_REQUESTED_VIEWS
  );
  const schedule = options.schedule ?? ((task: () => void) => queueMicrotask(task));
  const published = new Map<string, AutomationPublishedViewRecord>();
  let projectKey: string | null = null;
  let generation = 0;
  let disposed = false;

  function removeAllOwnedEntries(): number {
    let removed = 0;
    for (const viewId of published.keys()) {
      if (source.replace(viewId, null)) removed += 1;
    }
    published.clear();
    return removed;
  }

  function resetProject(nextProjectKey: string | null): number {
    generation += 1;
    projectKey = nextProjectKey;
    return removeAllOwnedEntries();
  }

  async function publishSnapshot(
    snapshot: AutomationViewHostCompositionSnapshot
  ): Promise<AutomationViewHostPublicationResult> {
    if (disposed) return emptyResult(generation, false, true);
    const projectChanged = projectKey !== snapshot.projectKey;
    let removed = projectChanged ? resetProject(snapshot.projectKey) : 0;
    generation += 1;
    const publicationGeneration = generation;
    const plan = planPublication(snapshot, maxRequestedViews);
    const desiredIds = new Set(plan.items.map((item) => item.requestedId));

    for (const viewId of published.keys()) {
      if (desiredIds.has(viewId)) continue;
      if (source.replace(viewId, null)) removed += 1;
      published.delete(viewId);
    }

    if (snapshot.projectKey === null) {
      return {
        ...emptyResult(publicationGeneration, projectChanged, false),
        removed,
        ignoredRequestedViews: plan.ignoredRequestedViews,
        recoveries: plan.recoveries
      };
    }

    const ordered = [...plan.items].sort(comparePublicationPriority);
    let cursor = 0;
    let publicationCount = 0;
    let reused = 0;

    return new Promise((resolve) => {
      const publishBatch = () => {
        if (disposed || generation !== publicationGeneration) {
          resolve({
            generation: publicationGeneration,
            projectChanged,
            cancelled: true,
            published: publicationCount,
            reused,
            removed,
            ignoredRequestedViews: plan.ignoredRequestedViews,
            recoveries: plan.recoveries
          });
          return;
        }
        const end = Math.min(cursor + batchSize, ordered.length);
        while (cursor < end) {
          const item = ordered[cursor++];
          if (!item) continue;
          const previous = published.get(item.requestedId);
          if (recordMatches(previous, item)) {
            reused += 1;
            continue;
          }
          const record = createPublishedRecord(item);
          published.set(item.requestedId, record);
          if (source.replace(item.requestedId, record.entry)) publicationCount += 1;
        }
        if (cursor < ordered.length) {
          schedule(publishBatch);
          return;
        }
        resolve({
          generation: publicationGeneration,
          projectChanged,
          cancelled: false,
          published: publicationCount,
          reused,
          removed,
          ignoredRequestedViews: plan.ignoredRequestedViews,
          recoveries: plan.recoveries
        });
      };
      publishBatch();
    });
  }

  return {
    source,
    getProjectKey: () => projectKey,
    publish: publishSnapshot,
    resetProject,
    dispose() {
      if (disposed) return;
      disposed = true;
      resetProject(null);
    }
  };
}

function planPublication(snapshot: AutomationViewHostCompositionSnapshot, limit: number): {
  items: PlannedPublication[];
  ignoredRequestedViews: number;
  recoveries: AutomationViewHostRecovery[];
} {
  const requested = snapshot.requestedViewIds ?? Object.keys(snapshot.views);
  const uniqueRequested = [...new Set(requested)];
  const accepted = uniqueRequested.slice(0, limit);
  const items: PlannedPublication[] = [];
  const recoveries: AutomationViewHostRecovery[] = [];

  for (const requestedId of accepted) {
    if (isRetiredAutomationStudioViewId(requestedId)) {
      const retired = resolveAutomationStudioView(requestedId);
      if (retired.status === "retired") {
        recoveries.push({ status: "retired", requestedId, replacementId: retired.replacementId });
      }
      continue;
    }
    const resolution = resolveAutomationStudioView(requestedId, { hasFlow: true });
    if (resolution.status === "retired") {
      recoveries.push({ status: "retired", requestedId, replacementId: resolution.replacementId });
      continue;
    }
    if (resolution.status === "unknown") {
      recoveries.push({ status: "unknown", requestedId });
      continue;
    }
    const input = snapshot.views[resolution.id] as
      | AutomationCanonicalViewHostInput<AutomationStudioViewId>
      | undefined;
    if (!input || input.activity === "unavailable") continue;
    if (resolution.migratedFrom) {
      recoveries.push({ status: "migrated", requestedId, canonicalId: resolution.id });
    }
    items.push({ canonicalId: resolution.id, requestedId, input });
  }

  return {
    items,
    ignoredRequestedViews: Math.max(0, uniqueRequested.length - accepted.length),
    recoveries
  };
}

function comparePublicationPriority(left: PlannedPublication, right: PlannedPublication): number {
  return activityPriority(left.input.activity) - activityPriority(right.input.activity);
}

function activityPriority(activity: AutomationCanonicalViewHostInput<AutomationStudioViewId>["activity"]): number {
  if (activity === "active") return 0;
  if (activity === "warm") return 1;
  return 2;
}

function recordMatches(
  previous: AutomationPublishedViewRecord | undefined,
  next: PlannedPublication
): boolean {
  return Boolean(
    previous
    && previous.canonicalId === next.canonicalId
    && previous.requestedId === next.requestedId
    && previous.input.model === next.input.model
    && previous.input.commands === next.input.commands
    && previous.input.label === next.input.label
    && previous.input.state === next.input.state
    && previous.input.bodyClassName === next.input.bodyClassName
  );
}

export function createAutomationCanonicalViewEntry<Id extends AutomationStudioViewId>(
  id: Id,
  input: AutomationCanonicalViewHostInput<Id>
): AutomationWorkspaceViewEntry {
  const item = {
    canonicalId: id,
    requestedId: id,
    input: input as unknown as AutomationCanonicalViewHostInput<AutomationStudioViewId>
  };
  return createPublishedRecord(item).entry;
}

function createPublishedRecord(item: PlannedPublication): AutomationPublishedViewRecord {
  const definition = automationStudioViewDefinition(item.canonicalId);
  if (!definition) throw new Error(`Missing canonical Automation Studio view: ${item.canonicalId}`);
  const kind = definition.kind;
  const view = {
    id: item.requestedId,
    label: item.input.label ?? definition.label,
    type: kind,
    icon: definition.icon,
    ...(item.input.state ? { state: item.input.state } : {})
  } as AutomationViewInstance & { type: typeof kind };
  const request = createBoundRequest(kind, view, item.input);
  return {
    canonicalId: item.canonicalId,
    requestedId: item.requestedId,
    kind,
    input: item.input,
    entry: {
      request,
      view,
      ...(item.input.bodyClassName ? { bodyClassName: item.input.bodyClassName } : {})
    }
  };
}

function createBoundRequest<Kind extends AutomationViewHostKind>(
  kind: Kind,
  view: AutomationViewInstance & { type: Kind },
  input: AutomationCanonicalViewHostInput<AutomationStudioViewId>
) {
  const binding = {
    model: input.model,
    commands: input.commands
  } as AutomationViewHostBindingMap[Kind];
  return createAutomationViewHostRequest(view, binding);
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(value!)));
}

function emptyResult(
  generation: number,
  projectChanged: boolean,
  cancelled: boolean
): AutomationViewHostPublicationResult {
  return {
    generation,
    projectChanged,
    cancelled,
    published: 0,
    reused: 0,
    removed: 0,
    ignoredRequestedViews: 0,
    recoveries: []
  };
}