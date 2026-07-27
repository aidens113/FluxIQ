import type { ComponentRegistry } from "../components";
import type { FrameworkResult } from "../core";
import type { FlowDocument, FlowEdge, FlowNodeContext, FlowState } from "../flows";
import {
  IoRegistry,
  type RuntimeInputs,
  type RuntimeOutputs,
  validateIoRequirements
} from "../io";

export type RuntimeMode = "idle" | "running" | "paused" | "completed" | "stopped" | "failed";

export type RuntimeSession = {
  id: string;
  mode: RuntimeMode;
  flow: FlowDocument;
  state: FlowState;
  lastResult?: FrameworkResult;
  message?: string;
};

export type RuntimeSessionOptions = {
  sessionId: string;
  flow: FlowDocument;
  variables?: Record<string, unknown>;
};

export function createRuntimeSession(options: RuntimeSessionOptions): RuntimeSession {
  return {
    id: options.sessionId,
    mode: "idle",
    flow: options.flow,
    state: {
      flowId: options.flow.id,
      currentNodeId: options.flow.start,
      variables: options.variables ?? {},
      tick: 0
    }
  };
}

export async function runCurrentNode(params: {
  session: RuntimeSession;
  components: ComponentRegistry;
  capabilities?: Record<string, unknown>;
  io?: IoRegistry;
  domainId?: string | null;
}): Promise<FrameworkResult> {
  const node = params.session.flow.nodes.find((item) => item.id === params.session.state.currentNodeId);
  if (!node) {
    params.session.mode = "failed";
    return { state: "failed", message: `Current node not found: ${params.session.state.currentNodeId}` };
  }

  const component = params.components.maybeGet(node.type);
  if (!component) {
    params.session.mode = "failed";
    return { state: "failed", message: `Component not registered: ${node.type}` };
  }

  const domainId = params.domainId ?? params.session.flow.domainId ?? null;
  const requirementParams: Parameters<typeof validateIoRequirements>[0] = {
    registry: params.io ?? emptyIoRegistry,
    domainId,
    source: component.spec.nodeType
  };
  if (component.spec.requiredInputs) {
    requirementParams.requiredInputs = component.spec.requiredInputs;
  }
  if (component.spec.requiredOutputs) {
    requirementParams.requiredOutputs = component.spec.requiredOutputs;
  }
  const ioIssues = validateIoRequirements(requirementParams);
  if (ioIssues.length > 0) {
    params.session.mode = "failed";
    const message = ioIssues.map((issue) => issue.message).join("; ");
    const result: FrameworkResult = { state: "failed", message, payload: { issues: ioIssues } };
    params.session.lastResult = result;
    return result;
  }

  params.session.mode = "running";
  params.session.state.tick += 1;
  const context: FlowNodeContext = {
    flow: params.session.flow,
    state: params.session.state,
    capabilities: params.capabilities ?? {}
  };
  if (params.io) {
    context.inputs = createRuntimeInputs(params.io, domainId);
    context.outputs = createRuntimeOutputs(params.io, domainId);
  }
  const result = await component.handler(
    context,
    node
  );
  params.session.lastResult = result;
  return result;
}

export type FlowStepResult = {
  result: FrameworkResult;
  previousNodeId: string;
  nextNodeId: string | null;
  terminal: boolean;
};

