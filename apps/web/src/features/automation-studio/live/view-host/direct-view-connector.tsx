"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentType
} from "react";
import type {
  AutomationProjectDataState,
  AutomationProjectDataStore
} from "../../stores/project-data-store";
import type { AutomationRuntimeStatusStore, AutomationRuntimeStatusState } from "../../stores/runtime-status-store";
import type { AutomationSelectionState, AutomationSelectionStore } from "../../stores/selection-store";
import type { ScopedExternalStore } from "../../stores/external-store";
import {
  automationQueryScope,
  automationQuerySelector,
  type AutomationProjectQuery,
  type AutomationProjectQueryStore,
  type AutomationQuerySnapshot
} from "../../stores/project-query-store";
import type { AutomationStudioViewId } from "../../views/view-registry";
import { AutomationViewBoundary } from "../../views/AutomationViewBoundary";
import { automationViewHostRegistration, renderAutomationViewHostRequest } from "../../views/view-host-registry";
import {
  createAutomationViewHostRequest,
  type AutomationBoundViewHostRequest,
  type AutomationViewHostActivity
} from "../../views/view-host-types";
import type { AutomationViewInstance } from "../../views/view-types";
import {
  readyAutomationView,
  type AutomationViewReadiness,
  type AutomationViewRequestToken
} from "../../views/view-readiness";
import type { AutomationCanonicalViewHostInput, CanonicalViewHostKind } from "./contracts";

type ModelFor<Id extends AutomationStudioViewId> = AutomationCanonicalViewHostInput<Id>["model"];
type CommandsFor<Id extends AutomationStudioViewId> = AutomationCanonicalViewHostInput<Id>["commands"];

export type AutomationDirectViewConnectorStores = {
  projectData: AutomationProjectDataStore;
  queries: AutomationProjectQueryStore;
  runtimeStatus: AutomationRuntimeStatusStore;
  selection: AutomationSelectionStore;
};

export type AutomationDirectViewConnectorState = {
  projectData: AutomationProjectDataState;
  runtimeStatus: AutomationRuntimeStatusState;
  selection: AutomationSelectionState;
};

export type AutomationDirectViewConnectorConfig<Id extends AutomationStudioViewId, Scope> = {
  id: Id;
  placeholder(scope: Scope): ModelFor<Id>;
  projectScopes(scope: Scope): readonly string[];
  runtimeScopes?(scope: Scope): readonly string[];
  selectionScopes?(scope: Scope): readonly string[];
  selectModel(state: AutomationDirectViewConnectorState, scope: Scope, query: AutomationQuerySnapshot | null): ModelFor<Id>;
  createModelSelector?(): AutomationDirectViewConnectorConfig<Id, Scope>["selectModel"];
  activationKey?(
    state: AutomationDirectViewConnectorState,
    scope: Scope,
    model: ModelFor<Id>
  ): string;
  onActive?(
    state: AutomationDirectViewConnectorState,
    scope: Scope,
    model: ModelFor<Id>
  ): void | (() => void);
  query?(scope: Scope): AutomationProjectQuery | null;
  isEmpty?(model: ModelFor<Id>, scope: Scope): boolean;
};

export type AutomationDirectViewConnectorProps<Id extends AutomationStudioViewId, Scope> = {
  activity: AutomationViewHostActivity;
  commands: CommandsFor<Id>;
  loadQuery?: (query: AutomationProjectQuery) => void | Promise<void>;
  projectGeneration: number;
  scope: Scope;
  stores: AutomationDirectViewConnectorStores;
  view: AutomationViewInstance & { type: CanonicalViewHostKind<Id> };
};

/**
 * Creates one view-owned connector. Config and selectors are captured once at
 * module initialization; callers pass only that view's scope and commands.
 */
export function createAutomationDirectViewConnector<Id extends AutomationStudioViewId, Scope>(
  config: AutomationDirectViewConnectorConfig<Id, Scope>
): ComponentType<AutomationDirectViewConnectorProps<Id, Scope>> {
  assertAutomationDirectViewConnectorConfig(config);
  function DirectViewConnector(props: AutomationDirectViewConnectorProps<Id, Scope>) {
    const selectModel = useMemo(
      () => config.createModelSelector?.() ?? config.selectModel,
      []
    );
    const active = props.activity.active;
    const scopes = useMemo(
      () => active ? config.projectScopes(props.scope) : emptyScopes,
      [active, props.scope]
    );
    const query = useMemo(
      () => active ? config.query?.(props.scope) ?? null : null,
      [active, props.scope]
    );
    const querySnapshot = useAutomationDirectViewQuery(props.stores.queries, query, active);
    const runtimeRevision = useAutomationScopedRevision(
      props.stores.runtimeStatus,
      active ? config.runtimeScopes?.(props.scope) ?? emptyScopes : emptyScopes,
      active
    );
    const selectionRevision = useAutomationScopedRevision(
      props.stores.selection,
      active ? config.selectionScopes?.(props.scope) ?? emptyScopes : emptyScopes,
      active
    );
    const model = useAutomationScopedProjectSelection(
      props.stores,
      scopes,
      selectModel,
      props.scope,
      querySnapshot,
      active,
      config.placeholder,
      runtimeRevision + ":" + selectionRevision
    );
    const activeModelRef = useRef(model);
    activeModelRef.current = model;

    useEffect(() => {
      if (
        !active
        || !query
        || !props.loadQuery
        || querySnapshot?.freshness !== "missing"
        || querySnapshot.loading
      ) return;
      void props.loadQuery(query);
    }, [active, props.loadQuery, query, querySnapshot?.freshness, querySnapshot?.loading]);

    const readiness = useMemo(
      () => resolveAutomationDirectViewReadiness({
        model,
        projectGeneration: props.projectGeneration,
        query: querySnapshot,
        empty: config.isEmpty?.(model, props.scope) ?? false
      }),
      [model, props.projectGeneration, props.scope, querySnapshot]
    );
    const activationKey = active && config.onActive
      ? `${props.projectGeneration}:${config.activationKey?.({
        projectData: props.stores.projectData.getState(),
        runtimeStatus: props.stores.runtimeStatus.getState(),
        selection: props.stores.selection.getState()
      }, props.scope, model) ?? config.id}`
      : null;
    useEffect(() => {
      if (!active || !config.onActive) return;
      return config.onActive({
        projectData: props.stores.projectData.getState(),
        runtimeStatus: props.stores.runtimeStatus.getState(),
        selection: props.stores.selection.getState()
      }, props.scope, activeModelRef.current);
    }, [active, activationKey, props.scope, props.stores]);
    const request = useMemo<AutomationBoundViewHostRequest>(
      () => createAutomationViewHostRequest(
        props.view as never,
        { model, commands: props.commands } as never,
        readiness as never
      ) as AutomationBoundViewHostRequest,
      [model, props.commands, props.view, readiness]
    );
    const registration = automationViewHostRegistration(request.kind);
    if (!registration) return null;
    return (
      <AutomationViewBoundary
        readiness={readiness}
        render={(readyModel) => {
          const readyRequest: AutomationBoundViewHostRequest = readyModel === request.binding.model
            ? request
            : { ...request, binding: { ...request.binding, model: readyModel } } as AutomationBoundViewHostRequest;
          return renderAutomationViewHostRequest(
            readyRequest,
            props.activity,
            registration.selectData(readyRequest as never)
          );
        }}
        view={props.view}
      />
    );
  }

  DirectViewConnector.displayName = `AutomationDirectViewConnector(${config.id})`;
  return memo(DirectViewConnector) as ComponentType<AutomationDirectViewConnectorProps<Id, Scope>>;
}

function assertAutomationDirectViewConnectorConfig<Id extends AutomationStudioViewId, Scope>(
  config: AutomationDirectViewConnectorConfig<Id, Scope>
): void {
  if (typeof config.projectScopes !== "function") {
    throw new TypeError(`Automation Studio connector ${config.id} projectScopes must be a function.`);
  }
  for (const [name, value] of [
    ["runtimeScopes", config.runtimeScopes],
    ["selectionScopes", config.selectionScopes]
  ] as const) {
    if (value !== undefined && typeof value !== "function") {
      throw new TypeError(`Automation Studio connector ${config.id} ${name} must be a function.`);
    }
  }
}

export function createAutomationDirectViewConnection<Id extends AutomationStudioViewId, Scope>(
  Connector: ComponentType<AutomationDirectViewConnectorProps<Id, Scope>>,
  props: Omit<AutomationDirectViewConnectorProps<Id, Scope>, "activity">
) {
  return (activity: AutomationViewHostActivity) => <Connector {...props} activity={activity} />;
}