export async function stepFlow(params: {
  session: RuntimeSession;
  components: ComponentRegistry;
  capabilities?: Record<string, unknown>;
  io?: IoRegistry;
  domainId?: string | null;
}): Promise<FlowStepResult> {
  if (params.session.mode === "paused") {
    const result: FrameworkResult = { state: "rejected", message: "session_paused" };
    return {
      result,
      previousNodeId: params.session.state.currentNodeId,
      nextNodeId: params.session.state.currentNodeId,
      terminal: false
    };
  }

  if (params.session.mode === "completed" || params.session.mode === "stopped" || params.session.mode === "failed") {
    const result: FrameworkResult = { state: "rejected", message: `session_${params.session.mode}` };
    return {
      result,
      previousNodeId: params.session.state.currentNodeId,
      nextNodeId: null,
      terminal: true
    };
  }

  const previousNodeId = params.session.state.currentNodeId;
  const result = await runCurrentNode(params);
  if (result.state === "running") {
    return { result, previousNodeId, nextNodeId: previousNodeId, terminal: false };
  }

  if (result.state === "failed" || result.state === "timeout" || result.state === "cancelled" || result.state === "rejected") {
    const edge = chooseNextEdge(params.session.flow, previousNodeId, result.state);
    if (edge) {
      params.session.state.currentNodeId = edge.to;
      params.session.mode = "running";
      return { result, previousNodeId, nextNodeId: edge.to, terminal: false };
    }
    params.session.mode = result.state === "failed" ? "failed" : "stopped";
    setSessionMessage(params.session, result.message);
    return { result, previousNodeId, nextNodeId: null, terminal: true };
  }

  const edge = chooseNextEdge(params.session.flow, previousNodeId, result.state);
  if (!edge) {
    params.session.mode = "completed";
    setSessionMessage(params.session, result.message);
    return { result, previousNodeId, nextNodeId: null, terminal: true };
  }

  params.session.state.currentNodeId = edge.to;
  params.session.mode = "running";
  return { result, previousNodeId, nextNodeId: edge.to, terminal: false };
}

export async function runFlow(params: {
  session: RuntimeSession;
  components: ComponentRegistry;
  capabilities?: Record<string, unknown>;
  io?: IoRegistry;
  domainId?: string | null;
  maxSteps?: number;
}): Promise<RuntimeSession> {
  const maxSteps = Math.max(1, params.maxSteps ?? 1000);
  for (let step = 0; step < maxSteps; step += 1) {
    const result = await stepFlow(params);
    if (result.terminal || result.result.state === "running") {
      return params.session;
    }
  }
  params.session.mode = "failed";
  params.session.message = `max steps exceeded: ${maxSteps}`;
  params.session.lastResult = { state: "failed", message: params.session.message };
  return params.session;
}

export function chooseNextEdge(flow: FlowDocument, fromNodeId: string, resultState: string): FlowEdge | null {
  const candidates = flow.edges
    .filter((edge) => edge.from === fromNodeId && edgeMatchesResult(edge, resultState))
    .sort((left, right) => {
      const priority = (right.priority ?? 0) - (left.priority ?? 0);
      if (priority !== 0) return priority;
      const probability = (right.probability ?? 0) - (left.probability ?? 0);
      if (probability !== 0) return probability;
      return left.to.localeCompare(right.to);
    });
  return candidates[0] ?? null;
}

export function createRuntimeInputs(io: IoRegistry, domainId: string | null | undefined): RuntimeInputs {
  return {
    read: (inputId, params) => {
      const request = params ? { domainId: domainId ?? null, inputId, params } : { domainId: domainId ?? null, inputId };
      return io.readInput(request);
    },
    subscribe: (inputId, handler) => io.subscribeInput(domainId, inputId, handler)
  };
}

export function createRuntimeOutputs(io: IoRegistry, domainId: string | null | undefined): RuntimeOutputs {
  return {
    dispatch: (outputId, payload, metadata) => {
      const request = metadata
        ? { domainId: domainId ?? null, outputId, payload, metadata }
        : { domainId: domainId ?? null, outputId, payload };
      return io.dispatchOutput(request);
    },
    subscribe: (outputId, handler) => io.subscribeOutput(domainId, outputId, handler)
  };
}

function edgeMatchesResult(edge: FlowEdge, resultState: string): boolean {
  if (!edge.when) {
    return resultState === "success";
  }
  const states = Array.isArray(edge.when) ? edge.when : [edge.when];
  return states.includes(resultState) || states.includes("*");
}

function setSessionMessage(session: RuntimeSession, message: string | undefined): void {
  if (message === undefined) {
    delete session.message;
  } else {
    session.message = message;
  }
}

const emptyIoRegistry = new IoRegistry();