function useAutomationScopedProjectSelection<Scope, Selection>(
  stores: AutomationDirectViewConnectorStores,
  scopes: readonly string[],
  selector: (state: AutomationDirectViewConnectorState, scope: Scope, query: AutomationQuerySnapshot | null) => Selection,
  connectorScope: Scope,
  query: AutomationQuerySnapshot | null,
  active: boolean,
  placeholder: (scope: Scope) => Selection,
  relatedRevision: string
): Selection {
  const selectorRef = useRef(selector);
  const scopeRef = useRef(connectorScope);
  const queryRef = useRef(query);
  selectorRef.current = selector;
  scopeRef.current = connectorScope;
  queryRef.current = query;
  const retainedSelection = useRef<{ initialized: boolean; value: Selection }>({
    initialized: false,
    value: undefined as Selection
  });
  if (!retainedSelection.current.initialized) {
    retainedSelection.current = { initialized: true, value: placeholder(connectorScope) };
  }
  const scopeKey = scopes.join("\u001f");
  const subscribe = useCallback((listener: () => void) => {
    if (!active) return () => undefined;
    const unsubscribes = scopes.map((scope) => stores.projectData.subscribe(listener, scope));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [active, scopeKey, stores.projectData]);
  const getRevision = useCallback(
    () => active ? scopes.map((scope) => stores.projectData.getRevision(scope)).join(":") : "dormant",
    [active, scopeKey, stores.projectData]
  );
  const revision = useSyncExternalStore(subscribe, getRevision, getRevision);
  return useMemo(
    () => {
      if (!active) return retainedSelection.current.value;
      const selected = selectorRef.current({
        projectData: stores.projectData.getState(),
        runtimeStatus: stores.runtimeStatus.getState(),
        selection: stores.selection.getState()
      }, scopeRef.current, queryRef.current);
      retainedSelection.current = { initialized: true, value: selected };
      return selected;
    },
    [active, query, relatedRevision, revision, stores]
  );
}

function useAutomationScopedRevision<State>(
  store: ScopedExternalStore<State>,
  scopes: readonly string[],
  active: boolean
): string {
  const scopeKey = scopes.join("\u001f");
  const subscribe = useCallback((listener: () => void) => {
    if (!active) return () => undefined;
    const unsubscribes = scopes.map((scope) => store.subscribe(listener, scope));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [active, scopeKey, store]);
  const getSnapshot = useCallback(
    () => active ? scopes.map((scope) => store.getRevision(scope)).join(":") : "dormant",
    [active, scopeKey, store]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useAutomationDirectViewQuery(
  store: AutomationProjectQueryStore,
  query: AutomationProjectQuery | null,
  active: boolean
): AutomationQuerySnapshot | null {
  const selector = useMemo(() => query ? automationQuerySelector(query) : null, [query]);
  const scope = query ? automationQueryScope(query) : "query:none";
  const subscribe = useCallback(
    (listener: () => void) => active && query ? store.subscribe(listener, scope) : () => undefined,
    [active, query, scope, store]
  );
  const empty = useRef<AutomationQuerySnapshot | null>(null);
  const getSnapshot = useCallback(
    () => active && selector ? selector(store.getState()) : empty.current,
    [active, selector, store]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const emptyScopes = Object.freeze([]) as readonly string[];

export function resolveAutomationDirectViewReadiness<Model>(input: {
  model: Model;
  projectGeneration: number;
  query: AutomationQuerySnapshot | null;
  empty: boolean;
}): AutomationViewReadiness<Model> {
  if (!input.query) return readyAutomationView(input.model);
  const token: AutomationViewRequestToken = {
    projectGeneration: input.projectGeneration,
    requestToken: input.query.updatedAt ?? 0
  };
  if (input.query.error && input.query.freshness === "missing") {
    return { status: "error", token, error: new Error(input.query.error) };
  }
  if (input.query.freshness === "missing" || (input.query.loading && input.query.ids.length === 0)) {
    return { status: "loading", token };
  }
  if (input.query.freshness === "stale" || input.query.loading || input.query.error) {
    return {
      status: "stale-ready",
      data: input.model,
      token,
      ...(input.query.error ? { error: new Error(input.query.error) } : {})
    };
  }
  if (input.empty) return { status: "empty", token };
  return { status: "ready", data: input.model, token };
}
